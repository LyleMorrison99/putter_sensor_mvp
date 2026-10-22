import type { LinkEvents, PuttLink } from './link';
import { PF_ANGLE_BAD, PF_GOOD, PF_IMPACT, PF_LOW_CONF, PF_REZERO, encodePuttPacket, parsePuttPacket } from './protocol';

// A pretend sensor for working on screens without the hardware. It encodes
// real packets and parses them back, so it travels the same path as the device.
function gauss(mean: number, sd: number) {
  const u = 1 - Math.random(), v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class DemoLink implements PuttLink {
  readonly kind = 'demo' as const;
  private timer: number | null = null;
  private n = 0;
  private zero = 0;
  private bias = gauss(0.8, 0.6);
  private last: ReturnType<typeof encodePuttPacket> | null = null;
  private lastRaw = 0;
  private battery = 86;

  constructor(private ev: LinkEvents, private everyMs = 4500) {}

  async connect() {
    this.ev.status('connecting');
    await new Promise((r) => setTimeout(r, 700));
    this.ev.status('live', 'Demo sensor');
    this.ev.battery(this.battery);
    this.schedule();
  }

  async disconnect() {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    this.ev.status('idle');
  }

  async setZero() {
    if (!this.last) return;
    this.zero = this.lastRaw;
    const p = parsePuttPacket(this.last);
    const v = encodePuttPacket({ ...p, face: p.faceRaw - this.zero, flags: p.flags | PF_REZERO });
    this.ev.putt(parsePuttPacket(v), Date.now());
  }

  async resendLast() {
    if (this.last) this.ev.putt(parsePuttPacket(this.last), Date.now());
  }

  private schedule() {
    this.timer = window.setTimeout(() => { this.emit(); this.schedule(); }, this.everyMs * (0.7 + Math.random() * 0.6));
  }

  private emit() {
    this.n++;
    const raw = gauss(this.bias, 1.4);
    const bad = Math.random() < 0.08;
    const conc = bad ? 0.82 + Math.random() * 0.07 : 0.92 + Math.random() * 0.07;
    const back = gauss(620, 50), down = back / gauss(2.0, 0.15);
    const tempoOk = Math.random() > 0.05;
    if (this.n % 6 === 0) this.battery = Math.max(5, this.battery - 1);
    this.lastRaw = raw;
    this.last = encodePuttPacket({
      putt: this.n,
      face: raw - this.zero,
      faceRaw: raw,
      tempo: tempoOk ? back / down : null,
      backMs: tempoOk ? back : null,
      downMs: tempoOk ? down : null,
      peakMph: Math.max(1, gauss(3.1, 0.45)),
      concentration: conc,
      planeFrac: 0.5 + Math.random() * 0.3,
      flags: PF_IMPACT | (bad ? PF_LOW_CONF : PF_GOOD) | (Math.abs(raw) > 25 ? PF_ANGLE_BAD : 0),
      battery: this.battery,
    });
    this.ev.putt(parsePuttPacket(this.last), Date.now());
  }
}
