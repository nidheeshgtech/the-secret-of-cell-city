# The Secret of Cell City

A guided 3D educational game based on the supplied 12-scene story. Watch Dr. Maya and four consistent student characters travel through a living miniature city, meet nine organelles in story order, solve their challenges, handle a city emergency, and reveal a labelled cell model.

## Run

- `npm install`
- `npm run dev` — open the displayed local address.
- `npm run build` — create the production `dist` directory.
- `npm run preview` — serve the production build.
- `npm test` — run navigation, collision and game-logic tests.

MAMP or any static server can serve `dist`. Open through HTTP, not by double-clicking the HTML file.

## Play

Select **Begin field trip**. Class travels automatically; camera follows its movement. Dialogue advances on its own — after the spoken line finishes when narration is on, or after a reading pause when it is off. **Next ›**, a click on the text, or Space/Enter/→ moves on sooner; **Replay** repeats the line. Answer each challenge to continue. A wrong answer shows a hint for that organelle; after two misses the right choice is highlighted. Emergency and final-match questions and options are shuffled every run. **Pause trip** and **Resume trip** share one control, preserving current scene and dialogue timing. City map and journal remain available.

Explore freely like a map at any time: **drag** to pan across the city, **scroll or pinch** to zoom toward a spot, **right-drag, Shift-drag or two-finger twist** to turn. Release a drag to glide. The story keeps going while you look around; **Back to the class** (or the compass button) returns to the guided camera. **City map** starts the same free view from high above.

Guided travel follows navigable routes and stops for conversations. Cell membrane checkpoint must be completed before class enters. Building collision and outer boundary keep class within playable environment.

## World and story

- Female teacher and four diverse students, with consistent clothes, backpacks, walking limbs, speaking gestures, and formation at stops.
- Smoothed walking routes and a trailing camera; stops are framed to show the class and the building. Free map-style exploring and a minimap.
- Outside the membrane, a quiet extracellular sea shows neighbouring cells and drifting vesicles while leaving the city itself unchanged.
- Opening gate, photosynthesis garden, moving Golgi parcels, ER delivery carts, amino-acid assembly line, power-station steam and lights, flowing reservoir and recycling machinery.
- Walk-in nucleus with a cutaway roof and department status screens.
- Teacher, students and organelles speak in turn with their own recorded natural voices (turn on with the speaker button). A soft generated soundscape — breeze and distant birds — and gentle chimes for answers play while narration is on.
- Nine mini-games, six emergency problems, nine final matches and persistent progress.
- A trip report on the final card lists mistakes per stop and total time, for teachers.
- Final aerial reveal transforms the city into a labelled, simplified cell model.

The visuals are procedural, stylized 3D models. No external image assets are required. WebGL is needed for the city; a text-and-challenge fallback works without it. Fonts (Fraunces, Atkinson Hyperlegible) are bundled locally — no external requests. There are no accounts, analytics or collected student names. Progress is stored only in this browser.

## Biology

The city combines plant and animal examples; its final model is an educational composite, not a literal anatomical reconstruction. Journal notes explain selective permeability, rough and smooth ER, ATP, protein synthesis and the recycling role of plant lytic vacuoles. Food-source examples are distinguished from amino acids assembled by ribosomes.

## Voices

Every scripted line is pre-recorded in `public/voice/` (about 2 MB) with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), an open-weight neural text-to-speech model released under Apache-2.0. Each character keeps one voice: Dr. Maya `af_heart`, Aria `af_bella`, Ben `am_puck`, Zoya `af_kore`, Leo `am_fenrir` (students slightly pitched up), organelles `bf_emma`. Lines without a recording fall back to the best English voice the browser offers.

After editing dialogue in `src/story.js`, record the new lines (existing clips are reused):

```
python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile   # plus ffmpeg on PATH
# download kokoro-v1.0.onnx and voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0)
node scripts/voice-lines.mjs > lines.json
.venv/bin/python scripts/record-voices.py lines.json kokoro-v1.0.onnx voices-v1.0.bin
```

`src/voice-lines.json` lists the recorded clip ids; delete a clip to re-record it.

## Code layout

- `src/main.js` — UI, story flow, challenges, progress. `src/game.js` — pure quiz/progress helpers. `src/voice.js` — recorded-voice player. `src/sound.js` — generated ambience and chimes.
- `src/scene.js` — renderer, camera (follow, story framing, free explore), roads, movement, final cell model.
- `src/world/kit.js` — shared modelling helpers. `nature.js` — terrain, membrane edge, plants. `districts.js` — the nine organelle buildings and their machinery. `people.js` — the teacher and students, walk cycle and talking poses.
- `src/navigation.js` — walkable map, collision, route finding and route smoothing.

## Verification

Navigation tests cover closed gate, opening checkpoint, building collision, wall sliding, routes around obstacles and city boundary. Browser checks cover guided travel, automatic dialogue, pause/resume timing, challenge progression, persistence, journal and mobile layout.
