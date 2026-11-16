import type { AudioHost } from '../midp/platform';
import { parseMidi, type MidiNote } from './midi';

interface Clip {
  type: string;
  buffer: AudioBuffer | null;
  decoding: Promise<void> | null;
  midi: MidiNote[] | null;
  tones: MidiNote[] | null;
  length: number;
  sources: AudioScheduledSourceNode[];
  gain: GainNode | null;
  volume: number;
  origin: number;
  offset: number;
  playing: boolean;
  loopsLeft: number;
  onEnd: (() => void) | null;
  generation: number;
  timer: ReturnType<typeof setTimeout> | null;
  next: number;
}

interface Patch { wave: OscillatorType; a: number; d: number; s: number; r: number; cutoff: number; gain: number; detune?: number }
const PATCHES: Patch[] = [
  { wave: 'triangle', a: 0.004, d: 0.6, s: 0.25, r: 0.25, cutoff: 5000, gain: 0.9 },
  { wave: 'sine', a: 0.002, d: 0.35, s: 0.05, r: 0.25, cutoff: 8000, gain: 0.8 },
  { wave: 'square', a: 0.01, d: 0.1, s: 0.8, r: 0.08, cutoff: 2200, gain: 0.45 },
  { wave: 'sawtooth', a: 0.004, d: 0.5, s: 0.15, r: 0.2, cutoff: 2000, gain: 0.55 },
  { wave: 'triangle', a: 0.004, d: 0.3, s: 0.6, r: 0.1, cutoff: 1200, gain: 1.0 },
  { wave: 'sawtooth', a: 0.08, d: 0.2, s: 0.8, r: 0.3, cutoff: 2600, gain: 0.45, detune: 6 },
  { wave: 'sawtooth', a: 0.06, d: 0.2, s: 0.8, r: 0.35, cutoff: 2400, gain: 0.45, detune: 8 },
  { wave: 'sawtooth', a: 0.03, d: 0.15, s: 0.75, r: 0.15, cutoff: 3000, gain: 0.5 },
  { wave: 'square', a: 0.03, d: 0.1, s: 0.75, r: 0.12, cutoff: 2600, gain: 0.45 },
  { wave: 'sine', a: 0.04, d: 0.1, s: 0.85, r: 0.15, cutoff: 6000, gain: 0.8 },
  { wave: 'square', a: 0.005, d: 0.1, s: 0.8, r: 0.1, cutoff: 4000, gain: 0.45 },
  { wave: 'sawtooth', a: 0.25, d: 0.3, s: 0.85, r: 0.5, cutoff: 1500, gain: 0.45, detune: 10 },
  { wave: 'triangle', a: 0.05, d: 0.3, s: 0.6, r: 0.4, cutoff: 3000, gain: 0.6 },
  { wave: 'triangle', a: 0.004, d: 0.4, s: 0.2, r: 0.2, cutoff: 4000, gain: 0.8 },
  { wave: 'sine', a: 0.002, d: 0.25, s: 0.0, r: 0.15, cutoff: 6000, gain: 0.9 },
  { wave: 'sawtooth', a: 0.01, d: 0.3, s: 0.3, r: 0.3, cutoff: 1800, gain: 0.4 },
];
const TONE_PATCH: Patch = { wave: 'square', a: 0.003, d: 0.05, s: 0.9, r: 0.03, cutoff: 6000, gain: 0.5 };

const LOOKAHEAD = 0.35;
const TICK_MS = 60;

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  noise: AudioBuffer | null = null;
  muted = false;
  masterVolume = 0.8;
  log: (msg: string) => void = () => {};
  private warned = new Set<string>();

  unlock(): void {
    const c = this.audio();
    if (c && c.state === 'suspended') void c.resume();
  }

  audio(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
      } catch {
        return null;
      }
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.connect(comp);
      this.applyMaster();
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
    }
    return this.ctx;
  }

  private applyMaster(): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.02);
  }

  setMuted(m: boolean): void { this.muted = m; this.applyMaster(); }
  setVolume(v: number): void { this.masterVolume = Math.max(0, Math.min(1, v)); this.applyMaster(); }

  setSuspended(s: boolean): void {
    const c = this.ctx;
    if (!c) return;
    if (s) void c.suspend(); else void c.resume();
  }

  warn(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.log(`[audio] ${msg}`);
  }
}

export class WebAudioHost implements AudioHost {
  private clips = new Map<number, Clip>();
  private out: GainNode | null = null;
  private sessionMuted = false;

  constructor(private engine: AudioEngine) {}

  private get ctx(): AudioContext | null { return this.engine.ctx; }
  private get noise(): AudioBuffer | null { return this.engine.noise; }

  private audio(): AudioContext | null {
    const c = this.engine.audio();
    if (c && !this.out) {
      this.out = c.createGain();
      this.out.gain.value = this.sessionMuted ? 0 : 1;
      this.out.connect(this.engine.master!);
    }
    return c;
  }

  unlock(): void { this.engine.unlock(); }

  setSessionMuted(m: boolean): void {
    this.sessionMuted = m;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03);
  }

  private warn(key: string, msg: string): void { this.engine.warn(key, msg); }

  create(handle: number, data: Uint8Array | null, type: string): void {
    const clip: Clip = {
      type: type.toLowerCase(), buffer: null, decoding: null, midi: null, tones: null, length: 0,
      sources: [], gain: null, volume: 100, origin: 0, offset: 0, playing: false, loopsLeft: 1,
      onEnd: null, generation: 0, timer: null, next: 0,
    };
    this.clips.set(handle, clip);
    if (!data) return;
    if (isMidi(data, clip.type)) {
      try {
        const r = parseMidi(data);
        clip.midi = r.notes;
        clip.length = r.duration;
      } catch (e) {
        this.warn('midi', `MIDI file not playable: ${e}`);
        clip.midi = [];
      }
      return;
    }
    if (clip.type.includes('amr') || (data[0] === 0x23 && data[1] === 0x21 && data[2] === 0x41)) {
      this.warn('amr', 'AMR audio is not supported by browsers; it will be silent');
      return;
    }
    const ctx = this.audio();
    if (!ctx) return;
    clip.decoding = ctx.decodeAudioData(data.slice().buffer).then(
      (b) => { clip.buffer = b; clip.length = b.duration; },
      () => this.warn(`decode-${clip.type}`, `Cannot decode audio (${clip.type || 'unknown type'})`),
    );
  }

  start(handle: number, loops: number, onEnd: () => void): void {
    const clip = this.clips.get(handle);
    const ctx = this.audio();
    if (!clip || !ctx) { setTimeout(onEnd, 0); return; }
    clip.onEnd = onEnd;
    clip.loopsLeft = loops;
    clip.playing = true;
    const gen = ++clip.generation;
    const go = () => { if (clip.playing && gen === clip.generation) this.beginPass(clip, gen); };
    if (clip.decoding && !clip.buffer) void clip.decoding.then(go);
    else go();
  }

  private beginPass(clip: Clip, gen: number): void {
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') void ctx.resume();
    if (!clip.gain) {
      clip.gain = ctx.createGain();
      clip.gain.connect(this.out!);
    }
    clip.gain.gain.value = clip.volume / 100;
    const t0 = ctx.currentTime + 0.02;
    clip.origin = t0 - clip.offset;
    if (clip.buffer) {
      const src = ctx.createBufferSource();
      src.buffer = clip.buffer;
      src.connect(clip.gain);
      src.start(t0, Math.min(clip.offset, clip.buffer.duration));
      clip.sources.push(src);
      this.after(clip, gen, clip.buffer.duration - clip.offset);
    } else if (clip.midi || clip.tones) {
      const notes = (clip.midi ?? clip.tones)!;
      clip.next = 0;
      while (clip.next < notes.length && notes[clip.next].end <= clip.offset) clip.next++;
      this.schedule(clip, gen);
    } else {
      this.after(clip, gen, 0.05);
    }
  }

  private schedule(clip: Clip, gen: number): void {
    if (gen !== clip.generation || !clip.playing) return;
    const ctx = this.ctx!;
    const notes = (clip.midi ?? clip.tones)!;
    const horizon = ctx.currentTime + LOOKAHEAD - clip.origin;
    while (clip.next < notes.length && notes[clip.next].start < horizon) {
      const n = notes[clip.next++];
      const start = clip.origin + Math.max(n.start, clip.offset);
      const dur = Math.max(0.02, n.end - Math.max(n.start, clip.offset));
      if (clip.midi && n.channel === 9) this.drum(clip, n.note, n.velocity * n.volume, start);
      else this.voice(clip, clip.midi ? PATCHES[n.program >> 3] : TONE_PATCH, n, start, dur);
    }
    if (clip.sources.length > 256) clip.sources = clip.sources.slice(-128);
    if (clip.next >= notes.length && ctx.currentTime - clip.origin >= clip.length) {
      this.passDone(clip, gen);
      return;
    }
    clip.timer = setTimeout(() => this.schedule(clip, gen), TICK_MS);
  }

  private after(clip: Clip, gen: number, seconds: number): void {
    clip.timer = setTimeout(() => this.passDone(clip, gen), Math.max(20, seconds * 1000 + 10));
  }

  private passDone(clip: Clip, gen: number): void {
    if (gen !== clip.generation || !clip.playing) return;
    clip.offset = 0;
    if (clip.loopsLeft === -1 || --clip.loopsLeft > 0) {
      this.beginPass(clip, gen);
    } else {
      clip.playing = false;
      clip.onEnd?.();
    }
  }

  private voice(clip: Clip, p: Patch, n: MidiNote, t: number, dur: number): void {
    const ctx = this.ctx!;
    const vel = (n.velocity / 127) ** 1.6 * n.volume;
    const peak = 0.22 * p.gain * vel;
    if (peak <= 0.001) return;
    const freq = 440 * Math.pow(2, (n.note + n.bend - 69) / 12);
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(18000, p.cutoff * (0.6 + vel));
    filter.connect(env).connect(clip.gain!);
    const oscs: OscillatorNode[] = [];
    for (const det of p.detune ? [-p.detune, p.detune] : [0]) {
      const o = ctx.createOscillator();
      o.type = p.wave;
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(filter);
      oscs.push(o);
    }
    const level = p.detune ? peak * 0.7 : peak;
    const sustain = level * p.s;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + p.a);
    env.gain.setTargetAtTime(sustain, t + p.a, p.d / 3);
    const off = t + Math.max(dur, p.a);
    env.gain.setTargetAtTime(0, off, p.r / 3);
    for (const o of oscs) {
      o.start(t);
      o.stop(off + p.r * 2 + 0.05);
      clip.sources.push(o);
    }
  }

  private drum(clip: Clip, note: number, velocity: number, t: number): void {
    const ctx = this.ctx!;
    const v = (velocity / 127) ** 1.4 * 0.5;
    if (v <= 0.002) return;
    const out = ctx.createGain();
    out.connect(clip.gain!);
    if (note === 35 || note === 36) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      out.gain.setValueAtTime(v * 1.6, t);
      out.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(out);
      o.start(t);
      o.stop(t + 0.25);
      clip.sources.push(o);
      return;
    }
    if (note >= 41 && note <= 50 && note !== 42 && note !== 44 && note !== 46 && note !== 49) {
      const o = ctx.createOscillator();
      const f = 80 + (note - 41) * 22;
      o.frequency.setValueAtTime(f * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.15);
      out.gain.setValueAtTime(v * 1.2, t);
      out.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(out);
      o.start(t);
      o.stop(t + 0.32);
      clip.sources.push(o);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    let len = 0.08;
    if (note === 38 || note === 40 || note === 37 || note === 39) { f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; len = 0.16; }
    else if (note === 42 || note === 44) { f.type = 'highpass'; f.frequency.value = 7000; len = 0.05; }
    else if (note === 46) { f.type = 'highpass'; f.frequency.value = 6500; len = 0.25; }
    else if (note === 49 || note === 57 || note === 52 || note === 55) { f.type = 'highpass'; f.frequency.value = 4500; len = 0.7; }
    else if (note === 51 || note === 53 || note === 59) { f.type = 'highpass'; f.frequency.value = 5500; len = 0.35; }
    else { f.type = 'bandpass'; f.frequency.value = 3000; len = 0.06; }
    out.gain.setValueAtTime(v, t);
    out.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
    clip.sources.push(src);
  }

  private silence(clip: Clip): void {
    if (clip.timer) { clearTimeout(clip.timer); clip.timer = null; }
    const now = this.ctx?.currentTime ?? 0;
    if (clip.gain) {
      clip.gain.gain.setTargetAtTime(0, now, 0.01);
      const g = clip.gain;
      const srcs = clip.sources;
      setTimeout(() => {
        for (const s of srcs) { try { s.stop(); } catch {  } }
        g.disconnect();
      }, 60);
      clip.gain = null;
    }
    clip.sources = [];
  }

  stop(handle: number): void {
    const clip = this.clips.get(handle);
    if (!clip || !clip.playing) return;
    clip.offset = this.ctx ? Math.max(0, Math.min(clip.length, this.ctx.currentTime - clip.origin)) : 0;
    clip.playing = false;
    clip.generation++;
    this.silence(clip);
  }

  close(handle: number): void {
    const clip = this.clips.get(handle);
    if (!clip) return;
    clip.playing = false;
    clip.generation++;
    this.silence(clip);
    this.clips.delete(handle);
  }

  setTime(handle: number, micros: number): void {
    const clip = this.clips.get(handle);
    if (!clip) return;
    clip.offset = Math.max(0, micros / 1e6);
    if (clip.playing) {
      const gen = ++clip.generation;
      this.silence(clip);
      this.beginPass(clip, gen);
    }
  }

  time(handle: number): number {
    const clip = this.clips.get(handle);
    if (!clip) return 0;
    if (clip.playing && this.ctx) return Math.max(0, (this.ctx.currentTime - clip.origin) * 1e6);
    return clip.offset * 1e6;
  }

  duration(handle: number): number {
    const clip = this.clips.get(handle);
    if (!clip || (!clip.buffer && !clip.midi && !clip.tones)) return -1;
    return clip.length * 1e6;
  }

  volume(handle: number, level: number): void {
    const clip = this.clips.get(handle);
    if (!clip) return;
    clip.volume = level;
    if (clip.gain && this.ctx) clip.gain.gain.setTargetAtTime(level / 100, this.ctx.currentTime, 0.02);
  }

  toneSequence(handle: number, seq: Uint8Array): void {
    const clip = this.clips.get(handle);
    if (!clip) return;
    clip.tones = parseToneSequence(seq);
    clip.length = clip.tones.length ? clip.tones[clip.tones.length - 1].end : 0;
  }

  tone(note: number, durationMs: number, volume: number): void {
    const ctx = this.audio();
    if (!ctx || this.engine.muted || this.sessionMuted) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const tmp: Clip = { gain: ctx.createGain(), sources: [] } as unknown as Clip;
    tmp.gain!.connect(this.out!);
    const n: MidiNote = { channel: 0, note, velocity: 127, program: 0, volume: Math.max(0, Math.min(100, volume)) / 100, bend: 0, start: 0, end: 0 };
    this.voice(tmp, TONE_PATCH, n, ctx.currentTime + 0.005, durationMs / 1000);
    setTimeout(() => tmp.gain!.disconnect(), durationMs + 300);
  }

  closeAll(): void {
    for (const h of [...this.clips.keys()]) this.close(h);
  }

  dispose(): void {
    this.closeAll();
    this.out?.disconnect();
    this.out = null;
  }
}

function isMidi(data: Uint8Array, _type: string): boolean {
  return data[0] === 0x4d && data[1] === 0x54 && data[2] === 0x68 && data[3] === 0x64;
}

export function parseToneSequence(seq: Uint8Array): MidiNote[] {
  const s = Array.from(seq, (v) => (v << 24) >> 24);
  let i = 0;
  let tempo = 120, resolution = 64;
  const blocks = new Map<number, number[]>();
  const main: number[] = [];
  if (s[i] === -2) i += 2;
  if (s[i] === -3) { tempo = (s[i + 1] & 0xff) * 4; i += 2; }
  if (s[i] === -4) { resolution = s[i + 1] & 0xff; i += 2; }
  while (i + 1 < s.length) {
    if (s[i] === -5) {
      const id = s[i + 1];
      i += 2;
      const body: number[] = [];
      while (i + 1 < s.length && !(s[i] === -6 && s[i + 1] === id)) { body.push(s[i], s[i + 1]); i += 2; }
      i += 2;
      blocks.set(id, body);
    } else {
      main.push(s[i], s[i + 1]);
      i += 2;
    }
  }
  const out: MidiNote[] = [];
  const unit = (60 / Math.max(1, tempo)) * 4 / Math.max(1, resolution);
  let t = 0;
  let vol = 1;
  const play = (ev: number[], depth: number) => {
    for (let k = 0; k + 1 < ev.length; k += 2) {
      const a = ev[k], d = ev[k + 1] & 0xff;
      if (a === -7) { if (depth < 8) play(blocks.get(ev[k + 1]) ?? [], depth + 1); }
      else if (a === -9) {
        const n = ev[k + 2], dur = (ev[k + 3] & 0xff) * unit;
        for (let r = 0; r < d; r++) { if (n >= 0) out.push(note(n, t, dur, vol)); t += dur; }
        k += 2;
      } else if (a === -8) vol = d / 100;
      else if (a >= 0) { out.push(note(a, t, d * unit, vol)); t += d * unit; }
      else if (a === -1) t += d * unit;
    }
  };
  const note = (n: number, start: number, dur: number, v: number): MidiNote =>
    ({ channel: 0, note: n, velocity: 127, program: 0, volume: v, bend: 0, start, end: start + dur });
  play(main, 0);
  return out;
}
