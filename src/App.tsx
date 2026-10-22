import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { LinkEvents, LinkStatus, PuttLink } from './ble/link';
import type { PuttPacket } from './ble/protocol';
import { DemoLink } from './ble/demo';
import { WebBluetoothLink, webBluetoothAvailable } from './ble/webBluetooth';
import {
  type Putt, type Session, type Store,
  active, addPacket, deleteSession, load, save, startNewSession, stats, toCsv,
} from './store/sessions';
import { FaceGauge } from './ui/FaceGauge';
import { FaceTrend } from './ui/FaceTrend';
import { faceLabel, faceTone, fmtDate, fmtFace, fmtNum, fmtPct, fmtTime } from './ui/format';

type Action =
  | { t: 'putt'; p: PuttPacket; at: number; source: Session['source'] }
  | { t: 'new'; at: number; source: Session['source'] }
  | { t: 'delete'; id: string };

function reducer(s: Store, a: Action): Store {
  switch (a.t) {
    case 'putt': return addPacket(s, a.p, a.at, a.source);
    case 'new': return startNewSession(s, a.at, a.source);
    case 'delete': return deleteSession(s, a.id);
  }
}

const BLUEFY_URL = 'https://apps.apple.com/app/id1492822055';

export default function App() {
  const [store, dispatch] = useReducer(reducer, undefined, load);
  const [tab, setTab] = useState<'live' | 'sessions'>('live');
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<LinkStatus>(webBluetoothAvailable() ? 'idle' : 'unsupported');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const link = useRef<PuttLink | null>(null);

  useEffect(() => save(store), [store]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const makeEvents = useCallback((source: Session['source']): LinkEvents => ({
    status: (s, detail) => { setStatus(s); if (detail) setDeviceName(detail); },
    putt: (p, at) => dispatch({ t: 'putt', p, at, source }),
    battery: setBattery,
    error: setToast,
  }), []);

  const connect = async (demo: boolean) => {
    await link.current?.disconnect();
    link.current = demo ? new DemoLink(makeEvents('demo')) : new WebBluetoothLink(makeEvents('web'));
    await link.current.connect();
  };

  const disconnect = async () => {
    await link.current?.disconnect();
    link.current = null;
    setBattery(null);
    setStatus(webBluetoothAvailable() ? 'idle' : 'unsupported');
  };

  useWakeLock(status === 'live');

  const cur = active(store);
  const opened = store.sessions.find((s) => s.id === openId) ?? null;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">Putt<span>Sensor</span></div>
        <StatusPill status={status} battery={battery} demo={link.current?.kind === 'demo'} />
      </header>

      <main className="main">
        {tab === 'live' && (
          <LiveView
            status={status}
            deviceName={deviceName}
            session={cur}
            onConnect={() => connect(false)}
            onDemo={() => connect(true)}
            onDisconnect={disconnect}
            onZero={async () => {
              try { await link.current?.setZero(); } catch (e) { setToast((e as Error).message); }
            }}
            onNew={() => dispatch({ t: 'new', at: Date.now(), source: link.current?.kind ?? 'web' })}
          />
        )}
        {tab === 'sessions' && !opened && (
          <SessionList sessions={store.sessions} activeId={store.activeId} onOpen={setOpenId} />
        )}
        {tab === 'sessions' && opened && (
          <SessionDetail
            session={opened}
            onBack={() => setOpenId(null)}
            onDelete={() => { dispatch({ t: 'delete', id: opened.id }); setOpenId(null); }}
          />
        )}
      </main>

      {toast && <div className="toast" role="status" onClick={() => setToast(null)}>{toast}</div>}

      <nav className="tabs">
        <button className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>
          <span className="tab-dot" data-live={status === 'live'} />Live
        </button>
        <button className={tab === 'sessions' ? 'on' : ''} onClick={() => { setTab('sessions'); setOpenId(null); }}>
          Sessions
        </button>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatusPill({ status, battery, demo }: { status: LinkStatus; battery: number | null; demo: boolean }) {
  const text: Record<LinkStatus, string> = {
    idle: 'Not connected', choosing: 'Choose sensor…', connecting: 'Connecting…',
    live: demo ? 'Demo' : 'Live', reconnecting: 'Reconnecting…', unsupported: 'No Bluetooth',
  };
  return (
    <div className="pill-row">
      {battery != null && status === 'live' && (
        <span className={`batt ${battery <= 15 ? 'low' : ''}`} aria-label={`Sensor battery ${battery}%`}>
          <span className="batt-body"><span style={{ width: `${Math.max(4, battery)}%` }} /></span>{battery}%
        </span>
      )}
      <span className={`pill pill-${status}`}><span className="pill-dot" />{text[status]}</span>
    </div>
  );
}

function LiveView(props: {
  status: LinkStatus; deviceName: string | null; session: Session | null;
  onConnect: () => void; onDemo: () => void; onDisconnect: () => void;
  onZero: () => void; onNew: () => void;
}) {
  const { status, session } = props;
  const connected = status === 'live' || status === 'reconnecting';
  const putts = session?.putts ?? [];
  const latest = putts[putts.length - 1] ?? null;
  const st = useMemo(() => stats(putts), [putts]);

  if (status === 'unsupported') return <Unsupported onDemo={props.onDemo} />;

  if (!connected) {
    const busy = status === 'choosing' || status === 'connecting';
    return (
      <section className="connect">
        <div className="connect-art" aria-hidden>
          <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" /><circle cx="60" cy="60" r="38" /><circle cx="60" cy="60" r="8" /></svg>
        </div>
        <h1>Connect your sensor</h1>
        <p className="muted">Switch the sensor on, clip it to the shaft, then tap connect. Putts show up here the moment you hit them.</p>
        <button className="btn primary big" disabled={busy} onClick={props.onConnect}>
          {busy ? (status === 'choosing' ? 'Pick “PuttSensor”…' : 'Connecting…') : 'Connect sensor'}
        </button>
        <button className="btn ghost" disabled={busy} onClick={props.onDemo}>Try with a demo sensor</button>
        {putts.length > 0 && <p className="muted small">Your last session ({putts.length} putts) is saved under Sessions.</p>}
      </section>
    );
  }

  return (
    <section className="live">
      {status === 'reconnecting' && (
        <div className="banner">Lost the sensor — reconnecting. Putts hit now will be missed except the last one.</div>
      )}

      <div className={`hero tone-${latest ? faceTone(latest.face, latest.good) : 'muted'}`}>
        {latest ? (
          <>
            <div className="hero-top">
              <span className="hero-label">{faceLabel(latest.face, latest.good)}</span>
              <span className="muted small">Putt {putts.length}{latest.rezeroed ? ' · re-zeroed' : ''}</span>
            </div>
            <div key={`${latest.n}-${latest.at}`} className="hero-num flash">{fmtFace(latest.face)}</div>
            {!latest.good && <div className="hero-note">Low-confidence reading — left out of your averages.</div>}
          </>
        ) : (
          <div className="hero-empty">
            <div className="hero-num dim">0.0°</div>
            <p className="muted">Hold still at address until the sensor is armed, then hit a putt.</p>
          </div>
        )}
        <FaceGauge putts={putts} latest={latest} />
      </div>

      <div className="metrics">
        <Metric label="Tempo" value={latest?.tempo != null ? `${latest.tempo.toFixed(2)}` : '–'} unit=": 1"
          sub={latest?.backMs != null ? `${latest.backMs} back · ${latest.downMs} down ms` : 'back : through'} />
        <Metric label="Peak speed" value={fmtNum(latest?.mph)} unit="mph" sub="putter head" />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>This session</h2>
          <span className="muted small">{session ? `${fmtDate(session.startedAt)} · ${fmtTime(session.startedAt)}` : ''}</span>
        </div>
        <SessionStats putts={putts} st={st} />
      </div>

      <div className="actions">
        <button className="btn" onClick={props.onZero} disabled={!latest}>Zero on last putt</button>
        <button className="btn" onClick={props.onNew} disabled={putts.length === 0}>New session</button>
      </div>
      <p className="muted small hint">Zero uses your last putt as square — hit one you know was square first. Same as a short press on the sensor.</p>

      {putts.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Putts</h2></div>
          <PuttRows putts={[...putts].reverse()} />
        </div>
      )}

      <button className="btn ghost small" onClick={props.onDisconnect}>Disconnect {props.deviceName ?? ''}</button>
    </section>
  );
}

function Unsupported({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="connect">
      <h1>Open this in Bluefy</h1>
      <p className="muted">
        iPhone Safari can't talk to Bluetooth devices. Bluefy is a free browser that can — open this same address there and the sensor will connect.
      </p>
      <a className="btn primary big" href={BLUEFY_URL} target="_blank" rel="noreferrer">Get Bluefy</a>
      <button className="btn ghost" onClick={onDemo}>Look around with a demo sensor</button>
    </section>
  );
}

function Metric({ label, value, unit, sub }: { label: string; value: string; unit: string; sub: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}<span>{value === '–' ? '' : unit}</span></div>
      <div className="metric-sub">{sub}</div>
    </div>
  );
}

function SessionStats({ putts, st }: { putts: Putt[]; st: ReturnType<typeof stats> }) {
  if (putts.length === 0) return <p className="muted small">No putts yet.</p>;
  return (
    <div className="stats">
      <Stat label="Putts" value={`${st.count}`} sub={st.good < st.count ? `${st.good} counted` : 'all counted'} />
      <Stat label="Avg face" value={fmtFace(st.avgFace)} sub={st.avgFace == null ? '' : st.avgFace > 0.3 ? 'leaning open' : st.avgFace < -0.3 ? 'leaning closed' : 'centred'} />
      <Stat label="Spread" value={st.spread == null ? '–' : `${st.spread.toFixed(1)}°`} sub="lower is steadier" />
      <Stat label="Within 1°" value={fmtPct(st.withinOne)} sub="of counted putts" />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function PuttRows({ putts }: { putts: Putt[] }) {
  return (
    <ol className="rows">
      {putts.map((p) => (
        <li key={`${p.n}-${p.at}`} className={p.good ? '' : 'bad'}>
          <span className="row-n">#{p.n}</span>
          <span className={`row-face tone-${faceTone(p.face, p.good)}`}>{fmtFace(p.face)}</span>
          <span className="row-meta">{p.tempo != null ? `${p.tempo.toFixed(2)}:1` : '–'}</span>
          <span className="row-meta">{p.mph.toFixed(1)} mph</span>
          <span className="row-time">{p.good ? fmtTime(p.at) : 'check'}</span>
        </li>
      ))}
    </ol>
  );
}

function SessionList({ sessions, activeId, onOpen }: { sessions: Session[]; activeId: string | null; onOpen: (id: string) => void }) {
  const list = sessions.filter((s) => s.putts.length > 0);
  if (list.length === 0) {
    return (
      <section className="connect">
        <h1>No sessions yet</h1>
        <p className="muted">Every putt is saved on this phone as it arrives. Sessions split when the sensor is switched off and on, or after a 30-minute break.</p>
      </section>
    );
  }
  return (
    <section className="list">
      {list.map((s) => {
        const st = stats(s.putts);
        return (
          <button key={s.id} className="session" onClick={() => onOpen(s.id)}>
            <div className="session-top">
              <span className="session-date">{fmtDate(s.startedAt)}</span>
              <span className="muted small">
                {fmtTime(s.startedAt)}{s.id === activeId ? ' · current' : ''}{s.source === 'demo' ? ' · demo' : ''}
              </span>
            </div>
            <div className="session-stats">
              <span><b>{st.count}</b> putts</span>
              <span>avg <b>{fmtFace(st.avgFace)}</b></span>
              <span>spread <b>{st.spread == null ? '–' : `${st.spread.toFixed(1)}°`}</b></span>
              <span><b>{fmtPct(st.withinOne)}</b> within 1°</span>
            </div>
          </button>
        );
      })}
    </section>
  );
}

function SessionDetail({ session, onBack, onDelete }: { session: Session; onBack: () => void; onDelete: () => void }) {
  const st = useMemo(() => stats(session.putts), [session.putts]);
  const [confirm, setConfirm] = useState(false);
  const exportCsv = async () => {
    const csv = toCsv(session);
    const name = `putts-${new Date(session.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    const file = new File([csv], name, { type: 'text/csv' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch { /* fall through */ }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="live">
      <button className="back" onClick={onBack}>‹ Sessions</button>
      <h1 className="detail-title">{fmtDate(session.startedAt)}<span className="muted detail-time">{fmtTime(session.startedAt)}</span></h1>
      <div className="card">
        <SessionStats putts={session.putts} st={st} />
      </div>
      <div className="card">
        <div className="card-head"><h2>Face angle by putt</h2><span className="muted small">band = ±1°</span></div>
        <FaceTrend putts={session.putts} />
        <div className="trend-foot">
          <span>Tempo <b>{st.avgTempo == null ? '–' : `${st.avgTempo.toFixed(2)}:1`}</b></span>
          <span>Speed <b>{fmtNum(st.avgMph)} mph</b></span>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2>Putts</h2></div>
        <PuttRows putts={session.putts} />
      </div>
      <div className="actions">
        <button className="btn" onClick={exportCsv}>Export CSV</button>
        {confirm
          ? <button className="btn danger" onClick={onDelete}>Tap again to delete</button>
          : <button className="btn" onClick={() => setConfirm(true)}>Delete</button>}
      </div>
    </section>
  );
}

// Keep the phone awake while putts are streaming. Not every browser has it.
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const get = () => nav.wakeLock!.request('screen').then((l) => { if (cancelled) void l.release(); else lock = l; }).catch(() => undefined);
    void get();
    const onVis = () => { if (document.visibilityState === 'visible') void get(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => undefined); };
  }, [on]);
}
