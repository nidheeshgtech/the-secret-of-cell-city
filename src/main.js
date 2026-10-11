import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/fraunces/600-italic.css";
import "./style.css";
import { cast, prologue, conversations, travelLines, finale, teacherLines } from "./story.js";
import { createCity } from "./scene.js";
import { stops, emergencies } from "./data.js";
import { buildRounds, readingDelay, speechFallbackDelay, loadState, formatDuration } from "./game.js";
import { createVoice } from "./voice.js";
import { createAmbience } from "./sound.js";

const paths = {
  leaf: "M19 4C8 3 3 8 5 15s15 7 14-11ZM5 20 16 8",
  gate: "M4 21V6h16v15M8 6V3h8v3M9 10v11m6-11v11",
  box: "m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10M7 5l10 4",
  route: "M5 4v12a4 4 0 0 0 8 0V8a4 4 0 0 1 8 0v12M2 7l3-3 3 3",
  protein: "M5 6h3v3H5zm11 9h3v3h-3zM8 8l8 8M16 5h3v3h-3zM5 16h3v3H5zM8 16l8-8",
  bolt: "m13 2-9 12h7l-1 8 10-13h-8z",
  drop: "M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z",
  recycle: "m8 4 4-2 4 7M16 5l-4 2 1 4M20 12l2 4-8 4m4 1-4-1 1-4M9 20H4l-2-8m-1 4 1-4 4 1",
  dna: "M7 2c0 10 10 10 10 20M17 2C17 12 7 12 7 22M8 5h8M8 19h8M10 9h4m-4 6h4",
  map: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16",
  book: "M12 6C8 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-6-1-10 2Zm0 0v15",
  star: "m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  sound: "M11 4 5 9H2v6h3l6 5V4Zm4 4c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  pause: "M8 5v14M16 5v14",
  play: "m8 5 11 7-11 7z",
  replay: "M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  compass: "m16 8-3 5-5 3 3-5 5-3ZM12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  molecule:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM5 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm14 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6.6 7.4l3.3 2.8m4.2 3.6 3.3 2.8",
};
export const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.star}"/></svg>`;
const pad = (n) => String(n).padStart(2, "0");
const speechAvailable = "speechSynthesis" in window,
  voice = createVoice(),
  ambience = createAmbience();
let currentSpeaker = "teacher",
  fallbackVoice;

let saved;
try {
  saved = JSON.parse(localStorage.getItem("cell-city-v1"));
} catch {}
let state = loadState(saved);
let active = Math.min(state.done, 8),
  started = false,
  challenge = null,
  selected = [],
  step = 0,
  mistakes = 0,
  stepMisses = 0,
  feedback = "",
  rounds = [],
  sound = false,
  modalReturn = null;
const $ = (s) => document.querySelector(s);
let storyLines = [],
  storyIndex = 0,
  storyComplete = null,
  mapOpen = false,
  userPaused = false,
  speechToken = 0;
let autoTimer = null,
  autoCallback = null,
  autoRemaining = 0,
  autoDeadline = 0,
  toastTimer = null,
  bannerTimer = null;

$("#app").innerHTML = `<header class="game-header">
  <a class="brand" href="#" aria-label="Cell City — return camera to the class"><span class="brand-icon">${icon("leaf", 22)}</span><span>Cell City<small>a field trip into the very small</small></span></a>
  <nav>
    <button class="nav" id="explore">${icon("map", 18)}<span>City map</span></button>
    <button class="nav" id="journal">${icon("book", 18)}<span>Journal</span> <b id="journal-count">0</b></button>
    <button class="playback-toggle" id="pause" hidden aria-label="Pause field trip">${icon("pause", 16)} <span>Pause</span></button>
    <button class="icon-button" id="sound" aria-label="Turn narration on" title="Spoken narration">${icon("sound", 18)}</button>
    <button class="icon-button" id="fullscreen" aria-label="Enter fullscreen" title="Fullscreen">${icon("expand", 18)}</button>
  </nav>
</header>
<main>
  <aside class="sidebar notebook" hidden>
    <span class="tag">Trip log</span>
    <h1>The discovery trail</h1>
    <p class="intro">Pick a stop you have already found to walk back with your class.</p>
    <div class="progress-label"><span>Discoveries</span><b id="progress-text"></b></div>
    <div class="progress"><i id="progress-bar"></i></div>
    <div id="journey" class="journey"></div>
    <button class="text-button" id="close-map">Back to walking</button>
  </aside>
  <section class="adventure" aria-label="Walk through Cell City">
    <div id="world"></div><div id="labels"></div>
    <div class="objective"><div class="objective-icon">${icon("compass", 20)}</div><div><span id="objective-kicker">The mysterious field trip</span><strong id="destination">Meet your class at the city gate</strong><small id="travel-status">Dr. Maya and four curious explorers</small></div></div>
    <div class="score">${icon("star", 17)} <b id="stars">0</b><span>points</span><i></i><b id="hud-count">0 / 9</b><span>found</span></div>
    <div class="opening">
      <span class="tag">Specimen 01 · a biology adventure</span>
      <h1>Big secrets.<br><em>Tiny world.</em></h1>
      <p>Join Dr. Maya and four curious students. Walk the streets, meet the organelles and find out what keeps this city alive.</p>
      <div class="cast-line">${["teacher", "aria", "ben", "zoya", "leo"].map((k) => `<i style="--cast:${cast[k].color}" title="${cast[k].name}"></i>`).join("")}<span>One class. Nine stops.</span></div>
    </div>
    <div class="chapter-banner" id="chapter-banner"></div>
    <button class="back-to-class" id="back-to-class">${icon("compass", 18)} Back to the class</button>
    <div class="explore-hint" aria-hidden="true">Drag to move · scroll to zoom · right-drag or Ctrl-drag to turn and tilt</div>
    <div class="world-tools"><button id="zoom-in" aria-label="Move camera closer">+</button><button id="zoom-out" aria-label="Move camera farther">−</button><button id="face-north" class="explore-only" aria-label="Turn to face north" title="Face north"><span class="needle">N</span></button><button id="tilt" class="explore-only" aria-label="Switch to flat 2D view" title="2D / 3D view">2D</button><button id="reset-view" aria-label="Return to follow camera">${icon("compass", 18)}</button></div>
    <div id="challenge" class="challenge" hidden></div>
    <div class="dialogue">
      <div class="speaker-portrait" id="portrait">M</div>
      <div class="dialogue-copy" id="dialogue-copy">
        <div class="speaker" id="speaker">Dr. Maya <span>Your science guide</span></div>
        <p id="dialogue-text">“Today, we’re going somewhere you’ve never been before. Come along — the class is waiting!”</p>
        <div class="story-dots" id="story-dots"></div>
      </div>
      <div class="story-controls">
        <button class="ghost" id="story-replay" aria-label="Replay this line">${icon("replay", 16)}<span>Replay</span></button>
        <button class="ink" id="story-next" aria-label="Next line">Next <span aria-hidden="true">›</span></button>
      </div>
      <button id="next" class="primary">${state.done ? "Continue field trip" : "Begin field trip"} ${icon("arrow", 18)}</button>
      <button id="restart" class="text-button" ${state.done ? "" : "hidden"}>Start from the beginning</button>
    </div>
    <div class="minimap"><div class="minimap-title">Cell City map <span>N ↑</span></div>
      <svg viewBox="0 0 160 148" aria-label="Your position in Cell City"><ellipse cx="80" cy="69" rx="70" ry="58" fill="#F3E9D8" stroke="#1E2440" stroke-width="2"/><ellipse cx="80" cy="69" rx="64" ry="52" fill="none" stroke="#1E2440" stroke-opacity=".25" stroke-dasharray="3 4"/><path d="M80 138 80 120 42 106 32 91 26 58 63 40 98 36 129 50 124 95 99 106 80 87 80 69" fill="none" stroke="#E59B2E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${stops.map((x, i) => `<circle class="map-stop" data-map-stop="${i}" cx="${80 + x.x * 5.5}" cy="${i === 0 ? 128 : 69 + x.z * 5}" r="4.5" fill="#fff" stroke="#1E2440" stroke-width="1.5"/>`).join("")}<circle id="player-dot" cx="80" cy="139" r="5" fill="#D9466F" stroke="#1E2440" stroke-width="2"/></svg>
      <div class="minimap-caption"><i></i> You and your class</div>
    </div>
  </section>
</main>
<div class="pause-screen" id="pause-screen" hidden><div>${icon("pause", 28)}<h2>Field trip paused</h2><p>Press <b>Resume</b> in the top bar when you’re ready.</p></div></div>
<div id="modal" class="modal" hidden></div><div id="toast" role="status" aria-live="polite"></div>`;

const city = createCity($("#world"), $("#labels"), stops, {
  arrive: arriveAtStop,
  select: visit,
  status: updateStatus,
  mode: onMode,
  blocked: () => notify("Route blocked. Choose the current stop from the city map to try again."),
});
city.setPaused(true);

function onMode(mode) {
  document.body.classList.toggle("guided", mode === "guided");
  document.body.classList.toggle("exploring", mode === "explore" || mode === "map");
  mapOpen = mode === "map";
  $(".sidebar").hidden = !mapOpen;
}
function updateStatus(status) {
  $("#player-dot").setAttribute("cx", 80 + status.x * 2.2);
  $("#player-dot").setAttribute("cy", 69 + status.z * 2.05);
  if (status.heading !== undefined) $("#face-north .needle").style.transform = `rotate(${(-status.heading * 180) / Math.PI}deg)`;
  if (challenge === "travel") $("#travel-status").textContent = `Walking with Dr. Maya · ${Math.round(status.distance)} m to go`;
}

// Auto-advance timer that survives pause/resume and modals.
function clearAuto() {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = null;
  autoCallback = null;
  autoRemaining = 0;
}
function pauseAuto() {
  if (!autoTimer) return;
  clearTimeout(autoTimer);
  autoTimer = null;
  autoRemaining = Math.max(0, autoDeadline - performance.now());
}
function resumeAuto() {
  if (!autoCallback || autoTimer) return;
  autoDeadline = performance.now() + autoRemaining;
  autoTimer = setTimeout(() => {
    const callback = autoCallback;
    clearAuto();
    callback();
  }, autoRemaining);
}
function scheduleAuto(callback, delay) {
  clearAuto();
  autoCallback = callback;
  autoRemaining = delay;
  if (!isHeld()) resumeAuto();
}
const isHeld = () => userPaused || !$("#modal").hidden;
function syncPlayback() {
  const paused = !started || isHeld();
  city.setPaused(paused);
  $(".adventure").inert = userPaused;
  $("#pause-screen").hidden = !userPaused;
  if (paused) {
    pauseAuto();
    voice.pause();
    ambience.pause();
    if (sound && speechAvailable) speechSynthesis.pause();
  } else {
    resumeAuto();
    if (sound) {
      voice.resume();
      ambience.play();
    }
    if (sound && speechAvailable) speechSynthesis.resume();
  }
}
function updatePauseButton() {
  const button = $("#pause");
  button.innerHTML = `${icon(userPaused ? "play" : "pause", 16)} <span>${userPaused ? "Resume" : "Pause"}</span>`;
  button.setAttribute("aria-label", userPaused ? "Resume field trip" : "Pause field trip");
  button.classList.toggle("resume", userPaused);
}

// Speech. Recorded natural voices first; the best installed browser voice for anything unrecorded.
// Each line gets a token so stale end events from cancelled lines are ignored.
function bestBrowserVoice() {
  if (fallbackVoice) return fallbackVoice;
  const score = (v) =>
    (/natural|neural|premium|enhanced|online/i.test(v.name) ? 4 : 0) +
    (/samantha|ava|serena|jenny|libby|sonia|google uk english female|karen|moira/i.test(v.name) ? 2 : 0) +
    (v.localService ? 0 : 1);
  const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  return (fallbackVoice = voices.sort((x, y) => score(y) - score(x))[0]);
}
function stopSpeech() {
  speechToken++;
  voice.stop();
  if (speechAvailable) speechSynthesis.cancel();
}
function speak(text, onDone, speaker = currentSpeaker) {
  stopSpeech();
  const token = speechToken;
  if (!sound) return false;
  const done = () => token === speechToken && onDone?.();
  if (voice.play(speaker, text, done, isHeld())) return true;
  if (!speechAvailable) return false;
  const u = new SpeechSynthesisUtterance(text),
    browserVoice = bestBrowserVoice();
  if (browserVoice) u.voice = browserVoice;
  u.rate = 0.95;
  u.onend = done;
  speechSynthesis.speak(u);
  if (isHeld()) speechSynthesis.pause();
  return true;
}
function setSpeaker(key) {
  currentSpeaker = key;
  const person = cast[key] || cast.teacher;
  $("#portrait").style.setProperty("--speaker", key === "organelle" ? stops[active].color : person.color);
  $("#portrait").textContent = key === "organelle" ? "✦" : person.name.split(" ").at(-1)[0];
  $("#speaker").innerHTML =
    `${key === "organelle" ? stops[active].name : person.name}<span>${key === "organelle" ? "Meet the locals" : person.role.toLowerCase()}</span>`;
  city.setSpeaker(key);
}
function say(text, key = "teacher") {
  setSpeaker(key);
  $("#dialogue-text").textContent = `“${text}”`;
  speak(text);
}

// Story playback: lines advance when narration finishes, or after a reading delay when narration is off.
function playStory(lines, complete) {
  clearAuto();
  challenge = "story";
  storyLines = lines;
  storyIndex = 0;
  storyComplete = complete;
  city.setStory(true);
  syncPlayback();
  $("#challenge").hidden = true;
  $("#next").hidden = true;
  document.body.classList.add("in-story");
  showStoryLine();
}
function showStoryLine() {
  const [key, text] = storyLines[storyIndex];
  setSpeaker(key);
  $("#dialogue-text").textContent = `“${text}”`;
  $("#story-dots").innerHTML = storyLines.map((_, i) => `<i class="${i <= storyIndex ? "read" : ""}"></i>`).join("");
  const index = storyIndex;
  voice.preload(storyLines.slice(index + 1, index + 3));
  const spoken = speak(text, () => {
    if (challenge === "story" && storyIndex === index) scheduleAuto(advanceStory, 650);
  });
  scheduleAuto(advanceStory, spoken ? speechFallbackDelay(text) : readingDelay(text));
}
function advanceStory() {
  if (challenge !== "story" || userPaused) return;
  clearAuto();
  if (storyIndex < storyLines.length - 1) {
    storyIndex++;
    showStoryLine();
  } else {
    speechToken++;
    $("#story-dots").innerHTML = "";
    document.body.classList.remove("in-story");
    storyComplete?.();
  }
}
function replayLine() {
  if (challenge !== "story" || userPaused) return;
  showStoryLine();
}

function arriveAtStop(i) {
  if (!started || !["travel", "explore"].includes(challenge) || i > state.done) return;
  active = i;
  selected = [];
  step = 0;
  mistakes = 0;
  stepMisses = 0;
  feedback = "";
  renderJourney();
  $("#destination").textContent = stops[i].place;
  $("#objective-kicker").textContent = `Slide ${pad(i + 1)} of 09`;
  $("#travel-status").textContent = "Stop, look, listen — then help the city.";
  $("#chapter-banner").innerHTML = `<span>Slide ${pad(i + 1)}</span>${stops[i].place}`;
  $("#chapter-banner").classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => $("#chapter-banner").classList.remove("show"), 3500);
  playStory(conversations[i], () => {
    challenge = "mission";
    $("#next").hidden = true;
    renderChallenge();
  });
}
function save() {
  try {
    localStorage.setItem("cell-city-v1", JSON.stringify(state));
  } catch {}
  renderJourney();
}
function renderJourney() {
  $("#journey").innerHTML = stops
    .map(
      (s, i) =>
        `<button class="stop ${i === active ? "current" : ""} ${i < state.done ? "complete" : ""}" data-stop="${i}" ${i > state.done ? "disabled" : ""}><span class="stop-icon" style="--stop-color:${s.color}">${icon(i < state.done ? "check" : s.icon, 17)}</span><span><strong>${s.name}</strong><small>${s.place}</small></span><span class="stop-number">${pad(i + 1)}</span></button>`,
    )
    .join("");
  document.querySelectorAll("[data-stop]").forEach((b) => (b.onclick = () => visit(Number(b.dataset.stop))));
  $("#progress-text").textContent = `${state.done} / 9`;
  $("#progress-bar").style.width = `${(state.done / 9) * 100}%`;
  $("#stars").textContent = state.stars;
  $("#journal-count").textContent = state.done;
  $("#hud-count").textContent = `${state.done} / 9`;
  document
    .querySelectorAll("[data-map-stop]")
    .forEach((el, i) => el.setAttribute("fill", i < state.done ? stops[i].color : i === active ? "#E59B2E" : "#fff"));
  city.setProgress(state.done, active);
}
function notify(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2800);
}
function visit(i) {
  if (["emergency", "final", "reveal"].includes(challenge)) return notify("Finish saving the city first.");
  if (i > state.done) return notify("Discover the earlier stops before this one.");
  clearAuto();
  active = i;
  started = true;
  challenge = "travel";
  document.body.classList.add("playing");
  document.body.classList.remove("in-story", "has-challenge");
  $(".opening").hidden = true;
  $("#challenge").hidden = true;
  $("#next").hidden = true;
  $("#story-dots").innerHTML = "";
  $("#destination").textContent = stops[i].place;
  $("#objective-kicker").textContent = `Walking to slide ${pad(i + 1)}`;
  say(travelLines[i]);
  renderJourney();
  city.setStory(false);
  syncPlayback();
  city.travel(i);
}

// Challenges. A wrong answer shows a specific hint; after two misses on one step the right option is highlighted.
function feedbackHtml() {
  return `<div class="feedback ${feedback ? "error" : ""}" role="status" aria-live="polite">${feedback}</div>`;
}
const hintClass = (isAnswer) => (stepMisses >= 2 && isAnswer ? "answer-hint" : "");
function cardTop(kicker, title) {
  return `<span class="tag">${kicker}</span><h3>${title}</h3>`;
}
function nextStep(done) {
  step++;
  stepMisses = 0;
  feedback = "";
  done();
}
function renderChallenge() {
  const s = stops[active],
    box = $("#challenge");
  document.body.classList.add("has-challenge");
  box.hidden = false;
  box.innerHTML = cardTop(`Slide ${pad(active + 1)} / 09`, s.heading) + `<p>${s.prompt}</p><div class="task-area"></div>` + feedbackHtml();
  const area = box.querySelector(".task-area");
  const advance = () => nextStep(() => (step === s.items.length ? win() : renderChallenge()));
  const wrong = (label) => miss(s.hint, label, renderChallenge);
  if (s.type === "gate") {
    const allow = s.answers[step] === 1;
    area.innerHTML = `<div class="item-display"><span>${icon("molecule", 34)}</span><b>${s.items[step]}</b><small>Visitor ${step + 1} of ${s.items.length}</small></div><div class="two-actions"><button class="choice ${hintClass(!allow)}" data-gate="0">Keep out</button><button class="choice positive ${hintClass(allow)}" data-gate="1">Let in ${icon("arrow", 16)}</button></div>`;
    area
      .querySelectorAll("[data-gate]")
      .forEach(
        (b) => (b.onclick = () => (Number(b.dataset.gate) === s.answers[step] ? correct(advance) : wrong(allow ? "Let in" : "Keep out"))),
      );
  }
  if (s.type === "select") {
    area.innerHTML = `<div class="choices">${s.items.map((it, i) => `<button class="choice ${selected.includes(i) ? "selected" : ""} ${hintClass(s.answers.includes(i))}" data-choice="${i}" aria-pressed="${selected.includes(i)}"><span class="choice-dot">${selected.includes(i) ? "✓" : "+"}</span>${it}</button>`).join("")}</div><button id="check" class="primary wide">Check answer ${icon("check", 18)}</button>`;
    area.querySelectorAll("[data-choice]").forEach(
      (b) =>
        (b.onclick = () => {
          const i = +b.dataset.choice;
          selected = selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i];
          renderChallenge();
        }),
    );
    $("#check").onclick = () =>
      selected.length === s.answers.length && selected.every((i) => s.answers.includes(i))
        ? correct(() => nextStep(win))
        : wrong(s.answers.map((i) => s.items[i]).join(", "));
  }
  if (s.type === "sort") {
    area.innerHTML = `<div class="item-display"><span>${icon("box", 34)}</span><b>${s.items[step]}</b><small>Package ${step + 1} of ${s.items.length}</small></div><div class="choices">${s.choices.map((it, i) => `<button class="choice ${hintClass(i === s.answers[step])}" data-choice="${i}">${icon("box", 18)}${it}</button>`).join("")}</div>`;
    area
      .querySelectorAll("[data-choice]")
      .forEach((b) => (b.onclick = () => (+b.dataset.choice === s.answers[step] ? correct(advance) : wrong(s.choices[s.answers[step]]))));
  }
  if (s.type === "sequence") {
    area.innerHTML = `<div class="sequence-track">${s.answers.map((_, i) => `<span class="${i < step ? "filled" : ""}">${i < step ? "✓" : i + 1}</span>${i < s.answers.length - 1 ? "<i>→</i>" : ""}`).join("")}</div><div class="choices">${s.items.map((it, i) => `<button class="choice ${hintClass(i === s.answers[step])}" data-choice="${i}" ${s.answers.slice(0, step).includes(i) ? "disabled" : ""}>${it}${icon("arrow", 16)}</button>`).join("")}</div>`;
    area
      .querySelectorAll("[data-choice]")
      .forEach((b) => (b.onclick = () => (+b.dataset.choice === s.answers[step] ? correct(advance) : wrong(s.items[s.answers[step]]))));
  }
}
function correct(fn) {
  tone();
  if (challenge === "mission") city.demonstrate(active, step);
  fn();
}
function miss(hint, answerLabel, rerender) {
  mistakes++;
  stepMisses++;
  feedback = stepMisses >= 2 ? `<b>The highlighted answer is right: ${answerLabel}.</b> ${hint}` : `<b>Not quite.</b> ${hint}`;
  tone(false);
  rerender();
}
function tone(good = true) {
  if (sound) ambience.chime(good);
}
function win() {
  const fresh = active === state.done;
  if (fresh) {
    state.done++;
    state.stars += Math.max(10, 30 - mistakes * 5);
    state.mistakes[active] = mistakes;
    save();
  }
  challenge = "won";
  city.celebrate();
  city.repair(active);
  $("#challenge").innerHTML =
    `<div class="success-icon">${icon("check", 28)}</div><span class="tag">Discovery complete</span><h3>${stops[active].name}, discovered.</h3><p>${stops[active].fact}</p><div class="fact-chip">${icon("book", 17)} Added to your field journal</div><button id="continue" class="primary wide">${active === 8 ? "Continue to the city emergency" : "Next destination"} ${icon("arrow", 18)}</button>`;
  say(active === 8 ? teacherLines.alarm : teacherLines.discovery);
  const continueTrip = () => (active === 8 ? startEmergency() : visit(active + 1));
  $("#continue").onclick = () => {
    clearAuto();
    continueTrip();
  };
  scheduleAuto(continueTrip, 8000);
}
function startEmergency() {
  clearAuto();
  challenge = "emergency";
  step = 0;
  stepMisses = 0;
  feedback = "";
  state.rescueMistakes = 0;
  rounds = buildRounds(
    emergencies.map((e) => e.answer),
    stops.length,
  );
  city.setStory(true);
  city.setEmergency(true);
  syncPlayback();
  $("#next").hidden = true;
  $("#challenge").hidden = false;
  document.body.classList.add("playing", "has-challenge");
  say(teacherLines.emergency);
  renderEmergency();
}
function renderEmergency() {
  const { answer, options } = rounds[step],
    e = emergencies.find((x) => x.answer === answer);
  $("#challenge").innerHTML =
    `<div class="alarm">${icon("bolt", 18)} Cell City needs you</div><h3>${e.problem}</h3><p>Which organelle can fix this?</p><div class="rescue-progress">${rounds.map((_, i) => `<i class="${i < step ? "done" : ""}"></i>`).join("")}</div><div class="choices">${options.map((i) => `<button class="choice ${hintClass(i === answer)}" data-rescue="${i}">${icon(stops[i].icon, 18)}${stops[i].name}</button>`).join("")}</div>` +
    feedbackHtml();
  document.querySelectorAll("[data-rescue]").forEach(
    (b) =>
      (b.onclick = () => {
        if (+b.dataset.rescue !== answer) {
          state.rescueMistakes++;
          return miss(e.hint, stops[answer].name, renderEmergency);
        }
        correct(() =>
          nextStep(() => {
            city.repair(answer);
            city.celebrate();
            if (step === rounds.length) {
              if (!state.rescued) state.stars += 60;
              state.rescued = true;
              save();
              reveal();
            } else renderEmergency();
          }),
        );
      }),
  );
}
function reveal() {
  playStory(finale, showRevealCard);
  city.reveal();
}
function showRevealCard() {
  challenge = "reveal";
  $("#next").hidden = true;
  $("#challenge").hidden = false;
  document.body.classList.add("has-challenge");
  $("#objective-kicker").textContent = "The final reveal";
  $("#destination").textContent = "You were inside a cell all along";
  $("#travel-status").textContent = "Every part works together to maintain life.";
  say(teacherLines.reveal);
  $("#challenge").innerHTML =
    `<div class="success-icon">${icon("dna", 28)}</div><span class="tag">The secret is out</span><h3>A whole world inside a single cell.</h3><p>You saved Cell City! These buildings stand for organelles working together in a living cell.</p><p class="science-note">Our city mixes plant and animal examples. Real plant cells have a cell wall and chloroplasts; their lytic vacuoles do much of the recycling shown here as lysosomes.</p><button class="primary wide" id="final-start">Final challenge ${icon("arrow", 18)}</button>`;
  const startFinal = () => {
    challenge = "final";
    step = 0;
    stepMisses = 0;
    feedback = "";
    state.finalMistakes = 0;
    rounds = buildRounds(
      stops.map((_, i) => i),
      stops.length,
    );
    renderFinal();
  };
  $("#final-start").onclick = () => {
    clearAuto();
    startFinal();
  };
  scheduleAuto(startFinal, 12000);
}
const jobs = [
  "Controls what enters and leaves",
  "Carries out photosynthesis",
  "Modifies, sorts and packages",
  "A network that makes and moves materials",
  "Builds proteins",
  "Releases energy as ATP",
  "Stores substances and keeps plant cells firm",
  "Breaks down unwanted cell materials",
  "Holds the genetic instructions",
];
function renderFinal() {
  const { answer, options } = rounds[step];
  $("#challenge").innerHTML =
    `<span class="tag">Final match · ${step + 1} / ${rounds.length}</span><h3>Who does this job?</h3><div class="job-card">${jobs[answer]}</div><div class="choices">${options.map((i) => `<button class="choice ${hintClass(i === answer)}" data-match="${i}">${icon(stops[i].icon, 18)}${stops[i].name}</button>`).join("")}</div>` +
    feedbackHtml();
  document.querySelectorAll("[data-match]").forEach(
    (b) =>
      (b.onclick = () => {
        if (+b.dataset.match !== answer) {
          state.finalMistakes++;
          return miss(`Think back to ${stops[answer].place.toLowerCase()}.`, stops[answer].name, renderFinal);
        }
        correct(() =>
          nextStep(() => {
            if (step === rounds.length) {
              if (!state.finished) state.stars += 90;
              state.finished = true;
              state.finishedAt ||= Date.now();
              save();
              finish();
            } else renderFinal();
          }),
        );
      }),
  );
}
function tripReport() {
  const time = formatDuration(state.finishedAt - state.startedAt);
  return `<details class="trip-report"><summary>Trip report for teachers</summary><ul>${stops.map((s, i) => `<li><span style="--dot:${s.color}"></span>${s.name}<b class="${state.mistakes[i] ? "missed" : ""}">${state.mistakes[i] ? `${state.mistakes[i]} miss${state.mistakes[i] > 1 ? "es" : ""}` : "✓"}</b></li>`).join("")}<li><span style="--dot:var(--danger)"></span>City emergency<b class="${state.rescueMistakes ? "missed" : ""}">${state.rescueMistakes || "✓"}</b></li><li><span style="--dot:var(--hema)"></span>Final match<b class="${state.finalMistakes ? "missed" : ""}">${state.finalMistakes || "✓"}</b></li></ul><p>Total time: <b>${time}</b></p></details>`;
}
function finish() {
  clearAuto();
  challenge = "finished";
  document.body.classList.add("has-challenge");
  city.reveal();
  city.celebrate();
  $("#pause").hidden = true;
  $("#challenge").innerHTML =
    `<div class="success-icon trophy">${icon("star", 30)}</div><span class="tag">Mission complete</span><h3>Official Cell City explorer.</h3><p>Nine discoveries. One city saved. You know how organelles work together to keep a cell alive.</p><div class="final-stats"><b>${state.stars}<small>points</small></b><b>9 / 9<small>discoveries</small></b></div>${tripReport()}<button class="primary wide" id="review-journal">View your field journal ${icon("book", 18)}</button><button class="text-button" id="replay">Watch the field trip again</button><button class="text-button" id="fresh">Start a new expedition</button>`;
  $("#review-journal").onclick = openJournal;
  $("#fresh").onclick = resetPrompt;
  $("#replay").onclick = () => {
    city.reset();
    renderJourney();
    challenge = "travel";
    userPaused = false;
    updatePauseButton();
    $("#pause").hidden = false;
    visit(0);
  };
  say(teacherLines.farewell);
}
function openModal(html) {
  modalReturn = document.activeElement;
  $("#modal").innerHTML =
    `<section class="modal-card notebook" role="dialog" aria-modal="true" aria-labelledby="modal-title">${html}</section>`;
  $("#modal").hidden = false;
  syncPlayback();
  $("#modal").querySelector("button")?.focus();
}
function closeModal() {
  $("#modal").hidden = true;
  syncPlayback();
  modalReturn?.focus();
}
function openJournal() {
  openModal(
    `<div class="journal-header"><div><span class="tag">Expedition notes</span><h2 id="modal-title">Field journal <em>${state.done} / 9</em></h2></div><button id="close-modal" class="icon-button" aria-label="Close journal">${icon("close")}</button></div><p>Meet the tiny teams that keep cells alive.</p><div class="journal-grid">${stops.map((s, i) => `<article class="journal-entry ${i >= state.done ? "undiscovered" : ""}" style="--stop-color:${s.color}"><span class="journal-symbol">${icon(i < state.done ? s.icon : "compass", 24)}</span><div><small>Slide ${pad(i + 1)} · ${s.place}</small><h3>${s.name}</h3><p>${i < state.done ? s.fact : "Visit this stop to unlock your notes."}</p></div></article>`).join("")}</div><div class="journal-bottom"><p>City buildings are analogies, not literal cell anatomy.</p><button class="text-button" id="reset-progress">Reset progress</button></div>`,
  );
  $("#close-modal").onclick = closeModal;
  $("#reset-progress").onclick = resetPrompt;
}
function resetPrompt() {
  openModal(
    `<h2 id="modal-title">Start a new expedition?</h2><p>This clears your discoveries and points on this device.</p><div class="two-actions"><button class="choice" id="cancel-reset">Keep exploring</button><button class="primary" id="confirm-reset">Start fresh</button></div>`,
  );
  $("#cancel-reset").onclick = closeModal;
  $("#confirm-reset").onclick = () => {
    clearAuto();
    state = loadState(null);
    active = 0;
    city.reset();
    save();
    userPaused = false;
    updatePauseButton();
    started = false;
    closeModal();
    beginFieldTrip();
  };
}
function beginFieldTrip() {
  started = true;
  $("#restart").hidden = true;
  if (!state.startedAt) {
    state.startedAt = Date.now();
    save();
  }
  $(".opening").hidden = true;
  document.body.classList.add("playing");
  $("#pause").hidden = false;
  syncPlayback();
  if (state.finished) {
    $("#challenge").hidden = false;
    $("#next").hidden = true;
    finish();
  } else if (state.done === 9) startEmergency();
  else if (state.done > 0) visit(active);
  else playStory(prologue, () => visit(0));
}

$("#next").onclick = () => {
  if (!started) beginFieldTrip();
};
$("#story-next").onclick = advanceStory;
$("#story-replay").onclick = replayLine;
$("#dialogue-copy").onclick = () => {
  if (challenge === "story") advanceStory();
};
$("#pause").onclick = () => {
  userPaused = !userPaused;
  updatePauseButton();
  syncPlayback();
};
$("#journal").onclick = openJournal;
$("#explore").onclick = () => {
  if (!started) return notify("Begin the field trip to open your city map.");
  city.overview();
};
const followClass = () => {
  city.follow();
  onMode("follow");
};
$("#close-map").onclick = followClass;
$(".brand").onclick = (e) => {
  e.preventDefault();
  followClass();
};
$("#sound").onclick = () => {
  sound = !sound;
  $("#sound").classList.toggle("enabled", sound);
  $("#sound").setAttribute("aria-label", sound ? "Turn narration off" : "Turn narration on");
  if (!sound) {
    stopSpeech();
    ambience.stop();
  } else if (started && !isHeld()) ambience.play();
  if (sound && challenge === "story") showStoryLine();
  else if (sound) speak($("#dialogue-text").textContent.replace(/[“”]/g, ""));
};
$("#fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notify("Fullscreen is unavailable here. Open the game in a browser tab.");
  }
};
$("#zoom-in").onclick = () => city.zoom(0.86);
$("#zoom-out").onclick = () => city.zoom(1.16);
$("#reset-view").onclick = followClass;
$("#back-to-class").onclick = followClass;
$("#restart").onclick = resetPrompt;
// Returning players see where they stopped, so a resumed trip is never a surprise.
if (state.done && !state.finished)
  $("#dialogue-text").textContent =
    `“Welcome back! Last time we reached ${stops[Math.min(state.done, 8)].place.toLowerCase()}. Continue from there, or start from the beginning.”`;
else if (state.finished)
  $("#dialogue-text").textContent = "“Welcome back, explorers! You finished the trip last time. Review it, or start from the beginning.”";
$("#face-north").onclick = () => city.faceNorth();
$("#tilt").onclick = () => {
  const view = city.toggleTilt();
  $("#tilt").textContent = view === "2d" ? "3D" : "2D";
  $("#tilt").setAttribute("aria-label", view === "2d" ? "Switch to tilted 3D view" : "Switch to flat 2D view");
};
$("#modal").onclick = (e) => {
  if (e.target === $("#modal")) closeModal();
};
document.addEventListener("keydown", (e) => {
  const modalOpen = !$("#modal").hidden;
  if (e.key === "Escape") {
    if (modalOpen) closeModal();
    else if (mapOpen) followClass();
  }
  if ([" ", "Enter", "ArrowRight"].includes(e.key) && challenge === "story" && !modalOpen && !userPaused) {
    const tag = document.activeElement?.tagName;
    if (!["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A", "SUMMARY"].includes(tag)) {
      e.preventDefault();
      advanceStory();
    }
  }
  if (e.key === "Tab" && modalOpen) {
    const list = [...$("#modal").querySelectorAll("button,a,input,summary,[tabindex='0']")];
    if (e.shiftKey && document.activeElement === list[0]) {
      e.preventDefault();
      list.at(-1)?.focus();
    } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
      e.preventDefault();
      list[0]?.focus();
    }
  }
});
renderJourney();
