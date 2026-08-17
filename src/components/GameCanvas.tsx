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
    let observer: ResizeObserver | undefined;
    void (async () => {
      const { createGame } = await import("../game/createGame");
      if (cancelled || !parentRef.current || gameRef.current) return;
      const game = createGame(parentRef.current);
      gameRef.current = game;
      setLoaded(true);

      // Phaser's own RESIZE scale mode misses container size changes that
      // aren't accompanied by a window `resize` event — notably a mobile
      // orientation change, where the container is reflowed by CSS but the
      // browser fires no resize event of its own. Driving Phaser's scale
      // manager from a ResizeObserver on its actual parent is reliable
      // regardless of what triggered the layout change.
      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) game.scale.resize(width, height);
      });
      observer.observe(parentRef.current);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
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
