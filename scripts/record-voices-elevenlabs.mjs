// Records every scripted line with ElevenLabs voices into public/voice/<id>.mp3.
//
//   ELEVENLABS_API_KEY=... node scripts/record-voices-elevenlabs.mjs [--force] [--only=teacher,aria]
//
// The key can also live in .env.local (git-ignored). Existing clips are kept unless --force is given.
// Needs ffmpeg on PATH for trimming and loudness levelling.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname,
  out = join(root, "public/voice"),
  args = process.argv.slice(2),
  force = args.includes("--force"),
  only = args.find((a) => a.startsWith("--only="))?.slice(7).split(","),
  dryRun = args.includes("--dry-run");

const envFile = join(root, ".env.local");
const key =
  process.env.ELEVENLABS_API_KEY ||
  (existsSync(envFile) ? readFileSync(envFile, "utf8").match(/^ELEVENLABS_API_KEY\s*=\s*"?([^"\s]+)"?/m)?.[1] : undefined);
if (!key && !dryRun) throw new Error("Set ELEVENLABS_API_KEY (environment or .env.local).");

// One stock ElevenLabs voice per character, looked up by name so ids never go stale.
const CAST = {
  teacher: { name: "Matilda", stability: 0.5, style: 0.25 }, // warm, friendly teacher
  aria: { name: "Jessica", stability: 0.35, style: 0.45 }, // bright and curious
  ben: { name: "Liam", stability: 0.4, style: 0.35 }, // thoughtful "why?" asker
  zoya: { name: "Laura", stability: 0.45, style: 0.35 }, // upbeat problem solver
  leo: { name: "Will", stability: 0.3, style: 0.55 }, // relaxed class comedian
  organelle: { name: "George", stability: 0.5, style: 0.3 }, // storyteller for the organelles
};
const MODEL = "eleven_multilingual_v2";

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.elevenlabs.io${path}`, { ...init, headers: { "xi-api-key": key, ...init.headers } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res;
};

const lines = JSON.parse(execFileSync("node", [join(root, "scripts/voice-lines.mjs")], { encoding: "utf8" })).filter(
  (l) => !only || only.includes(l.speaker),
);
const todo = lines.filter((l) => force || !existsSync(join(out, `${l.id}.mp3`)));
console.log(`${todo.length} of ${lines.length} lines to record, ${todo.reduce((n, l) => n + l.text.length, 0)} characters.`);
if (dryRun) process.exit(0);

const { voices } = await (await api("/v1/voices")).json();
for (const [speaker, cast] of Object.entries(CAST)) {
  cast.id = voices.find((v) => v.name.toLowerCase().startsWith(cast.name.toLowerCase()))?.voice_id;
  if (!cast.id) throw new Error(`Voice "${cast.name}" for ${speaker} is not in this ElevenLabs account.`);
}

mkdirSync(out, { recursive: true });
for (const [n, line] of todo.entries()) {
  const cast = CAST[line.speaker],
    res = await api(`/v1/text-to-speech/${cast.id}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: line.text,
        model_id: MODEL,
        previous_text: line.previous || undefined,
        next_text: line.next || undefined,
        voice_settings: { stability: cast.stability, similarity_boost: 0.8, style: cast.style, use_speaker_boost: true },
      }),
    }),
    raw = join(tmpdir(), `cell-city-${line.id}.mp3`);
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y", "-i", raw,
    "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-17:TP=-2:LRA=9,afade=t=in:d=0.02",
    "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", join(out, `${line.id}.mp3`),
  ]);
  unlinkSync(raw);
  console.log(`${n + 1}/${todo.length} ${line.speaker}: ${line.text.slice(0, 60)}`);
}

// The game only plays clips listed here; anything else falls back to the browser voice.
const all = JSON.parse(execFileSync("node", [join(root, "scripts/voice-lines.mjs")], { encoding: "utf8" }));
writeFileSync(join(root, "src/voice-lines.json"), JSON.stringify(all.filter((l) => existsSync(join(out, `${l.id}.mp3`))).map((l) => l.id).sort()) + "\n");
console.log("Done.");
