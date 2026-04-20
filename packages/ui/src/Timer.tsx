import { useEffect, useState } from "react";

export interface TimerProps {
  endsAt?: number;
  onExpire?: () => void;
}

export function Timer({ endsAt, onExpire }: TimerProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  useEffect(() => {
    if (!endsAt) return;
    if (now >= endsAt) onExpire?.();
  }, [now, endsAt, onExpire]);

  if (!endsAt) return null;
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <span className="imp-timer">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}
