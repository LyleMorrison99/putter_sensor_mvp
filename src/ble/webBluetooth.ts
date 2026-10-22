import type { LinkEvents, PuttLink } from './link';
import {
  CMD_RESEND, CMD_ZERO, CTRL_CHAR_UUID, DEVICE_NAME, PacketError,
  PUTT_CHAR_UUID, SERVICE_UUID, parsePuttPacket,
} from './protocol';

export function webBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

const RETRY_MS = [1000, 2000, 4000, 8000, 10000];

export class WebBluetoothLink implements PuttLink {
  readonly kind = 'web' as const;
  private device: BluetoothDevice | null = null;
  private ctrl: BluetoothRemoteGATTCharacteristic | null = null;
  private wantConnected = false;
  private retry = 0;
  private retryTimer: number | null = null;

  constructor(private ev: LinkEvents) {}

  async connect(): Promise<void> {
    if (!webBluetoothAvailable()) { this.ev.status('unsupported'); return; }
    this.wantConnected = true;
    if (!this.device) {
      this.ev.status('choosing');
      try {
        this.device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [SERVICE_UUID] }, { name: DEVICE_NAME }],
          optionalServices: [SERVICE_UUID, 'battery_service'],
        });
      } catch (e) {
        // Closing the picker lands here; that's not an error worth shouting about.
        this.wantConnected = false;
        this.ev.status('idle');
        const msg = (e as Error)?.message ?? String(e);
        if (!/cancel/i.test(msg)) this.ev.error(msg);
        return;
      }
      this.device.addEventListener('gattserverdisconnected', this.onDrop);
    }
    await this.open();
  }

  async disconnect(): Promise<void> {
    this.wantConnected = false;
    if (this.retryTimer != null) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    try { this.device?.gatt?.disconnect(); } catch { /* already gone */ }
    this.ctrl = null;
    this.ev.status('idle');
  }

  async setZero(): Promise<void> { await this.write(CMD_ZERO); }
  async resendLast(): Promise<void> { await this.write(CMD_RESEND); }

  private async write(cmd: number) {
    if (!this.ctrl) throw new Error('Not connected to the sensor');
    const data = new Uint8Array([cmd]);
    // Bluefy and older WebKit shims only have writeValue.
    const c = this.ctrl as BluetoothRemoteGATTCharacteristic & { writeValueWithResponse?: (d: BufferSource) => Promise<void> };
    if (c.writeValueWithResponse) await c.writeValueWithResponse(data);
    else await c.writeValue(data);
  }

  private async open() {
    if (!this.device?.gatt) return;
    this.ev.status(this.retry > 0 ? 'reconnecting' : 'connecting');
    try {
      const server = await this.device.gatt.connect();
      const svc = await server.getPrimaryService(SERVICE_UUID);
      const putt = await svc.getCharacteristic(PUTT_CHAR_UUID);
      this.ctrl = await svc.getCharacteristic(CTRL_CHAR_UUID);
      putt.addEventListener('characteristicvaluechanged', this.onPutt);
      await putt.startNotifications();     // this is what flips the sensor to CONNECTED

      try {
        const bsvc = await server.getPrimaryService('battery_service');
        const level = await bsvc.getCharacteristic('battery_level');
        this.ev.battery((await level.readValue()).getUint8(0));
        level.addEventListener('characteristicvaluechanged', (e) => {
          const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
          if (v) this.ev.battery(v.getUint8(0));
        });
        await level.startNotifications().catch(() => undefined);
      } catch { /* battery is a nice-to-have */ }

      this.retry = 0;
      this.ev.status('live', this.device.name ?? DEVICE_NAME);
      // Pick up the latest putt in case one landed while we were away. The
      // session store drops it if we already have it.
      await this.resendLast().catch(() => undefined);
    } catch (e) {
      this.ctrl = null;
      if (this.wantConnected) this.scheduleRetry();
      else this.ev.status('idle');
      const msg = (e as Error)?.message ?? String(e);
      if (this.retry <= 1) this.ev.error(msg);
    }
  }

  private onPutt = (e: Event) => {
    const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (!v) return;
    try {
      const p = parsePuttPacket(v);
      this.ev.putt(p, Date.now());
      if (p.battery != null) this.ev.battery(p.battery);
    } catch (err) {
      this.ev.error(err instanceof PacketError ? err.message : `Couldn't read a putt: ${String(err)}`);
    }
  };

  private onDrop = () => {
    this.ctrl = null;
    if (this.wantConnected) this.scheduleRetry();
    else this.ev.status('idle');
  };

  private scheduleRetry() {
    if (this.retryTimer != null) return;
    const wait = RETRY_MS[Math.min(this.retry, RETRY_MS.length - 1)];
    this.retry++;
    this.ev.status('reconnecting');
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (this.wantConnected) void this.open();
    }, wait);
  }
}
