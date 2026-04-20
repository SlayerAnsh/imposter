import Link from "next/link";

export default function Landing() {
  return (
    <main>
      <h1>imposter</h1>
      <p>
        Browser-based Mafia party game. One device hosts, others join with a
        room code. Roles, night actions, and voting run in the app — no
        narrator required.
      </p>
      <div className="imp-row" style={{ marginTop: 24 }}>
        <Link href="/host" className="imp-btn imp-btn-primary imp-btn-lg">
          Host a room
        </Link>
        <Link href="/join" className="imp-btn imp-btn-lg">
          Join a room
        </Link>
      </div>
      <div style={{ marginTop: 32, fontSize: 14, color: "var(--muted)" }}>
        <p>
          Gameplay runs peer-to-peer over WebRTC. The server only helps peers
          find each other — it never sees roles or votes.
        </p>
      </div>
    </main>
  );
}
