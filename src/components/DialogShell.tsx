import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";

type DialogShellProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  closeable?: boolean;
  wide?: boolean;
  onClose: () => void;
};

export function DialogShell({
  eyebrow,
  title,
  children,
  actions,
  closeable = true,
  wide = false,
  onClose,
}: DialogShellProps) {
  const { t } = useI18n();

  return (
    <div className="overlay-backdrop scenario-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className={`dialog-card scenario-dialog ${wide ? "is-wide" : ""}`}>
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          {closeable && (
            <button type="button" className="icon-button" onClick={onClose} aria-label={t("common.close")}>
              ×
            </button>
          )}
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions scenario-actions">{actions}</div>
      </section>
    </div>
  );
}
