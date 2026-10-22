// Wire format shared with putter_micro_ble.ino. If you change the firmware's
// PuttPacket, bump PKT_VERSION there and here, and update parsePuttPacket.

export const SERVICE_UUID = '6e3a0001-5b1c-4f2e-9d47-2c8a1f0b9e51';
export const PUTT_CHAR_UUID = '6e3a0002-5b1c-4f2e-9d47-2c8a1f0b9e51';
export const CTRL_CHAR_UUID = '6e3a0003-5b1c-4f2e-9d47-2c8a1f0b9e51';
export const DEVICE_NAME = 'PuttSensor';

export const PKT_VERSION = 1;
export const PKT_LEN = 19;

export const CMD_ZERO = 0x01;
export const CMD_RESEND = 0x02;

export const PF_GOOD = 0x01;      // passed every quality gate
export const PF_LOW_CONF = 0x02;  // swing-axis concentration below the flag line
export const PF_TEMPO_OK = 0x04;  // tempo fields valid
export const PF_ANGLE_BAD = 0x08; // |face| implausibly large
export const PF_IMPACT = 0x10;    // stroke ended on the ball strike
export const PF_REZERO = 0x20;    // resend of an existing putt after the zero moved

export interface PuttPacket {
  version: number;
  putt: number;        // putt number since the device powered on
  face: number;        // degrees after zero, + = open
  faceRaw: number;     // degrees before zero
  tempo: number | null;  // backswing / downswing, null when not measured
  backMs: number | null;
  downMs: number | null;
  peakMph: number;
  concentration: number; // 0..1
  planeFrac: number;     // 0..1
  flags: number;
  good: boolean;
  rezero: boolean;
  battery: number | null; // %, null when unknown
}

export class PacketError extends Error {}

// Little-endian, packed -- byte offsets match the firmware struct exactly.
export function parsePuttPacket(view: DataView): PuttPacket {
  if (view.byteLength < PKT_LEN) {
    throw new PacketError(`Putt packet is ${view.byteLength} bytes, expected ${PKT_LEN}`);
  }
  const version = view.getUint8(0);
  if (version !== PKT_VERSION) {
    throw new PacketError(`Device sends packet version ${version}; this app understands ${PKT_VERSION}. Update the app or the firmware so they match.`);
  }
  const flags = view.getUint8(17);
  const tempoOk = (flags & PF_TEMPO_OK) !== 0;
  const batt = view.getInt8(18);
  return {
    version,
    putt: view.getUint16(1, true),
    face: view.getInt16(3, true) / 100,
    faceRaw: view.getInt16(5, true) / 100,
    tempo: tempoOk ? view.getUint16(7, true) / 100 : null,
    backMs: tempoOk ? view.getUint16(9, true) : null,
    downMs: tempoOk ? view.getUint16(11, true) : null,
    peakMph: view.getUint16(13, true) / 100,
    concentration: view.getUint8(15) / 100,
    planeFrac: view.getUint8(16) / 100,
    flags,
    good: (flags & PF_GOOD) !== 0,
    rezero: (flags & PF_REZERO) !== 0,
    battery: batt < 0 ? null : batt,
  };
}

// Inverse of parsePuttPacket. Used by the demo device and the tests, so the
// demo exercises the same byte path as the real sensor.
export function encodePuttPacket(p: {
  putt: number; face: number; faceRaw: number;
  tempo: number | null; backMs: number | null; downMs: number | null;
  peakMph: number; concentration: number; planeFrac: number;
  flags: number; battery: number | null;
}): DataView {
  const v = new DataView(new ArrayBuffer(PKT_LEN));
  const tempoOk = p.tempo != null;
  v.setUint8(0, PKT_VERSION);
  v.setUint16(1, p.putt, true);
  v.setInt16(3, Math.round(p.face * 100), true);
  v.setInt16(5, Math.round(p.faceRaw * 100), true);
  v.setUint16(7, tempoOk ? Math.round(p.tempo! * 100) : 0, true);
  v.setUint16(9, tempoOk ? Math.round(p.backMs ?? 0) : 0, true);
  v.setUint16(11, tempoOk ? Math.round(p.downMs ?? 0) : 0, true);
  v.setUint16(13, Math.round(p.peakMph * 100), true);
  v.setUint8(15, Math.round(p.concentration * 100));
  v.setUint8(16, Math.round(p.planeFrac * 100));
  v.setUint8(17, p.flags | (tempoOk ? PF_TEMPO_OK : 0));
  v.setInt8(18, p.battery ?? -1);
  return v;
}
