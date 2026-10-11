// Gentle generated soundscape: a breeze that rises and falls, the odd songbird far away,
// and soft mallet chimes for right and wrong answers. Everything is synthesised, so no audio files are needed.
export function createAmbience() {
  let ctx = null,
    master = null,
    running = false,
    birdTimer = null;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setup() {
    if (ctx) return true;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // Breeze: brown noise through a slowly wandering low-pass filter.
    const length = ctx.sampleRate * 4,
      buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.2;
      }
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.4;
    const wind = ctx.createGain();
    wind.gain.value = 0.16;
    // Two slow LFOs make gusts: one on brightness, one on loudness.
    for (const [rate, depth, target] of [
      [0.07, 260, filter.frequency],
      [0.11, 0.07, wind.gain],
    ]) {
      const lfo = ctx.createOscillator(),
        amount = ctx.createGain();
      lfo.frequency.value = rate;
      amount.gain.value = depth;
      lfo.connect(amount).connect(target);
      lfo.start();
    }
    noise.connect(filter).connect(wind).connect(master);
    noise.start();
    return true;
  }

  // A short songbird phrase: quick pitch sweeps with soft attacks, placed left or right.
  function bird() {
    if (!running) return;
    const now = ctx.currentTime + 0.05,
      pan = ctx.createStereoPanner(),
      voice = ctx.createGain(),
      base = 2600 + Math.random() * 1800,
      notes = 2 + Math.floor(Math.random() * 4);
    pan.pan.value = Math.random() * 1.6 - 0.8;
    voice.gain.value = 0.05 + Math.random() * 0.03;
    voice.connect(pan).connect(master);
    for (let n = 0; n < notes; n++) {
      const start = now + n * (0.11 + Math.random() * 0.07),
        o = ctx.createOscillator(),
        g = ctx.createGain(),
        f = base * (0.9 + Math.random() * 0.25);
      o.type = "sine";
      o.frequency.setValueAtTime(f, start);
      o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.35 : 0.72), start + 0.08);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(1, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
      o.connect(g).connect(voice);
      o.start(start);
      o.stop(start + 0.1);
    }
    birdTimer = setTimeout(bird, 3500 + Math.random() * 7000);
  }

  return {
    play() {
      if (running || !setup()) return;
      running = true;
      ctx.resume?.();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.55, ctx.currentTime, 1.2);
      if (!reduced) birdTimer = setTimeout(bird, 1500);
    },
    pause() {
      if (!running) return;
      running = false;
      clearTimeout(birdTimer);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    },
    stop() {
      this.pause();
    },
    // Soft mallet: a rising pair for right answers, one low muted note for "not quite".
    chime(good = true) {
      if (!setup()) return;
      ctx.resume?.();
      const now = ctx.currentTime,
        notes = good ? [784, 1175] : [294];
      notes.forEach((freq, i) => {
        const start = now + i * 0.09;
        for (const [ratio, level] of [
          [1, 0.12],
          [3.99, 0.025],
        ]) {
          const o = ctx.createOscillator(),
            g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = freq * ratio;
          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(good ? level : level * 0.8, start + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, start + (good ? 0.9 : 0.35) / ratio ** 0.3);
          o.connect(g).connect(ctx.destination);
          o.start(start);
          o.stop(start + 1);
        }
      });
    },
  };
}
