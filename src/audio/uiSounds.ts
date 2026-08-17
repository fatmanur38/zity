let audioContext: AudioContext | null = null;

function soundContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}

export function playObjectiveTransitionSound(): void {
  const context = soundContext();
  if (!context) return;

  const play = () => {
    const start = context.currentTime + 0.01;
    [659.25, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const toneStart = start + index * 0.075;
      const toneEnd = toneStart + 0.12;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, toneStart);
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.026, toneStart + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneEnd + 0.01);
    });
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}
