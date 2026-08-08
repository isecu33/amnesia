/**
 * SFX placeholder sintetizados con WebAudio (docs/01 §12: nada de assets hasta F6).
 * Cada efecto tiene su leitmotiv de 3–4 notas. Todo sonido tiene alternativa
 * visual (el log de subtítulos, docs/01 §11), así que el audio nunca es necesario.
 */
import type { SfxId } from '../presenter/timelines.js';

interface Recipe {
  /** frecuencias en Hz */
  notes: number[];
  type: OscillatorType;
  /** duración de cada nota en s */
  noteMs: number;
  gain: number;
  noise?: boolean;
}

export const RECIPES: Record<SfxId, Recipe> = {
  draw: { notes: [520, 660], type: 'triangle', noteMs: 90, gain: 0.16, noise: true },
  discard: { notes: [180, 130], type: 'square', noteMs: 70, gain: 0.2, noise: true },
  swap: { notes: [420, 500, 420], type: 'triangle', noteMs: 80, gain: 0.16, noise: true },
  peek: { notes: [392, 523, 659], type: 'sine', noteMs: 240, gain: 0.14 },
  spy: { notes: [330, 247, 196], type: 'sine', noteMs: 260, gain: 0.14, noise: true },
  blindSwap: { notes: [300, 240, 300, 240], type: 'sawtooth', noteMs: 130, gain: 0.1, noise: true },
  matchOk: { notes: [659, 880, 1174], type: 'triangle', noteMs: 110, gain: 0.2 },
  matchFail: { notes: [220, 165, 110], type: 'sawtooth', noteMs: 220, gain: 0.2, noise: true },
  ultima: { notes: [98, 82, 65], type: 'sine', noteMs: 420, gain: 0.28 },
  reveal: { notes: [294, 349, 392, 466], type: 'triangle', noteMs: 260, gain: 0.16 },
  penalty: { notes: [147, 123], type: 'sawtooth', noteMs: 140, gain: 0.16 },
  reject: { notes: [200, 150], type: 'square', noteMs: 70, gain: 0.12 },
  turn: { notes: [440], type: 'sine', noteMs: 90, gain: 0.08 },
  emote: { notes: [523], type: 'triangle', noteMs: 130, gain: 0.14 },
};

/**
 * Gestos sonoros no tóxicos (docs/01 §11): mismo timbre, distinto motivo.
 * El índice coincide con EMOTES de hud/EmoteWheel.
 */
export const EMOTE_MOTIFS: number[][] = [
  [523, 659], // saludo
  [659, 784, 880], // risa
  [392, 349], // sospecha
  [523, 523, 659], // aplauso
  [330, 262], // «uf»
  [880, 880, 1047], // «piensa rápido»
];

export type MusicIntensity = 'calm' | 'tense';

export class Audio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private volume = 0.7;
  private muted = false;
  private ambient?: { bus: GainNode; fire: AudioBufferSourceNode };
  private musicBus?: GainNode;
  private musicTimer?: ReturnType<typeof globalThis.setTimeout>;
  private chirpTimer?: ReturnType<typeof globalThis.setTimeout>;
  private intensity: MusicIntensity = 'calm';

  /** Debe llamarse desde un gesto del usuario (política de autoplay). */
  unlock(): void {
    if (this.ctx) return;
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  play(id: SfxId): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const r = RECIPES[id];
    let t = ctx.currentTime;
    for (const freq of r.notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = r.type;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(r.gain, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t + r.noteMs / 1000);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + r.noteMs / 1000 + 0.02);
      t += (r.noteMs / 1000) * 0.85;
    }
    if (r.noise) this.foley(ctx, master, r.gain * 0.5);
  }

  /** Gesto sonoro de la rueda de emotes. */
  playEmote(id: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const motif = EMOTE_MOTIFS[Math.max(0, Math.min(EMOTE_MOTIFS.length - 1, id))] ?? [523];
    let t = ctx.currentTime;
    for (const freq of motif) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.13, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.18);
      t += 0.11;
    }
  }

  // --- ambiente y música (docs/01 §12) ------------------------------------

  /** Arranca grillos + fuego crepitante. Idempotente. */
  startAmbient(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.ambient) return;
    const bus = ctx.createGain();
    bus.gain.value = 0.16;
    bus.connect(master);

    // Fuego: ruido marrón filtrado paso bajo.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      prev = (prev + 0.02 * white) / 1.02;
      data[i] = prev * 3.2;
    }
    const fire = ctx.createBufferSource();
    fire.buffer = buf;
    fire.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    fire.connect(lp).connect(bus);
    fire.start();

    // Grillos: pulsos agudos con jitter.
    const crickets = ctx.createGain();
    crickets.gain.value = 0.05;
    crickets.connect(bus);
    const chirp = (): void => {
      if (!this.ambient) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 4200 + Math.random() * 600;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
      osc.connect(g).connect(crickets);
      osc.start(t);
      osc.stop(t + 0.06);
      this.chirpTimer = globalThis.setTimeout(chirp, 220 + Math.random() * 900);
    };
    this.ambient = { bus, fire };
    chirp();
    this.startMusic();
  }

  /** Música folk lo-fi mínima: arpegio de 4 notas, dos intensidades. */
  private startMusic(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.musicTimer !== undefined) return;
    const bus = ctx.createGain();
    bus.gain.value = 0.07;
    bus.connect(master);
    this.musicBus = bus;
    let step = 0;
    const tick = (): void => {
      if (this.musicTimer === undefined) return;
      const scale = this.intensity === 'tense' ? [220, 262, 294, 349, 392] : [196, 220, 262, 294];
      const freq = scale[step % scale.length] as number;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = this.intensity === 'tense' ? 'sawtooth' : 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime;
      const dur = this.intensity === 'tense' ? 0.36 : 0.6;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(this.intensity === 'tense' ? 0.1 : 0.07, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
      osc.connect(g).connect(bus);
      osc.start(t);
      osc.stop(t + dur + 0.05);
      step++;
      this.musicTimer = globalThis.setTimeout(tick, this.intensity === 'tense' ? 380 : 700);
    };
    this.musicTimer = globalThis.setTimeout(tick, 400);
  }

  /** La música sube de intensidad tras cantarse ÚLTIMA (docs/01 §12). */
  setIntensity(i: MusicIntensity): void {
    this.intensity = i;
    if (this.musicBus) this.musicBus.gain.value = i === 'tense' ? 0.1 : 0.07;
  }
  get musicIntensity(): MusicIntensity {
    return this.intensity;
  }

  stopAmbient(): void {
    if (this.chirpTimer !== undefined) globalThis.clearTimeout(this.chirpTimer);
    if (this.musicTimer !== undefined) globalThis.clearTimeout(this.musicTimer);
    this.chirpTimer = undefined;
    this.musicTimer = undefined;
    try {
      this.ambient?.fire.stop();
    } catch {
      // ya parado
    }
    this.ambient?.bus.disconnect();
    this.musicBus?.disconnect();
    this.ambient = undefined;
    this.musicBus = undefined;
  }

  /** Foley de madera y cartón: ruido corto filtrado. */
  private foley(ctx: AudioContext, master: GainNode, gain: number): void {
    const len = Math.floor(ctx.sampleRate * 0.09);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(master);
    src.start();
  }
}

export const audio = new Audio();
