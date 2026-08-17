import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { gameInput } from "../game/input/gameInput";
import { useI18n } from "../i18n/I18nProvider";
import { useGameStore } from "../stores/gameStore";

const MAX_DISTANCE = 31;

export function VirtualJoystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const { t } = useI18n();
  const tutorialDismissed = useGameStore((state) => state.tutorialDismissed);

  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    const scale = distance > MAX_DISTANCE ? MAX_DISTANCE / distance : 1;
    const next = { x: x * scale, y: y * scale };
    setPosition(next);
    gameInput.setJoystick({ x: next.x / MAX_DISTANCE, y: next.y / MAX_DISTANCE });
  };

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setPosition({ x: 0, y: 0 });
    setActive(false);
    gameInput.clearJoystick();
  };

  return (
    <div className={`joystick-cluster ${active ? "is-active" : ""}`}>
      {!tutorialDismissed && <span className="joystick-hint">{t("game.dragMove")}</span>}
      <div
        ref={baseRef}
        className="joystick-base"
        role="application"
        aria-label={t("game.joystickAria")}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setActive(true);
          update(event);
        }}
        onPointerMove={(event) => {
          if (active) update(event);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span className="joystick-knob" style={{ transform: `translate(${position.x}px, ${position.y}px)` }} />
      </div>
    </div>
  );
}
