import { useI18n } from "../i18n/I18nProvider";

/**
 * Full-screen prompt shown by CSS (see .rotate-device in styles.css) only
 * on touch devices in portrait orientation. It is always in the DOM; the
 * `@media (orientation: portrait) and (pointer: coarse)` rule is what
 * actually shows it and hides the game underneath, so there is no layout
 * flash on desktop or on a phone that starts out landscape.
 */
export function RotateDevice() {
  const { t } = useI18n();
  return (
    <div className="rotate-device" role="status" aria-live="polite">
      <span className="rotate-device-icon" aria-hidden="true" />
      <strong>{t("game.rotateTitle")}</strong>
      <p>{t("game.rotateBody")}</p>
    </div>
  );
}
