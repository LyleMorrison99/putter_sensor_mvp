export const fmtFace = (v: number | null | undefined, dp = 1) =>
  v == null ? '–' : `${v > 0.05 ? '+' : v < -0.05 ? '−' : ''}${Math.abs(v).toFixed(dp)}°`;

export const fmtNum = (v: number | null | undefined, dp = 1) => (v == null ? '–' : v.toFixed(dp));

export const fmtPct = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v * 100)}%`);

// Right-handed convention from the firmware: + = open.
export function faceLabel(face: number, good: boolean): string {
  if (!good) return 'Check';
  if (face > 1) return 'Open';
  if (face < -1) return 'Closed';
  return 'Square';
}

// Colour by size of miss, not direction: direction is in the sign and label.
export function faceTone(face: number, good: boolean): 'good' | 'warn' | 'bad' | 'muted' {
  if (!good) return 'muted';
  const a = Math.abs(face);
  if (a <= 1) return 'good';
  if (a <= 2) return 'warn';
  return 'bad';
}

export const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
