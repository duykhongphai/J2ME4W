// WebAudio backend for javax.microedition.media.
// Plays WAV / MP3 / OGG / AAC through decodeAudioData, tones and MIDP tone sequences
// through oscillators. MIDI files are parsed and rendered with a small square-wave synth.
import type { AudioHost } from '../midp/platform';
import { parseMidi, type MidiNote } from './midi';

interface Clip {
  type: string;
  data: Uint8Array | null;
  buffer: AudioBuffer | null;
  decoding: Promise<void> | null;
  midi: MidiNote[] | null;
  midiDuration: number;
  tones: { note: number; ms: number }[] | null;
  source: AudioScheduledSourceNode[];
  gain: GainNode | null;
  volume: number;
  startedAt: number;
  offset: number;
  playing: boolean;
  loopsLeft: number;
  onEnd: (() => void) | null;
  generation: number;
}

export class WebAudioHost implements AudioHost {
  private ctx: AudioContext | null = null;
  private clips = new Map<number, Clip>();
  muted = false;

  /** Must be called from a user gesture at least once (browser autoplay policy). */
  unlock(): void {
    const c = this.audio();
    if (c && c.state === 'suspended') void c.resume();
  }

  private audio(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  create(handle: number, data: Uint8Array | null, type: string): void {
    const clip: Clip = {
      type: type.toLowerCase(), data, buffer: null, decoding: null, midi: null, midiDuration: 0, tones: null,
      source: [], gain: null, volume: 100, startedAt: 0, offset: 0, playing: false, loopsLeft: 1, onEnd: null,
      generation: 0,
    };
    this.clips.set(handle, clip);
    if (!data) return;
    if (isMidi(data, clip.type)) {
      try {
        const r = parseMidi(data);
        clip.midi = r.notes;
        clip.midiDuration = r.duration;
      } catch {
        clip.midi = [];
      }
      return;
    }
    const ctx = this.audio();
    if (!ctx) return;
    clip.decoding = ctx.decodeAudioData(data.slice().buffer).then(
      (b) => { clip.buffer = b; },
      () => { clip.buffer = null; },
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
    const go = () => {
      if (!clip.playing || gen !== clip.generation) return;
      this.playOnce(clip, gen);
    };
    if (clip.decoding && !clip.buffer) void clip.decoding.then(go);
    else go();
  }

  private playOnce(clip: Clip, gen: number): void {
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') void ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : clip.volume / 100;
    gain.connect(ctx.destination);
    clip.gain = gain;
    clip.source = [];
    const t0 = ctx.currentTime + 0.01;
    let duration = 0;
    if (clip.buffer) {
      const src = ctx.createBufferSource();
      src.buffer = clip.buffer;
      src.connect(gain);
      const off = Math.min(clip.offset, clip.buffer.duration);
      src.start(t0, off);
      clip.source.push(src);
      duration = clip.buffer.duration - off;
    } else if (clip.midi) {
      duration = Math.max(0, clip.midiDuration - clip.offset);
      for (const n of clip.midi) {
        if (n.end <= clip.offset) continue;
        if (n.channel === 9) continue; // skip percussion
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 440 * Math.pow(2, (n.note - 69) / 12);
        const g = ctx.createGain();
        g.gain.value = 0.06 * (n.velocity / 127);
        osc.connect(g).connect(gain);
        const s = Math.max(0, n.start - clip.offset);
        osc.start(t0 + s);
        osc.stop(t0 + Math.max(s + 0.02, n.end - clip.offset));
        clip.source.push(osc);
      }
    } else if (clip.tones) {
      let t = 0;
      for (const tn of clip.tones) {
        if (tn.note >= 0) {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = 440 * Math.pow(2, (tn.note - 69) / 12);
          const g = ctx.createGain();
          g.gain.value = 0.08;
          osc.connect(g).connect(gain);
          osc.start(t0 + t);
          osc.stop(t0 + t + tn.ms / 1000);
          clip.source.push(osc);
        }
        t += tn.ms / 1000;
      }
      duration = t;
    }
    clip.startedAt = t0 - clip.offset;
    setTimeout(() => {
      if (gen !== clip.generation || !clip.playing) return;
      clip.offset = 0;
      if (clip.loopsLeft === -1 || --clip.loopsLeft > 0) {
        this.playOnce(clip, gen);
      } else {
        clip.playing = false;
        clip.onEnd?.();
      }
    }, Math.max(20, duration * 1000 + 15));
  }

  private silence(clip: Clip): void {
    for (const s of clip.source) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    clip.source = [];
    clip.gain?.disconnect();
    clip.gain = null;
  }

  stop(handle: number): void {
    const clip = this.clips.get(handle);
    if (!clip || !clip.playing) return;
    clip.offset = this.ctx ? Math.max(0, this.ctx.currentTime - clip.startedAt) : 0;
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
    if (clip) clip.offset = micros / 1e6;
  }

  time(handle: number): number {
    const clip = this.clips.get(handle);
    if (!clip) return 0;
    if (clip.playing && this.ctx) return Math.max(0, (this.ctx.currentTime - clip.startedAt) * 1e6);
    return clip.offset * 1e6;
  }

  duration(handle: number): number {
    const clip = this.clips.get(handle);
    if (!clip) return -1;
    if (clip.buffer) return clip.buffer.duration * 1e6;
    if (clip.midi) return clip.midiDuration * 1e6;
    if (clip.tones) return clip.tones.reduce((a, t) => a + t.ms, 0) * 1000;
    return -1;
  }

  volume(handle: number, level: number): void {
    const clip = this.clips.get(handle);
    if (!clip) return;
    clip.volume = level;
    if (clip.gain) clip.gain.gain.value = this.muted ? 0 : level / 100;
  }

  toneSequence(handle: number, seq: Uint8Array): void {
    const clip = this.clips.get(handle);
    if (clip) clip.tones = parseToneSequence(seq);
  }

  tone(note: number, durationMs: number, volume: number): void {
    const ctx = this.audio();
    if (!ctx || this.muted) return;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
    const g = ctx.createGain();
    g.gain.value = 0.1 * Math.max(0, Math.min(100, volume)) / 100;
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    for (const c of this.clips.values()) if (c.gain) c.gain.gain.value = m ? 0 : c.volume / 100;
  }

  closeAll(): void {
    for (const h of [...this.clips.keys()]) this.close(h);
  }
}

function isMidi(data: Uint8Array, type: string): boolean {
  return type.includes('mid') || (data[0] === 0x4d && data[1] === 0x54 && data[2] === 0x68 && data[3] === 0x64);
}

/** Parses a MIDP ToneControl sequence into (note, duration ms) pairs. */
export function parseToneSequence(seq: Uint8Array): { note: number; ms: number }[] {
  const s = Array.from(seq, (v) => (v << 24) >> 24);
  let i = 0;
  let tempo = 120, resolution = 64;
  const blocks = new Map<number, number[]>();
  const main: number[] = [];
  if (s[i] === -2) i += 2; // VERSION
  if (s[i] === -3) { tempo = s[i + 1] * 4; i += 2; }
  if (s[i] === -4) { resolution = s[i + 1]; i += 2; }
  // collect events, resolving blocks
  while (i < s.length) {
    if (s[i] === -5) { // BLOCK_START
      const id = s[i + 1];
      i += 2;
      const body: number[] = [];
      while (i < s.length && !(s[i] === -6 && s[i + 1] === id)) { body.push(s[i], s[i + 1]); i += 2; }
      i += 2;
      blocks.set(id, body);
    } else {
      main.push(s[i], s[i + 1]);
      i += 2;
    }
  }
  const out: { note: number; ms: number }[] = [];
  const unitMs = (60000 / tempo) * 4 / resolution;
  const play = (ev: number[], depth: number) => {
    for (let k = 0; k + 1 < ev.length; k += 2) {
      const a = ev[k], d = ev[k + 1];
      if (a === -7) { if (depth < 8) play(blocks.get(d) ?? [], depth + 1); }
      else if (a === -9) { // REPEAT: next note repeated d times
        const n = ev[k + 2], dur = ev[k + 3];
        for (let r = 0; r < d; r++) out.push({ note: n, ms: dur * unitMs });
        k += 2;
      } else if (a === -8) { /* SET_VOLUME */ }
      else if (a >= -1) out.push({ note: a, ms: d * unitMs });
    }
  };
  play(main, 0);
  return out;
}
