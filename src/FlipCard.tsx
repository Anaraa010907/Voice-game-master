import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

/**
 * A card that starts face down and is turned over by hand: drag it sideways and it follows the
 * finger in 3D; let go past half way and it lands face up (or back). A plain tap flips it too.
 */
export default function FlipCard({ front, back, className = '', autoRevealMs, onReveal, onTurn }: {
  front: ReactNode; back: ReactNode; className?: string;
  /** Turns itself over after this long if the player has not (so a phase timer never strands them). */
  autoRevealMs?: number;
  /** Called once, the first time the face shows. */
  onReveal?: () => void;
  /** Called whenever the card settles, with whether the face is up. */
  onTurn?: (faceUp: boolean) => void;
}) {
  const [angle, setAngle] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; start: number; width: number; moved: boolean; last: number; lastX: number } | null>(null);
  const revealed = useRef(false);
  const angleRef = useRef(0);
  angleRef.current = angle;
  const faceUp = Math.abs(Math.round(angle / 180)) % 2 === 1;

  const settle = (target: number) => {
    setDragging(false);
    setTilt(0);
    setAngle(target);
    const up = Math.abs(Math.round(target / 180)) % 2 === 1;
    onTurn?.(up);
    if (up && !revealed.current) { revealed.current = true; onReveal?.(); }
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  useEffect(() => {
    if (!autoRevealMs) return;
    const timer = window.setTimeout(() => { if (!revealed.current && !drag.current) settleRef.current(180); }, autoRevealMs);
    return () => window.clearTimeout(timer);
  }, [autoRevealMs]);

  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const width = event.currentTarget.getBoundingClientRect().width || 300;
    drag.current = { x: event.clientX, y: event.clientY, start: angleRef.current, width, moved: false, last: performance.now(), lastX: event.clientX };
    setDragging(true);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) current.moved = true;
    // A full card width of drag turns it 200°, so half a swipe is enough to flip.
    setAngle(current.start + (dx / current.width) * 200);
    setTilt(Math.max(-14, Math.min(14, (-dy / current.width) * 40)));
    current.last = performance.now();
    current.lastX = event.clientX;
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    const now = angleRef.current;
    if (!current.moved) { settle(Math.round(now / 180) * 180 + 180); return; }
    // A quick flick carries on in its direction even if it did not reach half way.
    const velocity = (event.clientX - current.lastX) / Math.max(1, performance.now() - current.last);
    const base = Math.round(now / 180) * 180;
    const flick = Math.abs(velocity) > 0.6 && base === Math.round(current.start / 180) * 180 ? Math.sign(velocity) * 180 : 0;
    settle(base + flick);
  };

  const shine = (((angle % 360) + 360) % 360) / 360;
  return <div className={`flip-card ${className} ${dragging ? 'is-dragging' : ''} ${faceUp ? 'is-face-up' : 'is-face-down'}`}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; settle(Math.round(angleRef.current / 180) * 180); }}
    onClick={(event) => event.stopPropagation()} role="button" aria-label={faceUp ? 'Картыг буцааж эргүүлэх' : 'Картыг эргүүлж харах'}>
    <div className="flip-card-inner" style={{ transform: `rotateX(${tilt}deg) rotateY(${angle}deg)`, ['--shine' as string]: shine } as CSSProperties}>
      <div className="flip-card-face flip-card-back">{back}</div>
      <div className="flip-card-face flip-card-front">{front}</div>
    </div>
  </div>;
}
