// Stable id for a spoken line, shared by the recording script and the game.
export function lineId(speaker, text) {
  let h = 0x811c9dc5;
  const s = `${speaker}|${text}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
