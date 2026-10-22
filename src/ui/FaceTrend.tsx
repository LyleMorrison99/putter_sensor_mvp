import type { Putt } from '../store/sessions';
import { faceTone } from './format';

// Face angle by putt number for one session; the +/-1 band is the target.
export function FaceTrend({ putts }: { putts: Putt[] }) {
  const W = 340, H = 150, l = 30, r = 8, t = 10, b = 22;
  const lim = Math.max(3, Math.ceil(Math.max(0, ...putts.filter((p) => p.good).map((p) => Math.abs(p.face)))));
  const n = Math.max(putts.length, 2);
  const x = (i: number) => l + (i / (n - 1)) * (W - l - r);
  const y = (f: number) => t + ((lim - Math.max(-lim, Math.min(lim, f))) / (2 * lim)) * (H - t - b);
  const ticks = [-lim, -Math.round(lim / 2), 0, Math.round(lim / 2), lim];

  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Face angle for each putt">
      <rect x={l} y={y(1)} width={W - l - r} height={y(-1) - y(1)} className="gauge-band" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={l} x2={W - r} y1={y(v)} y2={y(v)} className={v === 0 ? 'trend-zero' : 'trend-grid'} />
          <text x={l - 6} y={y(v) + 4} textAnchor="end" className="gauge-label">{v > 0 ? `+${v}` : v}</text>
        </g>
      ))}
      <text x={l} y={H - 4} className="gauge-label">putt 1</text>
      <text x={W - r} y={H - 4} textAnchor="end" className="gauge-label">{putts.length}</text>
      {putts.map((p, i) => (
        p.good
          ? <circle key={`${p.n}-${p.at}`} cx={x(i)} cy={y(p.face)} r={3.5} className={`trend-dot tone-${faceTone(p.face, p.good)}`} />
          : <circle key={`${p.n}-${p.at}`} cx={x(i)} cy={y(p.face)} r={3} className="trend-dot-bad" />
      ))}
    </svg>
  );
}
