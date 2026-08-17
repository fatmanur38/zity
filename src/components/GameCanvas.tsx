import { useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import { useI18n } from "../i18n/I18nProvider";

export function GameCanvas() {
  const parentRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { discoverAvailableAssets } = await import("../game/assets/manifest");
      const availableAssets = await discoverAvailableAssets();
      const { createGame } = await import("../game/createGame");
      if (cancelled || !parentRef.current || gameRef.current) return;
      gameRef.current = createGame(parentRef.current, availableAssets);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="game-canvas-wrap" aria-label={t("game.cityAria")}>
      {!loaded && <div className="game-loader"><span />{t("game.loading")}</div>}
      <div ref={parentRef} className="game-canvas" />
    </div>
  );
}
