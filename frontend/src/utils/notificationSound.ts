let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

async function ensureAudioReady(): Promise<AudioContext | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  return ctx.state === "running" ? ctx : null;
}

/** Resume audio after browser autoplay restrictions (call from a user click). */
export function primeNotificationSound(): void {
  void ensureAudioReady();
}

/** Register once so any click/keypress unlocks notification audio before a toast arrives. */
export function installNotificationSoundUnlock(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const unlock = () => {
    void ensureAudioReady();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

/** Clear three-note chime for new in-app notifications. */
export async function playNotificationSound(): Promise<void> {
  try {
    const ctx = await ensureAudioReady();
    if (!ctx) return;

    const start = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, start);
    master.gain.exponentialRampToValueAtTime(0.55, start + 0.025);
    master.gain.setValueAtTime(0.55, start + 0.5);
    master.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    master.connect(ctx.destination);

    const notes: Array<{ frequency: number; at: number; duration: number; level: number }> = [
      { frequency: 740, at: 0, duration: 0.16, level: 0.9 },
      { frequency: 988, at: 0.12, duration: 0.16, level: 0.95 },
      { frequency: 1175, at: 0.24, duration: 0.32, level: 1 },
    ];

    for (const note of notes) {
      const at = start + note.at;
      const osc = ctx.createOscillator();
      const tone = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(note.frequency, at);
      tone.gain.setValueAtTime(0.0001, at);
      tone.gain.exponentialRampToValueAtTime(note.level, at + 0.015);
      tone.gain.exponentialRampToValueAtTime(0.0001, at + note.duration);
      osc.connect(tone);
      tone.connect(master);
      osc.start(at);
      osc.stop(at + note.duration + 0.04);
    }
  } catch {
    // Browsers may block audio until user interaction; ignore silently.
  }
}
