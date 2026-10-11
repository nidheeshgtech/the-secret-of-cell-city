// Pure game helpers: no DOM, so they can be tested with node --test.

export function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// One round per answer index: the correct answer plus two distinct distractors, in random order.
export function buildRounds(answers, total, random = Math.random) {
  return shuffle(answers, random).map((answer) => {
    const others = shuffle(
      Array.from({ length: total }, (_, i) => i).filter((i) => i !== answer),
      random,
    ).slice(0, 2);
    return { answer, options: shuffle([answer, ...others], random) };
  });
}

// Time a young reader needs for a line when narration is off.
export function readingDelay(text) {
  return Math.max(2600, text.length * 60 + 1200);
}

// Upper bound for a spoken line, used if the speech engine never reports the end.
export function speechFallbackDelay(text) {
  return Math.max(4000, text.length * 95 + 2500);
}

export function loadState(saved) {
  const mistakes = Array.from({ length: 9 }, (_, i) => Math.max(0, Number(saved?.mistakes?.[i]) || 0));
  return {
    done: Math.min(9, Math.max(0, Number(saved?.done) || 0)),
    stars: Math.max(0, Number(saved?.stars) || 0),
    rescued: saved?.rescued === true,
    finished: saved?.finished === true,
    mistakes,
    rescueMistakes: Math.max(0, Number(saved?.rescueMistakes) || 0),
    finalMistakes: Math.max(0, Number(saved?.finalMistakes) || 0),
    startedAt: Number(saved?.startedAt) || 0,
    finishedAt: Number(saved?.finishedAt) || 0,
  };
}

export function formatDuration(ms) {
  if (!(ms > 0)) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
