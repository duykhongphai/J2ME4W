// Standard MIDI File parser: produces timed notes (seconds) with the channel state that applies to
// each note (program, channel volume x expression, pitch bend at note-on), honoring tempo changes.

export interface MidiNote {
  channel: number;
  note: number;
  velocity: number;
  program: number;
  /** Channel volume x expression, 0..1. */
  volume: number;
  /** Pitch bend at note-on in semitones (+-2 range). */
  bend: number;
  start: number;
  end: number;
}

export function parseMidi(data: Uint8Array): { notes: MidiNote[]; duration: number } {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0;
  const str4 = () => String.fromCharCode(data[p], data[p + 1], data[p + 2], data[p + 3]);
  if (str4() !== 'MThd') throw new Error('not a MIDI file');
  const hlen = dv.getUint32(4);
  const ntracks = dv.getUint16(10);
  const division = dv.getUint16(12);
  if (division & 0x8000) throw new Error('SMPTE timing not supported');
  p = 8 + hlen;

  type Ev = { tick: number; order: number; kind: number; ch: number; a: number; b: number };
  // kind: 0 tempo, 1 program, 2 controller, 3 bend, 4 note off, 5 note on
  const events: Ev[] = [];
  let order = 0;
  for (let t = 0; t < ntracks && p + 8 <= data.length; t++) {
    const id = str4();
    const len = dv.getUint32(p + 4);
    p += 8;
    const end = Math.min(data.length, p + len);
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0;
    let status = 0;
    const vlq = () => {
      let v = 0;
      for (let k = 0; k < 4 && p < end; k++) {
        const c = data[p++];
        v = (v << 7) | (c & 0x7f);
        if (!(c & 0x80)) break;
      }
      return v;
    };
    while (p < end) {
      tick += vlq();
      if (data[p] & 0x80) status = data[p++];
      const type = status & 0xf0, ch = status & 0x0f;
      if (status === 0xff) {
        const meta = data[p++];
        const l = vlq();
        if (meta === 0x51 && l === 3) {
          events.push({ tick, order: order++, kind: 0, ch: 0, a: (data[p] << 16) | (data[p + 1] << 8) | data[p + 2], b: 0 });
        }
        p += l;
        if (meta === 0x2f) break;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq();
      } else if (type === 0x90 || type === 0x80) {
        const note = data[p++], vel = data[p++];
        events.push({ tick, order: order++, kind: type === 0x90 && vel > 0 ? 5 : 4, ch, a: note, b: vel });
      } else if (type === 0xc0) {
        events.push({ tick, order: order++, kind: 1, ch, a: data[p++], b: 0 });
      } else if (type === 0xd0) {
        p += 1;
      } else if (type === 0xb0) {
        const c = data[p++], v = data[p++];
        events.push({ tick, order: order++, kind: 2, ch, a: c, b: v });
      } else if (type === 0xe0) {
        const lsb = data[p++], msb = data[p++];
        events.push({ tick, order: order++, kind: 3, ch, a: ((msb << 7) | lsb) - 8192, b: 0 });
      } else {
        p += 2; // polyphonic aftertouch
      }
    }
    p = end;
  }
  // state changes before notes at the same tick, note-offs before note-ons
  events.sort((x, y) => x.tick - y.tick || (x.kind - y.kind) || x.order - y.order);

  const program = new Array(16).fill(0);
  const vol = new Array(16).fill(100);
  const expr = new Array(16).fill(127);
  const bend = new Array(16).fill(0);
  let tempo = 500000;
  let lastTick = 0, time = 0;
  const open = new Map<number, Omit<MidiNote, 'end'>>();
  const notes: MidiNote[] = [];
  for (const e of events) {
    time += ((e.tick - lastTick) * tempo) / division / 1e6;
    lastTick = e.tick;
    switch (e.kind) {
      case 0: tempo = e.a; break;
      case 1: program[e.ch] = e.a; break;
      case 2:
        if (e.a === 7) vol[e.ch] = e.b;
        else if (e.a === 11) expr[e.ch] = e.b;
        else if (e.a === 121) { vol[e.ch] = 100; expr[e.ch] = 127; bend[e.ch] = 0; }
        else if (e.a === 120 || e.a === 123) {
          for (const [k, o] of open) if (o.channel === e.ch) { notes.push({ ...o, end: time }); open.delete(k); }
        }
        break;
      case 3: bend[e.ch] = (e.a / 8192) * 2; break;
      case 4: case 5: {
        const k = e.ch * 128 + e.a;
        const o = open.get(k);
        if (o) { notes.push({ ...o, end: time }); open.delete(k); }
        if (e.kind === 5) {
          open.set(k, {
            channel: e.ch, note: e.a, velocity: e.b, program: program[e.ch],
            volume: (vol[e.ch] / 127) * (expr[e.ch] / 127), bend: bend[e.ch], start: time,
          });
        }
        break;
      }
    }
  }
  for (const o of open.values()) notes.push({ ...o, end: Math.max(time, o.start + 0.25) });
  notes.sort((a, b) => a.start - b.start);
  return { notes, duration: Math.max(time, notes.length ? notes[notes.length - 1].end : 0) };
}
