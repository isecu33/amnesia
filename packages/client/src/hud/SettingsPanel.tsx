import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { audio } from '../audio/audio.js';

/** Alturas internas del render pixel (docs/05 §4.6); 0 = sin pixelar. */
const PIXEL_HEIGHTS = [270, 360, 540, 720, 0];

/** Ajustes accesibles siempre (docs/02 §5.4). */
export function SettingsPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const s = useSettings();
  const t = makeT(s.lang);
  return (
    <div className="modal" role="dialog" aria-label={t('settings')}>
      <div className="modal-body pixel-panel">
        <h3 className="panel-title">{t('settings')}</h3>
        <label>
          {t('language')}
          <select
            className="pixel-input"
            value={s.lang}
            onChange={(e) => s.set({ lang: e.target.value as 'es' | 'en' })}
          >
            <option value="es">ES</option>
            <option value="en">EN</option>
          </select>
        </label>
        <label>
          {t('volume')}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(s.volume * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              s.set({ volume: v });
              audio.setVolume(v);
            }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.muted}
            onChange={(e) => {
              s.set({ muted: e.target.checked });
              audio.setMuted(e.target.checked);
            }}
          />
          {t('mute')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.colorBlind}
            onChange={(e) => s.set({ colorBlind: e.target.checked })}
          />
          {t('colorBlind')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.bigNumbers}
            onChange={(e) => s.set({ bigNumbers: e.target.checked })}
          />
          {t('bigNumbers')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.subtitles}
            onChange={(e) => s.set({ subtitles: e.target.checked })}
          />
          {t('subtitles')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.reducedMotion}
            onChange={(e) => s.set({ reducedMotion: e.target.checked })}
          />
          {t('reducedMotion')}
        </label>
        <label>
          {t('pixelHeight')}
          <select
            className="pixel-input"
            value={s.pixelHeight}
            onChange={(e) => s.set({ pixelHeight: Number(e.target.value) })}
          >
            {PIXEL_HEIGHTS.map((h) => (
              <option key={h} value={h}>
                {h === 0 ? t('pixelNative') : `${h} px`}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="pixel-btn primary" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </div>
  );
}
