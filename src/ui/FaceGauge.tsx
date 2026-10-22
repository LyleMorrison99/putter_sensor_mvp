import type { Putt } from '../store/sessions';
import { faceTone } from './format';

// Horizontal face-angle scale. Closed left, open right, +/-1 deg band shaded.
// The latest putt is the big marker; the ones before it fade out behind.
const RANGE = 4;

export function FaceGauge({ putts, latest }: { putts: Putt[]; latest: Putt | null }) {
  const W = 320, H = 64, pad = 14, mid = W / 2;
  const x = (f: number) => mid + (Math.max(-RANGE, Math.min(RANGE, f)) / RANGE) * (mid - pad);
  const band = x(1) - x(-1);
  const trail = putts.filter((p) => p.good && p !== latest).slice(-10);

  return (
    <svg className="gauge" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Face angle scale">
      <rect x={x(-1)} y={14} width={band} height={28} rx={6} className="gauge-band" />
      <line x1={pad} x2={W - pad} y1={28} y2={28} className="gauge-axis" />
      {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1={t === 0 ? 10 : 22} y2={t === 0 ? 46 : 34} className={t === 0 ? 'gauge-zero' : 'gauge-tick'} />
      ))}
      {trail.map((p, i) => (
        <circle key={`${p.n}-${p.at}`} cx={x(p.face)} cy={28} r={4} className="gauge-trail" style={{ opacity: 0.15 + (0.45 * (i + 1)) / trail.length }} />
      ))}
      {latest && (
        <g key={`${latest.n}-${latest.at}-${latest.face}`} className="gauge-mark-in">
          <circle cx={x(latest.face)} cy={28} r={9} className={`gauge-mark tone-${faceTone(latest.face, latest.good)}`} />
          {Math.abs(latest.face) > RANGE && (
            <text x={x(latest.face)} y={13} textAnchor="middle" className="gauge-over">{latest.face > 0 ? '›' : '‹'}</text>
          )}
        </g>
      )}
      <text x={pad} y={60} className="gauge-label">closed</text>
      <text x={W - pad} y={60} textAnchor="end" className="gauge-label">open</text>
      <text x={mid} y={60} textAnchor="middle" className="gauge-label">0°</text>
    </svg>
  );
}
