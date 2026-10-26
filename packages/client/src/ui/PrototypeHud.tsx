// PROTOTYPE (wayfinder «Interfaz y HUD de Amnesia») — throwaway, rama prototype/hud-amnesia.
// Tres HUD radicalmente distintos sobre la misma mesa 3D falsa, con 4 momentos de partida.
// ?scene=hud&variant=A|B|C&m=turno|robo|ultima|rival   ·   ←/→ variante, ↑/↓ momento.
// Strings en duro a propósito (no es código de producto).
import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@totem/core';
import * as THREE from 'three';
import { World } from '../scene/world.js';
import { DISCARD_POSITION } from '../scene/layout.js';
import { useSettings } from '../settings/store.js';
import { ImmersiveLayer, type ImmersiveState } from './prototype-immersive.js';

type Moment = 'turno' | 'robo' | 'ultima' | 'rival';
const VARIANTS = ['A', 'B', 'C', 'D'] as const;
type Variant = (typeof VARIANTS)[number];
const VARIANT_NAMES: Record<Variant, string> = {
  A: 'Esquinas (D-042 + v2)',
  B: 'La mesa habla (mínima, diegética)',
  C: 'Consola inferior',
  D: 'Inmersiva (todo en la mesa)',
};
const MOMENTS: Moment[] = ['turno', 'robo', 'ultima', 'rival'];
const MOMENT_NAMES: Record<Moment, string> = {
  turno: 'Mi turno, carta en mano',
  robo: 'Ventana de Robo de efecto',
  ultima: '¡ÚLTIMA! cantada',
  rival: 'Turno rival (carrera abierta)',
};

interface Action {
  key: string;
  label: string;
  hot?: boolean;
}
interface Fake {
  active: string;
  mine: boolean;
  timer: number;
  timerMax: number;
  omen?: { glyph: string; name: string; text: string };
  chain?: { who: string; links: number };
  discard: number;
  held?: number;
  last: string;
  actions: Action[];
  steal?: { by: string; effect: string; ms: number };
  ultima?: { who: string; turnsLeft: number };
  lockedSlot?: { slot: number; s: number };
  log: string[];
}

const BASE_LOG = [
  'Bruno robó del mazo',
  'Ana acertó la carrera (cadena ×2 · −1)',
  'Carla sustituyó su slot 3',
  'Presagio: Prisa (turnos de 15 s)',
];

const FAKE: Record<Moment, Fake> = {
  turno: {
    active: 'Tú',
    mine: true,
    timer: 11,
    timerMax: 15,
    omen: { glyph: '🐇', name: 'Prisa', text: 'turnos de 15 s' },
    chain: { who: 'Ana', links: 2 },
    discard: 7,
    held: 9,
    last: 'Ana acertó la carrera (cadena ×2 · −1)',
    actions: [
      { key: 'X', label: 'Descartar' },
      { key: 'S', label: 'Sustituir (1–8)' },
      { key: 'U', label: '¡ÚLTIMA!' },
    ],
    log: BASE_LOG,
  },
  robo: {
    active: 'Bruno',
    mine: false,
    timer: 22,
    timerMax: 30,
    chain: { who: 'Ana', links: 2 },
    discard: 12,
    last: 'Bruno descartó 12 · Revuelo',
    actions: [{ key: 'E', label: 'Robar efecto', hot: true }],
    steal: { by: 'Bruno', effect: 'Revuelo', ms: 900 },
    log: ['Bruno descartó 12 · Revuelo', ...BASE_LOG],
  },
  ultima: {
    active: 'Ana',
    mine: false,
    timer: 19,
    timerMax: 30,
    discard: 4,
    last: 'Carla cantó ¡ÚLTIMA!',
    actions: [{ key: '1–8', label: 'Casar en carrera' }],
    ultima: { who: 'Carla', turnsLeft: 2 },
    lockedSlot: { slot: 2, s: 3 },
    log: ['Carla cantó ¡ÚLTIMA!', 'Fallaste la carrera: slot 3 bloqueado 5 s', ...BASE_LOG],
  },
  rival: {
    active: 'Ana',
    mine: false,
    timer: 38,
    timerMax: 45,
    omen: { glyph: '🐢', name: 'Calma', text: 'turnos de 45 s' },
    discard: 5,
    last: 'Ana robó del descarte',
    actions: [{ key: '1–8', label: 'Casar en carrera' }],
    log: ['Ana robó del descarte', 'Presagio: Calma (turnos de 45 s)', ...BASE_LOG],
  },
};

const SLOTS = 6;
const EMOTES = ['👋', '😏', '😱', '🙏'];

function param(name: string, fallback: string): string {
  return new URLSearchParams(location.search).get(name) ?? fallback;
}
function setParam(name: string, value: string): void {
  const q = new URLSearchParams(location.search);
  q.set(name, value);
  history.replaceState(null, '', `?${q.toString()}`);
}

export function PrototypeHud(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef(7);
  const settings = useSettings();
  const [variant, setVariant] = useState<Variant>(() => {
    const v = param('variant', 'A') as Variant;
    return VARIANTS.includes(v) ? v : 'A';
  });
  const [moment, setMoment] = useState<Moment>(() => {
    const m = param('m', 'turno') as Moment;
    return MOMENTS.includes(m) ? m : 'turno';
  });

  const variantRef = useRef(variant);
  variantRef.current = variant;
  const momentRef = useRef({ moment, since: performance.now() });
  if (momentRef.current.moment !== moment) momentRef.current = { moment, since: performance.now() };
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'l') setShowLog(true);
    };
    const up = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'l') setShowLog(false);
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ids = ['you', 'r1', 'r2', 'r3'];
    const hidden = (): 'hidden'[] => Array.from({ length: SLOTS }, () => 'hidden' as const);
    const view: PlayerView = {
      you: { id: 'you', slots: hidden(), sealed: false, lockedForMs: 0 },
      others: ids.slice(1).map((id) => ({ id, slots: hidden(), sealed: false, controller: 'bot' as const })),
      discardTop: 7 as PlayerView['discardTop'],
      deckCount: 30,
      phase: 'TURN_DRAW',
      activePlayer: 'r1',
      orbit: 2,
      timers: [],
      scores: Object.fromEntries(ids.map((id) => [id, { total: 0 }])),
      legal: [],
      tick: 0,
    };
    const world = new World(canvas, { colorBlind: settings.colorBlind });
    // Velas del mapa: en D las sustituyen las velas-reloj de la capa inmersiva.
    const mapCandles: THREE.Object3D[] = [];
    world.scene.traverse((o) => {
      if (!(o instanceof THREE.InstancedMesh)) return;
      const g = o.geometry as THREE.BufferGeometry & { parameters?: { height?: number; radius?: number } };
      if (g.parameters?.height === 0.14 || g.parameters?.radius === 0.024) mapCandles.push(o);
    });
    const layer = new ImmersiveLayer(world.object('bell'), world.pileMesh('discard'));
    world.scene.add(layer.root);
    let raf = 0;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const immersive = variantRef.current === 'D';
      const { moment: m, since } = momentRef.current;
      const elapsed = (now - since) / 1000;
      const d = DIEGETIC[m];
      layer.root.visible = immersive;
      for (const o of mapCandles) o.visible = !immersive;
      world.update(
        immersive
          ? { ...view, discardTop: discardRef.current as PlayerView['discardTop'], activePlayer: d.active, drawn: d.drawn }
          : { ...view, discardTop: discardRef.current as PlayerView['discardTop'] },
        {},
      );
      if (immersive) layer.update(immersiveState(m, elapsed), now / 1000);
      world.render(now);
      // Ancla 2D sobre el descarte 3D (variante B).
      const el = anchorRef.current;
      const cam = (world as unknown as { camera: THREE.Camera }).camera;
      if (el && cam) {
        const p = new THREE.Vector3(DISCARD_POSITION.x, DISCARD_POSITION.y, DISCARD_POSITION.z).project(cam);
        el.style.left = `${((p.x + 1) / 2) * canvas.clientWidth}px`;
        el.style.top = `${((1 - p.y) / 2) * canvas.clientHeight}px`;
      }
    };
    raf = requestAnimationFrame(loop);
    const onResize = (): void => world.resize();
    addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      layer.dispose();
      world.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cycle = <T,>(list: readonly T[], cur: T, d: number): T =>
      list[(list.indexOf(cur) + d + list.length) % list.length] as T;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const next = cycle(VARIANTS, variant, e.key === 'ArrowLeft' ? -1 : 1);
        setVariant(next);
        setParam('variant', next);
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const next = cycle(MOMENTS, moment, e.key === 'ArrowUp' ? -1 : 1);
        setMoment(next);
        setParam('m', next);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [variant, moment]);

  const f = FAKE[moment];
  discardRef.current = f.discard;
  return (
    <div className="ph-root">
      <style>{CSS}</style>
      <div className="ph-stage">
        <canvas ref={canvasRef} className="ph-canvas" />
        {variant === 'A' && <VariantA f={f} />}
        {variant === 'B' && <VariantB f={f} anchorRef={anchorRef} />}
        {variant === 'C' && <VariantC f={f} />}
        {variant === 'D' && showLog ? <LogScroll lines={f.log} /> : null}
      </div>
      <Switcher
        variant={variant}
        moment={moment}
        onVariant={(v) => {
          setVariant(v);
          setParam('variant', v);
        }}
        onMoment={(m) => {
          setMoment(m);
          setParam('m', m);
        }}
      />
    </div>
  );
}

/* ───────── piezas compartidas mínimas ───────── */

function Slots({ f, compact }: { f: Fake; compact?: boolean }): JSX.Element {
  return (
    <ol className={`ph-slots${compact ? ' compact' : ''}`}>
      {Array.from({ length: SLOTS }, (_, i) => {
        const locked = f.lockedSlot?.slot === i;
        const legal = !locked && (f.mine || f.actions.some((a) => a.key === '1–8'));
        return (
          <li key={i} className={`${legal ? 'legal' : ''}${locked ? ' locked' : ''}${i === 4 ? ' empty' : ''}`}>
            <kbd>{i + 1}</kbd>
            {locked ? <span className="ph-lock">{f.lockedSlot?.s}s</span> : null}
          </li>
        );
      })}
      <li className="ph-slot-gap">
        <span>7</span>
      </li>
      <li className="ph-slot-gap">
        <span>8</span>
      </li>
    </ol>
  );
}

function Keys({ actions }: { actions: Action[] }): JSX.Element {
  return (
    <>
      {actions.map((a) => (
        <button key={a.label} type="button" className={`ph-act${a.hot ? ' hot' : ''}${a.key === 'U' ? ' ultima' : ''}`}>
          <kbd>{a.key}</kbd>
          {a.label}
        </button>
      ))}
    </>
  );
}

/* ───────── A · Esquinas (D-042 tal cual, con lo de v2 metido en las esquinas) ───────── */

function VariantA({ f }: { f: Fake }): JSX.Element {
  return (
    <div className="ph-hud a">
      <div className="a-tlcol">
      <section className="a-tl">
        <div className="a-discard">
          <small>Descarte</small>
          <b>{f.discard}</b>
          {f.chain ? <span className="a-flame">🔥×{f.chain.links}</span> : null}
        </div>
        <div>
          {f.omen ? (
            <div className="a-omen">
              {f.omen.glyph} <b>{f.omen.name}</b> · {f.omen.text}
            </div>
          ) : null}
          <p className="a-last">{f.last}</p>
          {f.chain ? <small className="muted">Cadena de {f.chain.who}</small> : null}
        </div>
      </section>
      <aside className="a-log">
        {f.log.slice(1, 4).map((l) => (
          <div key={l}>{l}</div>
        ))}
      </aside>
      </div>
      <section className="a-tc">
        <div className="a-candle">
          <div style={{ height: `${(f.timer / f.timerMax) * 100}%` }} />
        </div>
        <span className="a-secs">{f.timer}</span>
        <span>
          Juega: <b>{f.active}</b>
        </span>
      </section>
      <section className="a-tr">
        {f.steal ? (
          <div className="a-steal">
            Robo de efecto · {f.steal.effect} · {(f.steal.ms / 1000).toFixed(1)} s
          </div>
        ) : null}
        {f.held !== undefined ? <div className="a-held">En mano: <b>{f.held}</b></div> : null}
        <Keys actions={f.actions} />
      </section>
      {f.ultima ? (
        <div className="a-ultima">
          🔔 {f.ultima.who} cantó ¡ÚLTIMA! · quedan {f.ultima.turnsLeft} turnos
        </div>
      ) : null}
      <div className="a-bl">
        {EMOTES.map((e) => (
          <button key={e} type="button">
            {e}
          </button>
        ))}
      </div>
      <div className="a-br">
        <kbd>Espacio</kbd> Mis tótems
      </div>
      <div className="a-bottom">
        <Slots f={f} />
      </div>
    </div>
  );
}

/* ───────── B · La mesa habla: casi nada en esquinas; todo pegado al centro de la mesa ───────── */

function VariantB({ f, anchorRef }: { f: Fake; anchorRef: React.RefObject<HTMLDivElement> }): JSX.Element {
  return (
    <div className="ph-hud b">
      <div className="b-center" ref={anchorRef}>
        <div className="b-pile">
          {f.omen ? (
            <span className="b-omen" title={`${f.omen.name}: ${f.omen.text}`}>
              {f.omen.glyph}
            </span>
          ) : null}
          {f.chain ? <span className="b-flame">🔥{f.chain.links}</span> : null}
        </div>
        <svg className="b-ring" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" pathLength="100" strokeDasharray={`${(f.timer / f.timerMax) * 100} 100`} />
        </svg>
        {f.steal ? null : (
          <div className="b-keys">
            <Keys actions={f.actions} />
          </div>
        )}
        <p className="b-last">
          <b>{f.active}</b> · {f.last}
        </p>
        {f.steal ? (
          <div className="b-steal">
            <kbd>E</kbd> ¡Robar {f.steal.effect}!<span style={{ width: `${(f.steal.ms / 1500) * 100}%` }} />
          </div>
        ) : null}
      </div>
      {f.ultima ? (
        <div className="b-bell">
          🔔<small>{f.ultima.turnsLeft}</small>
        </div>
      ) : (
        <div className="b-bell idle">
          🔔<small>U</small>
        </div>
      )}
      {f.held !== undefined ? <div className="b-held">{f.held}</div> : null}
      <div className="b-log-hint">
        <kbd>L</kbd> log · <kbd>T</kbd> emotes · <kbd>Espacio</kbd> mis tótems
      </div>
      <div className="b-bottom">
        <Slots f={f} compact />
      </div>
    </div>
  );
}

/* ───────── C · Consola inferior: un único dock abajo; arriba solo un ticker ───────── */

function VariantC({ f }: { f: Fake }): JSX.Element {
  return (
    <div className="ph-hud c">
      <div className="c-ticker">
        {f.log.slice(0, 3).map((l, i) => (
          <span key={l} style={{ opacity: 1 - i * 0.3 }}>
            {l}
          </span>
        ))}
      </div>
      {f.ultima ? <div className="c-ultima">¡ÚLTIMA! — {f.ultima.who} · {f.ultima.turnsLeft} turnos</div> : null}
      <div className={`c-dock${f.steal ? ' flash' : ''}`}>
        <div className="c-timer" style={{ width: `${(f.timer / f.timerMax) * 100}%` }} />
        <div className="c-left">
          <div className="c-discard">
            <b>{f.discard}</b>
            <small>descarte</small>
          </div>
          <div className="c-chips">
            {f.omen ? (
              <span>
                {f.omen.glyph} {f.omen.name}
              </span>
            ) : null}
            {f.chain ? (
              <span>
                🔥 {f.chain.who} ×{f.chain.links}
              </span>
            ) : null}
            <span>
              ⏳ {f.timer}s · <b>{f.active}</b>
            </span>
          </div>
        </div>
        <div className="c-mid">
          {f.held !== undefined ? <div className="c-held">en mano {f.held}</div> : null}
          <Slots f={f} />
        </div>
        <div className="c-right">
          <Keys actions={f.actions} />
          <div className="c-emotes">
            {EMOTES.map((e) => (
              <span key={e}>{e}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── D · Inmersiva: sin capa 2D; el estado vive en objetos de la mesa (prototype-immersive.ts) ───────── */

const SEAT_OF: Record<string, number> = { Tú: 0, Ana: 1, Bruno: 2, Carla: 3 };
const ID_OF = ['you', 'r1', 'r2', 'r3'];
const OMEN_COLOR: Record<string, number> = { Prisa: 0x7be0c8, Calma: 0x6aa0ff, Destello: 0xfff27a };
const STEAL_WINDOW_S = 1.5;
const LOCK_S = 5;

const DIEGETIC: Record<Moment, { active: string; drawn?: PlayerView['drawn'] }> = {
  turno: { active: 'you', drawn: { source: 'deck', value: 9 as NonNullable<PlayerView['drawn']>['value'] } },
  robo: { active: 'r2' },
  ultima: { active: 'r1' },
  rival: { active: 'r1', drawn: { source: 'deck' } },
};

function immersiveState(m: Moment, elapsed: number): ImmersiveState {
  const f = FAKE[m];
  const left = f.timerMax - ((f.timerMax - f.timer + elapsed) % f.timerMax);
  const keys = f.actions.map((a) => a.key);
  return {
    total: ID_OF.length,
    activeSeat: SEAT_OF[f.active] ?? 0,
    timerFrac: left / f.timerMax,
    omenColor: f.omen ? OMEN_COLOR[f.omen.name] : undefined,
    chainLinks: f.chain?.links ?? 0,
    stealFrac: f.steal ? 1 - (elapsed % STEAL_WINDOW_S) / STEAL_WINDOW_S : undefined,
    ultima: f.ultima ? { seat: SEAT_OF[f.ultima.who] ?? 0, turnsLeft: f.ultima.turnsLeft } : undefined,
    locked: f.lockedSlot ? { slot: f.lockedSlot.slot, frac: 1 - (elapsed % LOCK_S) / LOCK_S } : undefined,
    slots: SLOTS,
    slotsLegal: f.mine || keys.includes('1–8'),
    keys,
  };
}

function LogScroll({ lines }: { lines: string[] }): JSX.Element {
  return (
    <div className="d-log">
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  );
}

/* ───────── switcher del prototipo (no forma parte del diseño) ───────── */

function Switcher(props: {
  variant: Variant;
  moment: Moment;
  onVariant: (v: Variant) => void;
  onMoment: (m: Moment) => void;
}): JSX.Element {
  const i = VARIANTS.indexOf(props.variant);
  const step = (d: number): Variant => VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length] as Variant;
  return (
    <div className="ph-switch">
      <button type="button" onClick={() => props.onVariant(step(-1))}>
        ←
      </button>
      <strong>
        {props.variant} · {VARIANT_NAMES[props.variant]}
      </strong>
      <button type="button" onClick={() => props.onVariant(step(1))}>
        →
      </button>
      <span className="ph-sep" />
      {MOMENTS.map((m) => (
        <button key={m} type="button" className={m === props.moment ? 'on' : ''} onClick={() => props.onMoment(m)}>
          {MOMENT_NAMES[m]}
        </button>
      ))}
    </div>
  );
}

const CSS = `
.ph-root{position:fixed;inset:0;display:flex;flex-direction:column;overflow:hidden;background:#000;color:#f2e8d5;font:14px/1.35 system-ui,sans-serif}
.ph-stage{position:relative;flex:1;min-height:0}
.ph-canvas{width:100%;height:100%;display:block}
.ph-hud{position:absolute;inset:0;pointer-events:none}
.ph-hud button{pointer-events:auto}
.ph-hud kbd{display:inline-block;min-width:1.4em;padding:0 .3em;margin-right:.35em;border:1px solid #f2e8d580;border-bottom-width:2px;border-radius:3px;font:600 12px ui-monospace,monospace;text-align:center;background:#0006}
.muted{opacity:.6}
.ph-act{display:flex;align-items:center;gap:2px;padding:6px 10px;border:1px solid #f2e8d533;border-radius:6px;background:#1b1725d9;color:inherit;font:inherit;cursor:pointer}
.ph-act.hot{border-color:#7be0c8;box-shadow:0 0 12px #7be0c8;animation:ph-pulse .5s infinite alternate}
.ph-act.ultima{border-color:#e0565b;color:#ffb3b5}
@keyframes ph-pulse{to{transform:scale(1.06)}}
.ph-slots{display:flex;gap:6px;list-style:none;margin:0;padding:0}
.ph-slots li{position:relative;width:52px;height:68px;border:2px solid #f2e8d540;border-radius:6px;background:#1b1725cc;display:flex;align-items:flex-start;justify-content:center;padding-top:4px}
.ph-slots li.legal{border-color:#7be0c8}
.ph-slots li.empty{border-style:dashed;background:transparent;opacity:.55}
.ph-slots li.locked{border-color:#e0565b;background:#3a1418cc}
.ph-slots li.ph-slot-gap{border:1px dotted #f2e8d522;background:transparent;opacity:.35}
.ph-slots.compact li{width:34px;height:42px}
.ph-lock{position:absolute;bottom:6px;color:#e0565b;font-weight:700}
/* A */
.a-tlcol{position:absolute;top:12px;left:12px;display:flex;flex-direction:column;gap:6px;max-width:380px}
.a-tl{display:flex;gap:10px;max-width:380px;background:#1b1725d9;border:1px solid #f2e8d522;border-radius:8px;padding:10px}
.a-discard{position:relative;width:64px;height:88px;border:2px solid #ffb35c;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.a-discard b{font-size:34px}
.a-flame{position:absolute;bottom:-12px;right:-14px;background:#3a1a08;border:1px solid #ffb35c;border-radius:10px;padding:0 6px;font-size:12px}
.a-omen{display:inline-block;padding:2px 8px;border-radius:10px;background:#7be0c822;border:1px solid #7be0c8;margin-bottom:4px}
.a-last{margin:2px 0}
.a-tc{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;background:#1b1725d9;border-radius:8px;padding:6px 12px}
.a-candle{width:12px;height:40px;border:1px solid #ffb35c66;display:flex;align-items:flex-end}
.a-candle div{width:100%;background:#ffb35c}
.a-secs{font-size:26px;font-weight:700}
.a-tr{position:absolute;top:12px;right:12px;display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.a-steal{background:#7be0c8;color:#1b1725;padding:4px 10px;border-radius:6px;font-weight:700}
.a-ultima{position:absolute;top:120px;left:50%;transform:translateX(-50%);background:#e0565b;color:#fff;padding:6px 16px;border-radius:6px;font-weight:700}
.a-held{background:#1b1725d9;padding:4px 10px;border-radius:6px;border:1px solid #f2e8d5}
.a-log{font-size:12px;display:flex;flex-direction:column;gap:2px;opacity:.8}
.a-log div{background:#0008;padding:2px 6px;border-radius:3px}
.a-bl{position:absolute;bottom:16px;left:12px;display:flex;gap:4px}
.a-bl button{font-size:20px;background:#1b1725d9;border:1px solid #f2e8d533;border-radius:50%;width:38px;height:38px}
.a-br{position:absolute;bottom:16px;right:12px;background:#1b1725d9;padding:6px 10px;border-radius:6px}
.a-bottom{position:absolute;bottom:12px;left:50%;transform:translateX(-50%)}
/* B */
.b-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:110px;height:110px}
.b-pile{position:absolute;inset:0}
.b-omen{position:absolute;top:-8px;left:50%;transform:translateX(-50%);font-size:22px;filter:drop-shadow(0 0 6px #7be0c8)}
.b-flame{position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);font-weight:800;color:#ffb35c;background:#1b1725cc;border-radius:8px;padding:0 5px}
.b-ring{position:absolute;inset:0;transform:rotate(-90deg)}
.b-ring circle{fill:none;stroke:#ffb35c;stroke-width:3;opacity:.8}
.b-keys{position:absolute;left:120px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:4px;white-space:nowrap}
.b-keys .ph-act{background:#1b172599;border-color:transparent;padding:3px 8px}
.b-steal{position:absolute;left:50%;top:-40px;transform:translateX(-50%);white-space:nowrap;padding:8px 16px;background:#7be0c8;color:#1b1725;border-radius:20px;font-weight:800;font-size:18px;overflow:hidden;animation:ph-pulse .4s infinite alternate}
.b-steal span{position:absolute;left:0;bottom:0;height:4px;background:#1b1725}
.b-last{position:absolute;left:50%;top:118px;transform:translateX(-50%);margin:0;padding:3px 10px;background:#0007;border-radius:4px;font-size:13px;white-space:nowrap}
.b-bell{position:absolute;right:16%;top:64%;font-size:34px;filter:drop-shadow(0 0 10px #e0565b);animation:ph-pulse .3s infinite alternate}
.b-bell.idle{filter:none;opacity:.6;animation:none;font-size:26px}
.b-bell small{font-size:12px;margin-left:2px}
.b-held{position:absolute;right:22%;bottom:12px;transform:rotate(6deg);width:60px;height:84px;background:#f2e8d5;color:#1b1725;font-size:32px;font-weight:800;border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px #000a}
.b-log-hint{position:absolute;right:12px;bottom:12px;font-size:12px;opacity:.6}
.b-bottom{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);opacity:.85}
/* C */
.c-ticker{position:absolute;top:0;left:0;right:0;display:flex;gap:28px;justify-content:center;padding:4px;background:linear-gradient(#000a,#0000);font-size:12px}
.c-ultima{position:absolute;top:28px;left:0;right:0;text-align:center;background:#e0565bcc;color:#fff;font-weight:800;letter-spacing:.1em;padding:4px}
.c-dock{position:absolute;left:0;right:0;bottom:0;height:118px;display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;padding:10px 16px;background:linear-gradient(#1b1725e6,#0f0c16f2);border-top:1px solid #f2e8d533}
.c-dock.flash{box-shadow:0 -6px 30px #7be0c8}
.c-timer{position:absolute;top:-3px;left:0;height:3px;background:#ffb35c}
.c-left{display:flex;gap:12px;align-items:center}
.c-discard{width:58px;height:80px;border:2px solid #ffb35c;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.c-discard b{font-size:28px}
.c-discard small{font-size:10px;opacity:.6}
.c-chips{display:flex;flex-direction:column;gap:4px}
.c-chips span{padding:2px 8px;border-radius:10px;background:#f2e8d514;font-size:12px}
.c-mid{position:relative}
.c-held{position:absolute;top:-28px;left:50%;transform:translateX(-50%);font-size:12px;background:#f2e8d5;color:#1b1725;padding:1px 8px;border-radius:8px;font-weight:700}
.c-right{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-items:center}
.c-emotes{display:flex;gap:2px;font-size:18px;opacity:.7}
/* D */
.d-log{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);min-width:320px;padding:10px 16px;background:#e8d6b0;color:#3a2614;font:13px/1.5 ui-monospace,monospace;border:3px solid #5a3a22;box-shadow:0 6px 0 #2a1a0e;image-rendering:pixelated}
.d-log p{margin:0}
/* switcher */
.ph-switch{flex:none;display:flex;gap:6px;align-items:center;justify-content:center;padding:6px 10px;background:#fff;color:#111;font:12px system-ui;white-space:nowrap;overflow-x:auto}
.ph-switch button{border:1px solid #ccc;background:#f4f4f4;border-radius:999px;padding:3px 8px;cursor:pointer;font:inherit;color:#111}
.ph-switch button.on{background:#111;color:#fff}
.ph-sep{width:1px;height:18px;background:#ccc}
`;
