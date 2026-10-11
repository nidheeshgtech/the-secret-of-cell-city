// Lists every scripted line with its speaker voice and id, for scripts/record-voices.py.
import { prologue, conversations, travelLines, finale, teacherLines } from "../src/story.js";
import { lineId } from "../src/voice-id.js";

const lines = [...prologue, ...conversations.flat(), ...travelLines.map((t) => ["teacher", t]), ...finale];
for (const text of Object.values(teacherLines)) lines.push(["teacher", text]);
const seen = new Map();
for (const [speaker, text] of lines) seen.set(lineId(speaker, text), { id: lineId(speaker, text), speaker, text });
process.stdout.write(JSON.stringify([...seen.values()], null, 1));
