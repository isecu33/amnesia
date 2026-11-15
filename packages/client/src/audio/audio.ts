/**
 * SFX placeholder sintetizados con WebAudio (docs/01 §12: nada de assets hasta F6).
 * Cada efecto tiene su leitmotiv de 3–4 notas. Todo sonido tiene alternativa
 * visual (el log de subtítulos, docs/01 §11), así que el audio nunca es necesario.
 */
import type { SfxId } from '../presenter/timelines.js';

/** Ruido filtrado (roces, viento, susurro, redoble). */
interface Hiss {
  /** frecuencia central inicial / final del paso banda (Hz) */
  from: number;
  to: number;
  ms: number;
  q?: number;
  /** ráfagas repetidas (redoble, barajar, aleteo) */
  repeat?: number;
  gapMs?: number;
  /** ganancia relativa a `gain` (por defecto 0,5) */
  level?: number;
}

export interface Recipe {
  /** frecuencias en Hz */
  notes: number[];
  type: OscillatorType;
  /** duración de cada nota en ms */
  noteMs: number;
  gain: number;
  /** foley corto de cartón/madera */
  noise?: boolean;
  /** caída de tono por nota (frecuencia final / inicial): cuerda rota, gong */
  glide?: number;
  /** parciales inarmónicos (campana, gong): multiplicadores de frecuencia */
  partials?: number[];
  /** golpe grave que cae en picado (Hz inicial): da peso físico */
  thump?: number;
  hiss?: Hiss;
  /** envío a la reverb nocturna (0..1) */
  wet?: number;
}

/** Desafinado aleatorio por reproducción: el mismo SFX nunca suena idéntico. */
export const DETUNE_SPREAD = 0.015;
const REVERB_DELAYS_S = [0.113, 0.171, 0.239];
const REVERB_FEEDBACK = 0.38;
const REVERB_LOWPASS_HZ = 2400;

/** SFX de la tabla de docs/01 §11 (columna «Sonido»), sintetizados (D-014). */
export const RECIPES: Record<SfxId, Recipe> = {
  // Roce de cartón + nota suave
  draw: {
    notes: [660],
    type: 'sine',
    noteMs: 160,
    gain: 0.1,
    hiss: { from: 2400, to: 5200, ms: 130, q: 1.2, level: 0.9 },
    wet: 0.2,
  },
  // Slap de madera
  discard: {
    notes: [190],
    type: 'triangle',
    noteMs: 70,
    gain: 0.16,
    thump: 170,
    hiss: { from: 1500, to: 600, ms: 70, q: 0.9, level: 1 },
    wet: 0.25,
  },
  // Doble roce
  swap: {
    notes: [440, 520],
    type: 'triangle',
    noteMs: 100,
    gain: 0.12,
    hiss: { from: 2800, to: 5600, ms: 90, q: 1.2, repeat: 2, gapMs: 170, level: 0.9 },
    wet: 0.2,
  },
  // Campanilla grave
  peek: {
    notes: [392, 523],
    type: 'sine',
    noteMs: 700,
    gain: 0.12,
    partials: [1, 2.76, 5.4],
    wet: 0.55,
  },
  // Aleteo + susurro
  spy: {
    notes: [330, 247],
    type: 'sine',
    noteMs: 360,
    gain: 0.1,
    hiss: { from: 700, to: 1800, ms: 110, q: 0.7, repeat: 4, gapMs: 140, level: 1.1 },
    wet: 0.5,
  },
  // Silbido de viento
  blindSwap: {
    notes: [300, 240],
    type: 'sine',
    noteMs: 380,
    gain: 0.08,
    hiss: { from: 320, to: 2600, ms: 1100, q: 4, level: 1.6 },
    wet: 0.45,
  },
  // Golpe + campana
  matchOk: {
    notes: [659, 988],
    type: 'triangle',
    noteMs: 260,
    gain: 0.16,
    thump: 150,
    partials: [1, 2.4, 4.1],
    wet: 0.4,
  },
  // Cuerda rota + gruñido
  matchFail: {
    notes: [220, 147],
    type: 'sawtooth',
    noteMs: 300,
    gain: 0.15,
    glide: 0.55,
    thump: 95,
    hiss: { from: 220, to: 120, ms: 420, q: 0.8, level: 1.2 },
    wet: 0.3,
  },
  // Gong grave
  ultima: {
    notes: [73],
    type: 'sine',
    noteMs: 2400,
    gain: 0.28,
    glide: 0.97,
    thump: 70,
    partials: [1, 1.48, 2.03, 2.74, 3.9],
    wet: 0.6,
  },
  // Redoble suave
  reveal: {
    notes: [294, 349, 392, 466],
    type: 'triangle',
    noteMs: 260,
    gain: 0.12,
    hiss: { from: 260, to: 200, ms: 40, q: 1, repeat: 14, gapMs: 55, level: 1.2 },
    wet: 0.4,
  },
  penalty: { notes: [147, 123], type: 'sawtooth', noteMs: 140, gain: 0.14, glide: 0.8, thump: 110 },
  reject: { notes: [200, 150], type: 'square', noteMs: 70, gain: 0.1 },
  turn: { notes: [440], type: 'sine', noteMs: 120, gain: 0.07, partials: [1, 2], wet: 0.3 },
  emote: { notes: [523], type: 'triangle', noteMs: 130, gain: 0.14 },
  chain: {
    notes: [523, 659, 784],
    type: 'triangle',
    noteMs: 100,
    gain: 0.12,
    partials: [1, 3],
    wet: 0.3,
  },
  steal: {
    notes: [784, 523],
    type: 'sine',
    noteMs: 160,
    gain: 0.12,
    glide: 0.7,
    hiss: { from: 3000, to: 500, ms: 300, q: 1.5 },
    wet: 0.4,
  },
  shuffle: {
    notes: [330],
    type: 'triangle',
    noteMs: 60,
    gain: 0.08,
    hiss: { from: 2000, to: 4200, ms: 45, q: 1, repeat: 6, gapMs: 50, level: 1.2 },
  },
  victory: {
    notes: [523, 659, 784, 1047],
    type: 'triangle',
    noteMs: 220,
    gain: 0.15,
    partials: [1, 2],
    wet: 0.5,
  },
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
  private wet?: GainNode;
  private noiseBuf?: AudioBuffer;

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
    this.wet = this.buildReverb(this.ctx, this.master);
  }

  /** Reverb nocturna barata: delays con realimentación filtrada (sin impulsos). */
  private buildReverb(ctx: AudioContext, out: AudioNode): GainNode {
    const input = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = REVERB_LOWPASS_HZ;
    lp.connect(out);
    for (const t of REVERB_DELAYS_S) {
      const d = ctx.createDelay(1);
      d.delayTime.value = t;
      const fb = ctx.createGain();
      fb.gain.value = REVERB_FEEDBACK;
      input.connect(d);
      d.connect(fb).connect(d);
      d.connect(lp);
    }
    return input;
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
    const out = ctx.createGain();
    out.connect(master);
    if (r.wet && this.wet) {
      const send = ctx.createGain();
      send.gain.value = r.wet;
      out.connect(send).connect(this.wet);
    }
    const detune = 1 + (Math.random() * 2 - 1) * DETUNE_SPREAD;
    const t0 = ctx.currentTime;
    const dur = r.noteMs / 1000;
    let t = t0;
    for (const freq of r.notes) {
      (r.partials ?? [1]).forEach((mult, k) => {
        // Parciales altos más flojos y más cortos: timbre de campana.
        const level = r.gain / (1 + k * 1.6);
        this.tone(ctx, out, r.type, freq * mult * detune, t, dur / (1 + k * 0.5), level, r.glide);
      });
      t += dur * (r.partials ? 0.5 : 0.85);
    }
    if (r.thump) this.tone(ctx, out, 'sine', r.thump, t0, 0.18, r.gain * 1.3, 0.35);
    if (r.hiss) this.hiss(ctx, out, r.hiss, r.gain, t0);
    if (r.noise) this.foley(ctx, out, r.gain * 0.5);
  }

  private tone(
    ctx: AudioContext,
    out: AudioNode,
    type: OscillatorType,
    freq: number,
    t: number,
    dur: number,
    gain: number,
    glide?: number,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Ruido blanco de 1 s reutilizado por todos los «hiss». */
  private noise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuf) {
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  private hiss(ctx: AudioContext, out: AudioNode, h: Hiss, gain: number, t0: number): void {
    const n = h.repeat ?? 1;
    const dur = h.ms / 1000;
    for (let i = 0; i < n; i++) {
      const t = t0 + (i * (h.gapMs ?? h.ms)) / 1000;
      const src = ctx.createBufferSource();
      src.buffer = this.noise(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = h.q ?? 1;
      bp.frequency.setValueAtTime(h.from, t);
      bp.frequency.exponentialRampToValueAtTime(Math.max(20, h.to), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * (h.level ?? 0.5), t + Math.min(0.01, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.connect(bp).connect(g).connect(out);
      // Desfase aleatorio dentro del búfer: cada ráfaga suena distinta.
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.02);
    }
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
