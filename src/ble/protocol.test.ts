import { describe, expect, it } from 'vitest';
import { PF_GOOD, PF_IMPACT, PF_REZERO, PF_TEMPO_OK, PKT_LEN, parsePuttPacket, encodePuttPacket } from './protocol';
import { addPacket, emptyStore, active, stats } from '../store/sessions';

// Build the bytes the way the firmware's packed C struct lays them out,
// independently of encodePuttPacket, so a mismatch on either side shows up.
function firmwareBytes(): DataView {
  const b = new Uint8Array(PKT_LEN);
  const v = new DataView(b.buffer);
  v.setUint8(0, 1);               // version
  v.setUint16(1, 12, true);       // putt
  v.setInt16(3, -143, true);      // face_cdeg  -1.43
  v.setInt16(5, 57, true);        // face_raw    0.57
  v.setUint16(7, 208, true);      // tempo_x100  2.08
  v.setUint16(9, 640, true);      // back_ms
  v.setUint16(11, 308, true);     // down_ms
  v.setUint16(13, 341, true);     // peak_cmph   3.41
  v.setUint8(15, 96);             // conc_pct
  v.setUint8(16, 61);             // plane_pct
  v.setUint8(17, PF_GOOD | PF_TEMPO_OK | PF_IMPACT);
  v.setInt8(18, 72);              // batt
  return v;
}

describe('parsePuttPacket', () => {
  it('reads the firmware layout', () => {
    const p = parsePuttPacket(firmwareBytes());
    expect(p.putt).toBe(12);
    expect(p.face).toBeCloseTo(-1.43);
    expect(p.faceRaw).toBeCloseTo(0.57);
    expect(p.tempo).toBeCloseTo(2.08);
    expect(p.backMs).toBe(640);
    expect(p.downMs).toBe(308);
    expect(p.peakMph).toBeCloseTo(3.41);
    expect(p.concentration).toBeCloseTo(0.96);
    expect(p.good).toBe(true);
    expect(p.battery).toBe(72);
  });

  it('treats tempo as missing when the flag is clear, and battery -1 as unknown', () => {
    const v = firmwareBytes();
    v.setUint8(17, PF_GOOD);
    v.setInt8(18, -1);
    const p = parsePuttPacket(v);
    expect(p.tempo).toBeNull();
    expect(p.backMs).toBeNull();
    expect(p.battery).toBeNull();
  });

  it('round-trips through the encoder', () => {
    const p = parsePuttPacket(firmwareBytes());
    const q = parsePuttPacket(encodePuttPacket(p));
    expect(q).toEqual(p);
  });

  it('rejects short packets and unknown versions', () => {
    expect(() => parsePuttPacket(new DataView(new ArrayBuffer(18)))).toThrow();
    const v = firmwareBytes(); v.setUint8(0, 2);
    expect(() => parsePuttPacket(v)).toThrow(/version 2/);
  });
});

const pkt = (n: number, face: number, extra: Partial<Parameters<typeof encodePuttPacket>[0]> = {}) =>
  parsePuttPacket(encodePuttPacket({
    putt: n, face, faceRaw: face, tempo: 2, backMs: 600, downMs: 300, peakMph: 3,
    concentration: 0.95, planeFrac: 0.6, flags: PF_GOOD, battery: 80, ...extra,
  }));

describe('session store', () => {
  it('appends live putts and ignores the resend on reconnect', () => {
    let s = emptyStore();
    s = addPacket(s, pkt(1, 0.5), 1000, 'web');
    s = addPacket(s, pkt(2, -0.5), 2000, 'web');
    s = addPacket(s, pkt(2, -0.5), 3000, 'web');
    expect(active(s)!.putts.map((p) => p.n)).toEqual([1, 2]);
  });

  it('applies a re-zero to the existing putt instead of adding one', () => {
    let s = emptyStore();
    s = addPacket(s, pkt(1, 1.2), 1000, 'web');
    s = addPacket(s, pkt(1, 0, { faceRaw: 1.2, flags: PF_GOOD | PF_REZERO }), 2000, 'web');
    const a = active(s)!;
    expect(a.putts).toHaveLength(1);
    expect(a.putts[0].face).toBeCloseTo(0);
    expect(a.putts[0].rezeroed).toBe(true);
  });

  it('starts a new session when the sensor was power-cycled', () => {
    let s = emptyStore();
    s = addPacket(s, pkt(1, 0.3), 1000, 'web');
    s = addPacket(s, pkt(2, 0.4), 2000, 'web');
    s = addPacket(s, pkt(1, -2.0), 3000, 'web');   // counter restarted
    expect(s.sessions).toHaveLength(2);
    expect(active(s)!.putts.map((p) => p.face)).toEqual([-2]);
  });

  it('keeps bad putts but leaves them out of the stats', () => {
    const st = stats([
      { n: 1, at: 0, face: 1, faceRaw: 1, tempo: 2, backMs: 1, downMs: 1, mph: 3, good: true, conc: 1 },
      { n: 2, at: 0, face: -1, faceRaw: -1, tempo: 2, backMs: 1, downMs: 1, mph: 3, good: true, conc: 1 },
      { n: 3, at: 0, face: 20, faceRaw: 20, tempo: null, backMs: null, downMs: null, mph: 3, good: false, conc: 0.8 },
    ]);
    expect(st.count).toBe(3);
    expect(st.good).toBe(2);
    expect(st.avgFace).toBeCloseTo(0);
    expect(st.spread).toBeCloseTo(Math.SQRT2);
    expect(st.withinOne).toBe(1);
  });
});
