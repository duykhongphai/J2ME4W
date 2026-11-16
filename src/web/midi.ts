// Minimal Standard MIDI File parser: extracts timed notes (seconds), honoring tempo changes.

export interface MidiNote { channel: number; note: number; velocity: number; start: number; end: number }

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

  interface Ev { tick: number; type: 'on' | 'off' | 'tempo'; ch: number; note: number; vel: number; tempo: number }
  const events: Ev[] = [];
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
      let c = data[p];
      if (c & 0x80) { status = c; p++; } else c = status;
      const type = status & 0xf0, ch = status & 0x0f;
      if (status === 0xff) {
        const meta = data[p++];
        const l = vlq();
        if (meta === 0x51 && l === 3) events.push({ tick, type: 'tempo', ch: 0, note: 0, vel: 0, tempo: (data[p] << 16) | (data[p + 1] << 8) | data[p + 2] });
        p += l;
        if (meta === 0x2f) break;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq();
      } else if (type === 0x90 || type === 0x80) {
        const note = data[p++], vel = data[p++];
        events.push({ tick, type: type === 0x90 && vel > 0 ? 'on' : 'off', ch, note, vel, tempo: 0 });
      } else if (type === 0xc0 || type === 0xd0) {
        p += 1;
      } else {
        p += 2;
      }
    }
    p = end;
  }
  events.sort((a, b) => a.tick - b.tick || (a.type === 'tempo' ? -1 : 0));
  let tempo = 500000;
  let lastTick = 0, time = 0;
  const open = new Map<number, { start: number; vel: number }>();
  const notes: MidiNote[] = [];
  for (const e of events) {
    time += ((e.tick - lastTick) * tempo) / division / 1e6;
    lastTick = e.tick;
    if (e.type === 'tempo') { tempo = e.tempo; continue; }
    const k = e.ch * 128 + e.note;
    if (e.type === 'on') {
      const prev = open.get(k);
      if (prev) notes.push({ channel: e.ch, note: e.note, velocity: prev.vel, start: prev.start, end: time });
      open.set(k, { start: time, vel: e.vel });
    } else {
      const o = open.get(k);
      if (o) {
        notes.push({ channel: e.ch, note: e.note, velocity: o.vel, start: o.start, end: time });
        open.delete(k);
      }
    }
  }
  for (const [k, o] of open) notes.push({ channel: k >> 7, note: k & 127, velocity: o.vel, start: o.start, end: time });
  return { notes, duration: time };
}
