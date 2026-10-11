import recorded from "./voice-lines.json";
import { lineId } from "./voice-id.js";

export { lineId };

// A tiny silent clip: playing it from a tap "unlocks" the shared player on phones.
const SILENCE =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

// Plays pre-recorded natural voices through one shared audio element (phones only let an element play
// after it was started from a tap, so the same unlocked element is reused for every line).
// play() returns false for lines with no recording so the caller can fall back to the browser voice.
export function createVoice(base = "voice/") {
  const available = new Set(recorded),
    warmed = new Set(),
    player = typeof Audio === "function" ? new Audio() : null;
  if (player) player.preload = "auto";
  let finish = null,
    blocked = null,
    token = 0,
    loaded = false;
  const url = (id) => `${base}${id}.mp3`;
  const start = () =>
    player.play().catch(() => {
      // Autoplay was refused: keep the line on screen and let the caller offer an unmute button.
      if (loaded) blocked?.();
    });
  return {
    has: (speaker, text) => available.has(lineId(speaker, text)),
    // Call from a tap/click handler so later lines may play without one.
    unlock() {
      if (!player || player.dataset?.unlocked) return;
      if (loaded) return; // a line owns the player; the next tap-started line unlocks it
      player.src = SILENCE;
      player
        .play()
        .then(() => {
          player.dataset.unlocked = "1";
          // A real line may have started meanwhile; only stop the silent clip.
          if (player.src.startsWith("data:")) player.pause();
        })
        .catch(() => {});
    },
    // Warm the browser cache so the next lines start instantly.
    preload(lines) {
      for (const [speaker, text] of lines) {
        const id = lineId(speaker, text);
        if (available.has(id) && !warmed.has(id)) {
          warmed.add(id);
          fetch(url(id)).catch(() => warmed.delete(id));
        }
      }
    },
    play(speaker, text, onEnd, held, onBlocked) {
      const id = lineId(speaker, text);
      if (!player || !available.has(id)) return false;
      this.stop();
      const mine = ++token;
      finish = onEnd;
      blocked = onBlocked;
      loaded = true;
      player.src = url(id);
      player.onended = () => mine === token && finish?.();
      if (!held) start();
      return true;
    },
    pause: () => player && !player.paused && player.pause(),
    resume: () => loaded && player.paused && !player.ended && start(),
    stop() {
      token++;
      finish = blocked = null;
      loaded = false;
      if (player) {
        player.onended = null;
        player.pause();
      }
    },
  };
}
