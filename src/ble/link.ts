import type { PuttPacket } from './protocol';

// What the rest of the app sees. Today there are two implementations: the Web
// Bluetooth one (runs in Bluefy on iPhone, Chrome on Android/desktop) and a
// demo device. A Capacitor implementation slots in here later for the native
// iPhone app without touching any screen code.

export type LinkStatus =
  | 'idle'          // never connected this launch
  | 'choosing'      // system device picker is open
  | 'connecting'    // linking + subscribing
  | 'live'          // subscribed: putts arrive as they happen
  | 'reconnecting'  // dropped; retrying on its own
  | 'unsupported';  // this browser has no Bluetooth

export interface LinkEvents {
  status: (s: LinkStatus, detail?: string) => void;
  putt: (p: PuttPacket, receivedAt: number) => void;
  battery: (pct: number) => void;
  error: (message: string) => void;
}

export interface PuttLink {
  readonly kind: 'web' | 'demo';
  connect(): Promise<void>;     // must be called from a tap (browser rule)
  disconnect(): Promise<void>;
  setZero(): Promise<void>;
  resendLast(): Promise<void>;
}
