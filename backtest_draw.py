#!/usr/bin/env python3
"""
Backtest the "Draw mechanism" formula against recent Ethereum blocks.

Formula (from the draw's rules screen):
    winning_entry = (int(last_8_hex_chars_of_block_hash, 16) % total_entries) + 1

Example from the screenshot:
    block hash ...6dac2b65 -> 0x6dac2b65 = 1,839,999,845
    (1,839,999,845 % 4,999,999) + 1 = 214

What this script does:
  1. Fetches the last N block hashes from an Ethereum JSON-RPC endpoint
     (or reads them from a file with --hashes-file).
  2. Applies the formula to each block and writes the results to a CSV.
  3. Runs a statistical analysis: uniformity tests, repeats, and the exact
     per-ticket win probability implied by the formula (modulo bias).

Only the Python standard library is used.

Usage:
    python3 backtest_draw.py                         # last 100 blocks, 4,999,999 entries
    python3 backtest_draw.py -n 500 -t 2500000
    python3 backtest_draw.py --rpc https://eth.llamarpc.com
    python3 backtest_draw.py --hashes-file hashes.txt  # one 0x... hash per line, offline
    python3 backtest_draw.py --self-test
"""

import argparse
import csv
import json
import math
import sys
import urllib.request
from collections import Counter

DEFAULT_RPC = "https://ethereum-rpc.publicnode.com"
DEFAULT_TOTAL_ENTRIES = 4_999_999
HEX_SPACE = 16 ** 8  # 8 hex chars -> 2^32 possible values


# --------------------------------------------------------------------------- #
# Formula
# --------------------------------------------------------------------------- #
def winning_entry(block_hash: str, total_entries: int) -> tuple[str, int, int]:
    """Return (last8_hex, decimal, winning_entry) for a block hash."""
    last8 = block_hash.lower().removeprefix("0x")[-8:]
    decimal = int(last8, 16)
    return last8, decimal, (decimal % total_entries) + 1


# --------------------------------------------------------------------------- #
# Data fetching
# --------------------------------------------------------------------------- #
def rpc_call(rpc_url: str, payload):
    req = urllib.request.Request(
        rpc_url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "draw-backtest/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def fetch_blocks(rpc_url: str, count: int, batch_size: int = 50) -> list[tuple[int, str]]:
    """Fetch (block_number, block_hash) for the latest `count` blocks, oldest first."""
    latest = int(rpc_call(rpc_url, {"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []})["result"], 16)
    numbers = list(range(latest - count + 1, latest + 1))
    blocks = []
    for i in range(0, len(numbers), batch_size):
        chunk = numbers[i:i + batch_size]
        batch = [
            {"jsonrpc": "2.0", "id": n, "method": "eth_getBlockByNumber", "params": [hex(n), False]}
            for n in chunk
        ]
        resp = rpc_call(rpc_url, batch)
        if isinstance(resp, dict):  # some endpoints reject batches with a single error object
            raise RuntimeError(f"RPC batch error: {resp}")
        by_id = {r["id"]: r for r in resp}
        for n in chunk:
            r = by_id.get(n)
            if not r or "result" not in r or r["result"] is None:
                raise RuntimeError(f"Missing block {n}: {r}")
            blocks.append((n, r["result"]["hash"]))
    return blocks


def read_hashes_file(path: str) -> list[tuple[int, str]]:
    """Read hashes from a file: either 'hash' or 'block_number,hash' per line."""
    blocks = []
    with open(path) as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.replace(";", ",").split(",")]
            if len(parts) >= 2:
                blocks.append((int(parts[0]), parts[1]))
            else:
                blocks.append((i, parts[0]))
    return blocks


# --------------------------------------------------------------------------- #
# Statistics helpers (stdlib only)
# --------------------------------------------------------------------------- #
def chi2_sf(x: float, k: int) -> float:
    """Survival function (p-value) of the chi-square distribution, k degrees of freedom."""
    # Regularized upper incomplete gamma Q(k/2, x/2)
    a, x = k / 2.0, x / 2.0
    if x <= 0:
        return 1.0
    if x < a + 1:  # series for P, return 1 - P
        term = total = 1.0 / a
        n = a
        for _ in range(1000):
            n += 1
            term *= x / n
            total += term
            if abs(term) < abs(total) * 1e-15:
                break
        return max(0.0, 1.0 - total * math.exp(-x + a * math.log(x) - math.lgamma(a)))
    # continued fraction for Q
    b, c, d = x + 1 - a, 1e300, 1.0 / (x + 1 - a)
    h = d
    for i in range(1, 1000):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        d = 1e-300 if abs(d) < 1e-300 else d
        c = b + an / c
        c = 1e-300 if abs(c) < 1e-300 else c
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1) < 1e-15:
            break
    return math.exp(-x + a * math.log(x) - math.lgamma(a)) * h


def ks_uniform(values: list[float]) -> tuple[float, float]:
    """One-sample Kolmogorov-Smirnov test against U(0,1). Returns (D, approx p-value)."""
    xs = sorted(values)
    n = len(xs)
    d = max(max((i + 1) / n - x, x - i / n) for i, x in enumerate(xs))
    # Asymptotic Kolmogorov distribution with Stephens' small-sample correction
    t = (math.sqrt(n) + 0.12 + 0.11 / math.sqrt(n)) * d
    p = 2 * sum((-1) ** (j - 1) * math.exp(-2 * j * j * t * t) for j in range(1, 101))
    return d, min(1.0, max(0.0, p))


def chi2_buckets(values: list[float], buckets: int) -> tuple[float, int, float, list[int]]:
    counts = [0] * buckets
    for v in values:
        counts[min(int(v * buckets), buckets - 1)] += 1
    expected = len(values) / buckets
    stat = sum((c - expected) ** 2 / expected for c in counts)
    return stat, buckets - 1, chi2_sf(stat, buckets - 1), counts


def modulo_bias(total_entries: int) -> dict:
    """Exact win probability per ticket given 2^32 equally likely hex values."""
    q, r = divmod(HEX_SPACE, total_entries)
    # Values 0..r-1 occur q+1 times -> entries 1..r ; remaining entries occur q times
    return {
        "full_cycles": q,
        "favored_range": (1, r) if r else None,
        "favored_count": r,
        "favored_prob": (q + 1) / HEX_SPACE,
        "unfavored_range": (r + 1, total_entries) if r < total_entries else None,
        "unfavored_count": total_entries - r,
        "unfavored_prob": q / HEX_SPACE,
        "uniform_prob": 1 / total_entries,
    }


# --------------------------------------------------------------------------- #
# Analysis / report
# --------------------------------------------------------------------------- #
def analyze(rows: list[dict], total_entries: int) -> None:
    n = len(rows)
    entries = [r["winning_entry"] for r in rows]
    norm = [(e - 0.5) / total_entries for e in entries]  # map to (0,1)
    hex_norm = [(r["decimal"] + 0.5) / HEX_SPACE for r in rows]

    print("\n" + "=" * 72)
    print(f"BACKTEST RESULTS  ({n} blocks, total entries = {total_entries:,})")
    print("=" * 72)
    print(f"{'block':>10}  {'last8':>8}  {'decimal':>13}  {'winning entry':>13}")
    for r in rows:
        print(f"{r['block']:>10}  {r['last8']:>8}  {r['decimal']:>13,}  {r['winning_entry']:>13,}")

    print("\n" + "-" * 72)
    print("DESCRIPTIVE STATS")
    print("-" * 72)
    mean = sum(entries) / n
    sd = math.sqrt(sum((e - mean) ** 2 for e in entries) / max(1, n - 1))
    exp_mean = (total_entries + 1) / 2
    exp_sd = math.sqrt((total_entries ** 2 - 1) / 12)
    print(f"min / max winning entry : {min(entries):,} / {max(entries):,}")
    print(f"mean (expected)         : {mean:,.0f}  ({exp_mean:,.0f} if uniform)")
    print(f"std dev (expected)      : {sd:,.0f}  ({exp_sd:,.0f} if uniform)")
    dupes = {e: c for e, c in Counter(entries).items() if c > 1}
    p_any_dup = 1 - math.prod((total_entries - i) / total_entries for i in range(n))
    shown = dict(Counter(dupes).most_common(10))
    print(f"repeated winning entries: {len(dupes)} {shown if dupes else ''}{' ...' if len(dupes) > 10 else ''}"
          f"  (chance of >=1 repeat if uniform: {p_any_dup:.4%})")

    print("\n" + "-" * 72)
    print("UNIFORMITY TESTS  (p < 0.05 would suggest non-random structure)")
    print("-" * 72)
    buckets = max(2, min(20, n // 5))  # keep >= 5 expected per bucket
    stat, dof, p, counts = chi2_buckets(norm, buckets)
    width = total_entries / buckets
    scale = min(1.0, 50 / max(counts))  # keep bars at most 50 chars wide
    print(f"Chi-square, {buckets} equal ticket ranges: chi2={stat:.2f}, dof={dof}, p={p:.4f}")
    for i, c in enumerate(counts):
        lo, hi = int(i * width) + 1, int((i + 1) * width)
        print(f"  {lo:>9,} - {hi:>9,} : {'#' * round(c * scale)} {c}")
    d, p_ks = ks_uniform(norm)
    print(f"Kolmogorov-Smirnov on winning entries : D={d:.4f}, p={p_ks:.4f}")
    d, p_ks_hex = ks_uniform(hex_norm)
    print(f"Kolmogorov-Smirnov on raw hex values  : D={d:.4f}, p={p_ks_hex:.4f}")
    last_char = Counter(r["last8"][-1] for r in rows)
    stat_c = sum((last_char.get(h, 0) - n / 16) ** 2 / (n / 16) for h in "0123456789abcdef")
    print(f"Chi-square on final hex digit (16 bins): chi2={stat_c:.2f}, dof=15, p={chi2_sf(stat_c, 15):.4f}")

    # Serial correlation between consecutive draws
    if n > 2:
        a, b = norm[:-1], norm[1:]
        ma, mb = sum(a) / len(a), sum(b) / len(b)
        cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
        var = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
        rho = cov / var if var else 0.0
        print(f"Lag-1 autocorrelation   : {rho:+.4f}  (|rho| > {2 / math.sqrt(n):.3f} would be notable)")

    print("\n" + "-" * 72)
    print("WHICH TICKET HAS THE HIGHEST CHANCE NEXT?")
    print("-" * 72)
    mb = modulo_bias(total_entries)
    print(f"2^32 = {HEX_SPACE:,} hex values spread over {total_entries:,} entries "
          f"= {mb['full_cycles']} full cycles + {mb['favored_count']:,} leftover.")
    if mb["favored_range"] and mb["unfavored_range"]:
        lo, hi = mb["favored_range"]
        ulo, uhi = mb["unfavored_range"]
        edge = mb["favored_prob"] / mb["unfavored_prob"] - 1
        print(f"  Entries {lo:,} - {hi:,} ({mb['favored_count']:,} tickets): "
              f"P(win) = {mb['full_cycles'] + 1}/2^32 = {mb['favored_prob']:.10e}")
        print(f"  Entries {ulo:,} - {uhi:,} ({mb['unfavored_count']:,} tickets): "
              f"P(win) = {mb['full_cycles']}/2^32 = {mb['unfavored_prob']:.10e}")
        print(f"  -> Any ticket in {lo:,} - {hi:,} is (jointly) the highest-probability choice,")
        print(f"     but the edge is only {edge:.4%} relative "
              f"(~1 in {1 / mb['favored_prob']:,.0f} vs ~1 in {1 / mb['unfavored_prob']:,.0f}).")
    else:
        print("  total_entries divides 2^32 evenly -> every ticket has exactly the same chance.")

    print("\nWhy past results don't help:")
    print("  * Each block hash is a Keccak-256 output of a new block header; consecutive")
    print("    hashes are independent, so previous winners carry no information about the next.")
    if p > 0.05 and p_ks > 0.05:
        print("  * The tests above found no departure from uniform randomness in this sample.")
    else:
        print("  * A test above flagged p < 0.05. With several tests on a small sample this")
        print("    happens by chance ~5% of the time per test; re-run with more blocks (-n 1000+)")
        print("    before reading anything into it.")
    print("  * 'Hot' or 'cold' numbers, ranges or digits are not predictive. The only real")
    print("    structural difference between tickets is the tiny modulo bias shown above.")
    print("  * Note: total entries usually changes per draw; re-run with -t <entries> for the")
    print("    draw you care about, as the favored range shifts with it.")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def self_test() -> None:
    h = "0xbb1b9a30fcf0575ee2c9224eb05455e0757b2b0118071f7ef0943ea26dac2b65"
    last8, dec, entry = winning_entry(h, 4_999_999)
    assert (last8, dec, entry) == ("6dac2b65", 1_839_999_845, 214), (last8, dec, entry)
    print(f"Self-test OK: block #26215391 -> {last8} -> {dec:,} -> winning entry {entry} (matches screenshot)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-n", "--blocks", type=int, default=100, help="number of recent blocks (default 100)")
    ap.add_argument("-t", "--total-entries", type=int, default=DEFAULT_TOTAL_ENTRIES,
                    help=f"total eligible entries (default {DEFAULT_TOTAL_ENTRIES:,})")
    ap.add_argument("--rpc", default=DEFAULT_RPC, help=f"Ethereum JSON-RPC URL (default {DEFAULT_RPC})")
    ap.add_argument("--hashes-file", help="read hashes from file instead of RPC ('hash' or 'block,hash' per line)")
    ap.add_argument("-o", "--output", default="backtest_results.csv", help="CSV output path")
    ap.add_argument("--self-test", action="store_true", help="verify formula against the screenshot and exit")
    args = ap.parse_args()

    self_test()
    if args.self_test:
        return 0

    if args.hashes_file:
        blocks = read_hashes_file(args.hashes_file)
    else:
        print(f"Fetching last {args.blocks} blocks from {args.rpc} ...")
        try:
            blocks = fetch_blocks(args.rpc, args.blocks)
        except Exception as e:
            print(f"ERROR fetching blocks: {e}\nTry another endpoint with --rpc, "
                  "e.g. https://eth.llamarpc.com or https://cloudflare-eth.com", file=sys.stderr)
            return 1

    rows = []
    for number, h in blocks:
        last8, dec, entry = winning_entry(h, args.total_entries)
        rows.append({"block": number, "hash": h, "last8": last8, "decimal": dec, "winning_entry": entry})

    with open(args.output, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows to {args.output}")

    analyze(rows, args.total_entries)
    return 0


if __name__ == "__main__":
    sys.exit(main())
