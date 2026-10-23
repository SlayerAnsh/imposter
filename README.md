# imposter
## backtest_draw.py

Backtests the draw formula `(int(last 8 hex of block hash, 16) % total_entries) + 1`
on the last N Ethereum blocks, then analyzes the results.

```
python3 backtest_draw.py                    # last 100 blocks, 4,999,999 entries
python3 backtest_draw.py -n 1000 -t 2500000 --rpc https://eth.llamarpc.com
python3 backtest_draw.py --hashes-file hashes.txt   # offline: 'hash' or 'block,hash' per line
```
