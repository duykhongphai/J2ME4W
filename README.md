# J2ME4W

Run J2ME (MIDP 2.0 / CLDC 1.1) games and apps in the browser. J2ME4W is a Java virtual machine
written in TypeScript plus a MIDP implementation. Nothing is uploaded anywhere: the JAR stays in your
browser.

*Chạy game/ứng dụng J2ME (MIDP 2.0 / CLDC 1.1) ngay trên trình duyệt, bằng một máy ảo Java viết bằng
TypeScript. File JAR không bị tải lên đâu cả.*

## Quick start

Requirements: Node 18+ and a JDK 11+ (`javac`, `jar`, `java` on `PATH`). The JDK is only used at
build time, to compile the Java half of the runtime.

```bash
npm install
npm run dev
```

Open http://localhost:5173, then press **Add JAR** (you can also drop a `.jar`, with its
`.jad` if you have one, onto the page).

```bash
npm test          # VM tests (compared against a real JVM) + a headless MIDlet test
npm run build     # static site in dist/
npm start         # serve dist/ + the network proxy on http://127.0.0.1:8080
```

### Using it

- **Library**: games you add are kept in the browser (IndexedDB) with their icon, and stay installed
  between visits. Re-adding a newer JAR of the same game updates it and keeps its saved data. The
  ⋮ menu on each game has Settings, Rename, Clear saved data and Delete.
- **Per-game settings** (inspired by J2ME-Loader): resolution, scaling (fit / whole multiples /
  fill / 1×), smooth filter, background, orientation, font sizes and anti-aliasing, keypad
  (auto / always / never, phone or gamepad layout, opacity, haptics), pause when hidden, and system
  properties such as `microedition.platform`.
- **Phones**: the keypad sits under the screen in portrait and becomes translucent clusters on both
  sides in landscape. The D-pad follows a sliding finger; the gamepad layout has an 8-way joystick.
  The Android back button opens the game menu, a second press returns to the library. Add the page to
  the home screen to run it as an app.
- **Keypad layout editor**: in the game menu, *Edit keypad layout* lets you drag each key group
  (D-pad, number keys, soft keys, Fire) and make it bigger or smaller. Positions are saved per game,
  per keypad style and per orientation.
- **Controls**: Settings → Controls binds keyboard keys and gamepad buttons (Gamepad API: D-pad,
  sticks, A/B/X/Y, shoulders) to each phone key. Defaults: arrows = D-pad, Enter/Space or pad A =
  fire, Q / W or LB / RB = soft keys, 0-9 = digits, E / R = * / #, Backspace = clear. Esc or M opens
  the game menu, F toggles fullscreen.
- **Sound**: WAV/MP3/OGG through WebAudio, MIDI through a built-in General MIDI synth (instrument
  families, envelopes, synthesized drums), tones and tone sequences. Volume is in the game menu.

### Several games at once (tabs)

- **Tabs**: the **+** in the game bar (or *Open in a new tab* in a game's ⋮ menu) starts another game,
  or another copy of the same one, next to the running ones. Each tab is a separate virtual machine.
  Going back to the library leaves every tab running; the bar at the top of the library returns to them.
- **Grid view**: shows every tab side by side (grid button, *Show all tabs* in the menu, or Alt+G).
  Click a screen to select it; Alt+1…9 selects a tab.
- **Input sync**: with the link button (or Alt+S) on, keys, the on-screen keypad, gamepads and taps go
  to every synced tab at once. *Tab settings* (double-click a tab) can leave a tab out.
- **Save slots**: every copy of a game uses its own save slot, so tabs keep separate RecordStores
  (for example one account per tab). Slot 1 is the game's main save.
- **Proxy per tab**: *Tab settings* takes an upstream proxy (`socks5://user:pass@host:port`,
  `socks5h://…`, or `http://host:port` for HTTP CONNECT). That tab's sockets and HTTP requests leave the
  bridge through it. It is remembered per game and save slot.
- **Background tabs skip drawing**: tabs that are not on screen keep running (online games stay
  connected) but skip every drawing operation and frame copy, and redraw fully when shown again.
  App settings (gear in the library) can keep drawing hidden tabs, and choose whether only the selected
  tab plays sound.

## Online games (network proxy)

Browsers cannot open TCP sockets, and most game servers do not send CORS headers, so MIDlet
networking goes through a small proxy ([server/proxy.mjs](server/proxy.mjs)):

- `socket://host:port` becomes a WebSocket to `/__j2me4w/tcp`, which the proxy bridges to TCP.
- `http://` and `https://` requests are relayed through `/__j2me4w/http`.

The proxy runs automatically with `npm run dev` and `npm start`. A static host (GitHub Pages, etc.) has
no proxy: run `npm start` somewhere and put its URL in **Network → Proxy URL**. By default the proxy
refuses private and loopback addresses; set `J2ME4W_ALLOW_PRIVATE=1` to allow them (for example a game
server on your LAN). Do not expose the proxy publicly without access control: anyone who can reach it
can use it to open connections. Upstream proxies set per tab may be on a private address (a local
SOCKS client on 127.0.0.1, say) with `npm run dev`, with `npm start` bound to loopback, or with
`J2ME4W_ALLOW_PRIVATE_PROXY=1`.

To debug a JAR without a browser: `npx tsx test/run-jar.ts game.jar 20 shot.png 6000:-6` runs it for
20 s with real networking, presses the left soft key after 6 s and saves the last frame.

## How it works

```
 .jar ──► Suite loader ──► VM (TypeScript) ◄──► natives (TS) ◄──► Platform ◄──► browser host
                            │                                    │             (canvas, keys,
                            ▼                                    │              WebAudio,
                        rt.jar: java.lang, java.util, java.io,   │              localStorage)
                        javax.microedition.* written in Java  ───┘
```

- **VM** (`src/vm`): class file parser, bytecode interpreter covering the full JVM instruction set
  (including `jsr`/`ret` used by old compilers), `long` via BigInt, monitors, `wait`/`notify`,
  `interrupt`, lazy class initialization, exceptions with stack traces.
- **Green threads**: the interpreter never recurses into JavaScript for Java calls, so any Java thread
  can be suspended at an instruction boundary. A scheduler time-slices threads and yields to the
  browser every few milliseconds. Blocking natives (`Thread.sleep`, `Object.wait`, waiting for input,
  text entry dialogs) simply park the thread.
- **Runtime library** (`rt/`): most of CLDC/MIDP is plain Java compiled with `javac` against itself
  (`npm run build:rt` → `public/rt.jar`); only the small `native` methods are TypeScript
  (`src/vm/natives`, `src/midp/natives.ts`).
- **Graphics**: a software rasterizer (`src/midp/surface.ts`) with exact MIDP semantics (clip,
  translate, anchors, the 8 Sprite transforms, `drawRGB`/`getRGB`). PNGs are decoded synchronously by
  our own decoder, so `getRGB` returns the exact file pixels.

## What is supported

| Area | Status |
| --- | --- |
| CLDC 1.1 (`java.lang`, `java.util`, `java.io`) | Yes |
| MIDP 2.0 `Canvas`, `Graphics`, `Image`, `Font` | Yes |
| `lcdui.game` (`GameCanvas`, `Sprite`, `TiledLayer`, `LayerManager`) | Yes, pixel-level collisions included |
| High-level UI (`List`, `Form`, items, `Alert`, `TextBox`) | Basic rendering, keypad navigation, text entry dialog |
| Commands / soft keys | Yes, with an options menu when there are more than two |
| RMS (`RecordStore`) | Yes, persisted in `localStorage` per MIDlet suite |
| MMAPI (`Player`) | WAV/MP3/OGG via WebAudio, MIDI through a General MIDI synth, tones and tone sequences (AMR is silent) |
| Nokia UI API (`FullCanvas`, `DirectGraphics`, `DeviceControl`) | Yes |
| Networking (`socket://`, `http(s)://`) | Yes, through the bundled proxy (see below) |
| JSR-184 (M3G 3D), JSR-75 (files), Bluetooth, other vendor APIs | Not yet |

Missing classes or natives are reported in the console panel (`class not found`, `missing native`),
which is the quickest way to see why a given game does not run.

## Tests

`npm test` compiles `test/java/*.java` twice: against our runtime (run inside the VM) and against the
host JDK (run on a real JVM), and requires identical output. It then drives
`test/midlets/probe` through the whole MIDP stack headlessly (RMS, PNG decoding, rendering, sprite
transforms, keys, lists, commands).

## Project layout

```
rt/                 Java source of the runtime library (java.*, javax.microedition.*, com.nokia.*)
src/vm/             class parser, interpreter, VM, java.lang natives
src/midp/           platform, software renderer, PNG decoder, fonts, MIDP natives
src/web/            browser host: UI, keyboard/touch, WebAudio, MIDI
src/emulator.ts     host-independent entry point (load a JAR, start a MIDlet)
examples/demo/      a demo MIDlet used for testing (public/demo.jar, not listed in the app)
test/               VM and MIDlet tests
```
