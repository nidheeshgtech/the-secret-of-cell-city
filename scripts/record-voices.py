"""Record every scripted line with Kokoro (Apache-2.0 neural TTS) into public/voice/<id>.mp3.

Usage:
  node scripts/voice-lines.mjs > /tmp/lines.json
  python scripts/record-voices.py /tmp/lines.json path/to/kokoro-v1.0.onnx path/to/voices-v1.0.bin [espeak-ng-data dir]

Needs: pip install kokoro-onnx soundfile; ffmpeg on PATH. espeak-ng (used for pronunciation)
cannot read its data from paths longer than ~160 characters; if the virtualenv lives on a long path, copy
espeakng_loader/espeak-ng-data somewhere short and pass that directory as the last argument. Re-run after changing story text;
existing recordings are kept, so only new or edited lines are generated.
"""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import soundfile as sf
from kokoro_onnx import EspeakConfig, Kokoro

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "voice"

# Each character keeps one voice. Students use a slightly raised pitch so they sound younger.
CAST = {
    "teacher": dict(voice="af_heart", lang="en-us", speed=0.92, pitch=1.0),
    "aria": dict(voice="af_bella", lang="en-us", speed=0.94, pitch=1.07),
    "ben": dict(voice="am_puck", lang="en-us", speed=0.93, pitch=1.09),
    "zoya": dict(voice="af_kore", lang="en-us", speed=0.92, pitch=1.06),
    "leo": dict(voice="am_fenrir", lang="en-us", speed=0.97, pitch=1.1),
    "organelle": dict(voice="bf_emma", lang="en-gb", speed=0.93, pitch=1.0),
}

# Spell out abbreviations and calm shouted words so they are read naturally.
SAY = [(r"\bER\b", "E.R."), (r"\bATP\b", "A.T.P."), (r"\bDNA\b", "D.N.A."), (r"\bCELL\b", "cell"), (r"…", "...")]


def spoken(text):
    for pattern, replacement in SAY:
        text = re.sub(pattern, replacement, text)
    return text


def main(lines_path, model, voices, espeak_data=None):
    lines = json.loads(Path(lines_path).read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    tts = Kokoro(model, voices, espeak_config=EspeakConfig(data_path=espeak_data) if espeak_data else None)
    for n, line in enumerate(lines, 1):
        target = OUT / f"{line['id']}.mp3"
        if target.exists():
            continue
        cast = CAST[line["speaker"]]
        samples, rate = tts.create(spoken(line["text"]), voice=cast["voice"], speed=cast["speed"], lang=cast["lang"])
        with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
            sf.write(wav.name, samples, rate)
            p = cast["pitch"]
            filters = [
                f"asetrate={rate}*{p},aresample={rate},atempo={1 / p:.4f}" if p != 1 else "anull",
                "silenceremove=start_periods=1:start_threshold=-45dB",
                "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                "loudnorm=I=-17:TP=-2:LRA=9",
                "afade=t=in:d=0.02",
            ]
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", wav.name, "-af", ",".join(filters), "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "56k", str(target)],
                check=True,
            )
        print(f"{n}/{len(lines)} {line['speaker']}: {line['text'][:60]}")
    # The game only plays lines listed here; anything else falls back to the browser voice.
    ids = sorted(line["id"] for line in lines if (OUT / f"{line['id']}.mp3").exists())
    (ROOT / "src" / "voice-lines.json").write_text(json.dumps(ids) + "\n")
    print(f"{len(ids)} recorded lines")


if __name__ == "__main__":
    main(*sys.argv[1:5])
