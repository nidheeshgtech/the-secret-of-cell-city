// Lists every scripted line with its speaker voice and id, for scripts/record-voices.py.
import { prologue, conversations, travelLines, finale, teacherLines, welcomeBack, welcomeBackFinished } from "../src/story.js";
import { stops } from "../src/data.js";
import { lineId } from "../src/voice-id.js";

const lines = [...prologue, ...conversations.flat(), ...travelLines.map((t) => ["teacher", t]), ...finale];
for (const text of [...Object.values(teacherLines), ...stops.map((s) => welcomeBack(s.place)), welcomeBackFinished])
  lines.push(["teacher", text]);
// Neighbouring lines in a conversation help a voice engine keep natural intonation.
const seen = new Map(),
  context = (group) =>
    group.forEach(([speaker, text], i) => {
      const id = lineId(speaker, text);
      if (!seen.has(id)) seen.set(id, { id, speaker, text, previous: group[i - 1]?.[1] ?? "", next: group[i + 1]?.[1] ?? "" });
    });
for (const group of [prologue, ...conversations, finale]) context(group);
for (const [speaker, text] of lines) context([[speaker, text]]);
process.stdout.write(JSON.stringify([...seen.values()], null, 1));
