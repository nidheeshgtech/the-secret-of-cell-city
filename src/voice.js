import recorded from "./voice-lines.json";
import { lineId } from "./voice-id.js";

export { lineId };

// Plays pre-recorded natural voices; returns false for lines with no recording so the caller can fall back.
export function createVoice(base = "voice/") {
  const available = new Set(recorded),
    cache = new Map();
  let current = null,
    finish = null;
  const clip = (id) => {
    if (!cache.has(id)) {
      const audio = new Audio(`${base}${id}.mp3`);
      audio.preload = "auto";
      cache.set(id, audio);
      if (cache.size > 24) cache.delete(cache.keys().next().value);
    }
    return cache.get(id);
  };
  return {
    has: (speaker, text) => available.has(lineId(speaker, text)),
    // Warm up the next lines so they start instantly.
    preload(lines) {
      for (const [speaker, text] of lines) if (available.has(lineId(speaker, text))) clip(lineId(speaker, text));
    },
    play(speaker, text, onEnd, held) {
      const id = lineId(speaker, text);
      if (!available.has(id)) return false;
      this.stop();
      current = clip(id);
      current.currentTime = 0;
      finish = onEnd;
      const audio = current;
      audio.onended = () => audio === current && finish?.();
      if (!held) audio.play().catch(() => audio === current && finish?.());
      return true;
    },
    pause: () => current?.pause(),
    resume: () => current?.paused && !current.ended && current.play().catch(() => {}),
    stop() {
      if (current) {
        current.onended = null;
        current.pause();
      }
      current = finish = null;
    },
  };
}
