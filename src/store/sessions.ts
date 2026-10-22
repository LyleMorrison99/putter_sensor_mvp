import type { PuttPacket } from '../ble/protocol';

export interface Putt {
  n: number;            // device putt number
  at: number;           // ms epoch, when the phone received it
  face: number;         // deg after zero, + = open
  faceRaw: number;
  tempo: number | null;
  backMs: number | null;
  downMs: number | null;
  mph: number;
  good: boolean;
  conc: number;
  rezeroed?: boolean;   // face restated after a zero
}

export interface Session {
  id: string;
  startedAt: number;
  source: 'web' | 'demo';
  putts: Putt[];
}

export interface Store {
  sessions: Session[];   // newest first
  activeId: string | null;
}

// A new session starts when the sensor's putt counter goes backwards (it was
// power-cycled, which also clears its zero) or after a long gap.
export const SESSION_GAP_MS = 30 * 60 * 1000;

export const emptyStore = (): Store => ({ sessions: [], activeId: null });

function newSession(at: number, source: Session['source']): Session {
  return { id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, startedAt: at, source, putts: [] };
}

function toPutt(p: PuttPacket, at: number): Putt {
  return {
    n: p.putt, at, face: p.face, faceRaw: p.faceRaw, tempo: p.tempo,
    backMs: p.backMs, downMs: p.downMs, mph: p.peakMph, good: p.good, conc: p.concentration,
  };
}

export function active(s: Store): Session | null {
  return s.sessions.find((x) => x.id === s.activeId) ?? null;
}

export function addPacket(s: Store, p: PuttPacket, at: number, source: Session['source']): Store {
  let cur = active(s);

  if (cur && cur.source === source) {
    const existing = cur.putts.find((x) => x.n === p.putt);
    if (existing) {
      // Same putt again: either the resend we ask for on connect, or the
      // device restating it after a zero. Only the zero changes anything.
      if (Math.abs(existing.faceRaw - p.faceRaw) > 0.011) {
        // Different raw angle with the same number => the device restarted
        // and has counted up past this number again. Fall through to new session.
        cur = null;
      } else if (p.rezero || Math.abs(existing.face - p.face) > 0.011) {
        return replaceSession(s, {
          ...cur,
          putts: cur.putts.map((x) => (x.n === p.putt ? { ...x, face: p.face, rezeroed: true } : x)),
        });
      } else {
        return s;
      }
    }
  }

  if (cur && cur.source === source) {
    const last = cur.putts[cur.putts.length - 1];
    const counterReset = last && p.putt < last.n;
    const longGap = last && at - last.at > SESSION_GAP_MS;
    if (!counterReset && !longGap) {
      return replaceSession(s, { ...cur, putts: [...cur.putts, toPutt(p, at)] });
    }
  }

  // A resend of a putt we never saw, arriving on a fresh session, is still a
  // real putt -- keep it.
  const fresh = { ...newSession(at, source), putts: [toPutt(p, at)] };
  return { sessions: [fresh, ...s.sessions], activeId: fresh.id };
}

export function startNewSession(s: Store, at: number, source: Session['source']): Store {
  const cur = active(s);
  if (cur && cur.putts.length === 0) return s;
  const fresh = newSession(at, source);
  return { sessions: [fresh, ...s.sessions], activeId: fresh.id };
}

export function deleteSession(s: Store, id: string): Store {
  return { sessions: s.sessions.filter((x) => x.id !== id), activeId: s.activeId === id ? null : s.activeId };
}

function replaceSession(s: Store, next: Session): Store {
  return { ...s, sessions: s.sessions.map((x) => (x.id === next.id ? next : x)) };
}

// ---- stats (good putts only) ----
export interface Stats {
  count: number;        // all putts
  good: number;         // putts that passed the quality checks
  avgFace: number | null;
  spread: number | null; // sample SD of face, deg
  withinOne: number | null; // share of good putts within +/-1 deg
  avgTempo: number | null;
  avgMph: number | null;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function stats(putts: Putt[]): Stats {
  const g = putts.filter((p) => p.good);
  const faces = g.map((p) => p.face);
  const m = mean(faces);
  let sd: number | null = null;
  if (faces.length > 1 && m != null) {
    sd = Math.sqrt(faces.reduce((acc, f) => acc + (f - m) ** 2, 0) / (faces.length - 1));
  }
  const tempos = g.map((p) => p.tempo).filter((t): t is number => t != null);
  return {
    count: putts.length,
    good: g.length,
    avgFace: m,
    spread: sd,
    withinOne: g.length ? g.filter((p) => Math.abs(p.face) <= 1).length / g.length : null,
    avgTempo: mean(tempos),
    avgMph: mean(g.map((p) => p.mph)),
  };
}

// ---- persistence ----
const KEY = 'puttsensor.sessions.v1';

export function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const s = JSON.parse(raw) as Store;
    if (!Array.isArray(s.sessions)) return emptyStore();
    return s;
  } catch {
    return emptyStore();
  }
}

export function save(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}

export function toCsv(sess: Session): string {
  const rows = [['putt', 'time', 'face_deg', 'face_raw_deg', 'tempo', 'back_ms', 'down_ms', 'peak_mph', 'good', 'concentration']];
  for (const p of sess.putts) {
    rows.push([
      String(p.n), new Date(p.at).toISOString(), p.face.toFixed(2), p.faceRaw.toFixed(2),
      p.tempo?.toFixed(2) ?? '', p.backMs?.toString() ?? '', p.downMs?.toString() ?? '',
      p.mph.toFixed(2), p.good ? '1' : '0', p.conc.toFixed(2),
    ]);
  }
  return rows.map((r) => r.join(',')).join('\n');
}
