# Putt Sensor app

Live putt readings from the putter sensor on your iPhone, with every putt saved
to the phone as it arrives.

## Run it on your iPhone (no Mac needed)

iPhone Safari has no Web Bluetooth, so the app runs inside **Bluefy**, a free
iOS browser that does. Web Bluetooth also only works on an `https://` page, so
the app has to be hosted somewhere first.

**Railway:** push this folder to a GitHub repo, create a Railway service from
it, and generate a domain. Railway runs `npm run build` and then `npm start`,
which serves `dist/` on `$PORT`.

**GitHub Pages / Netlify / Cloudflare Pages:** build command `npm run build`,
output folder `dist`.

Then on the phone: open the URL in Bluefy → Connect sensor → pick
"PuttSensor". Add it to Bluefy's bookmarks for one-tap launch.

## Develop

    npm install
    npm run dev      # http://localhost:5173 -- use "Try with a demo sensor"
    npm test         # packet parser + session rules

Desktop Chrome on a Mac or Windows laptop can talk to the real sensor on
localhost too.

## Layout

- `src/ble/protocol.ts` -- UUIDs and the 19-byte putt packet. Must match
  `PuttPacket` in `putter_micro_ble.ino`; bump `PKT_VERSION` on both together.
- `src/ble/link.ts` -- the interface every connection type implements.
- `src/ble/webBluetooth.ts` -- real sensor via Web Bluetooth (Bluefy/Chrome),
  with automatic reconnect.
- `src/ble/demo.ts` -- fake sensor that goes through the same byte encoding.
- `src/store/sessions.ts` -- sessions, de-duplication, re-zero handling, stats,
  saved in the phone's local storage.

## Session rules

- A new session starts when the sensor's putt counter goes backwards (it was
  switched off and on, which also clears its zero), after a 30-minute gap, or
  when you tap New session.
- On every (re)connect the app asks the sensor to resend its last putt, so a
  putt hit while the link was down isn't lost. More than one missed putt needs
  a firmware buffer (not built yet).
- Low-confidence putts are kept and shown greyed out, but left out of avg,
  spread and within-1°.

## Going native later

Add Capacitor with `@capacitor-community/bluetooth-le`, write a
`CapacitorLink` that implements `PuttLink`, and choose it at startup when
running in the native shell. Screens and storage don't change. Building to
your own iPhone needs a Mac with Xcode.
