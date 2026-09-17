/*
 * Sons do Pomodoro gerados no navegador (Web Audio): nada para baixar, funciona offline.
 * Ambientes: chuva, mar, lareira, ruído marrom e ruído branco. Mais o sino de fim de etapa.
 */

export const AMBIENTS: { id: string; label: string; hint: string }[] = [
  { id: "none", label: "Silêncio", hint: "Sem som" },
  { id: "rain", label: "Chuva", hint: "Chuva constante" },
  { id: "ocean", label: "Mar", hint: "Ondas lentas" },
  { id: "fire", label: "Lareira", hint: "Fogo estalando" },
  { id: "brown", label: "Ruído marrom", hint: "Grave e suave" },
  { id: "white", label: "Ruído branco", hint: "Abafa conversas" },
  { id: "lofi", label: "Lo-fi", hint: "Rádio no YouTube" },
  { id: "custom", label: "Minha playlist", hint: "YouTube ou Spotify" },
];

/** Sons que tocam por um player incorporado, não pelo Web Audio. */
export const isEmbedSound = (id: string) => id === "lofi" || id === "custom";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let nodes: AudioNode[] = [];
let timers: number[] = [];
let current = "none";

function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  return ctx;
}

function noiseBuffer(ac: AudioContext, kind: "white" | "pink" | "brown", seconds = 4) {
  const len = ac.sampleRate * seconds;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "white") data[i] = w * 0.5;
    else if (kind === "brown") {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

function loop(ac: AudioContext, buf: AudioBuffer) {
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  nodes.push(src);
  return src;
}

function lfo(ac: AudioContext, target: AudioParam, freq: number, depth: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = freq;
  gain.gain.value = depth;
  osc.connect(gain).connect(target);
  osc.start();
  nodes.push(osc, gain);
}

function build(ac: AudioContext, id: string, out: AudioNode) {
  if (id === "white" || id === "brown") {
    const src = loop(ac, noiseBuffer(ac, id));
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = id === "white" ? 9000 : 1200;
    src.connect(lp).connect(out);
    nodes.push(lp);
  } else if (id === "rain") {
    const src = loop(ac, noiseBuffer(ac, "pink"));
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 500;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6500;
    const g = ac.createGain();
    g.gain.value = 0.9;
    lfo(ac, g.gain, 0.13, 0.12);
    src.connect(hp).connect(lp).connect(g).connect(out);
    nodes.push(hp, lp, g);
    // gotas mais fortes de vez em quando
    const drop = () => {
      const t = ac.currentTime;
      const o = ac.createBufferSource();
      o.buffer = noiseBuffer(ac, "white", 0.03);
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2500 + Math.random() * 3000;
      const dg = ac.createGain();
      dg.gain.setValueAtTime(0.25 * Math.random(), t);
      dg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(bp).connect(dg).connect(out);
      o.start(t);
      timers.push(window.setTimeout(drop, 40 + Math.random() * 220));
    };
    drop();
  } else if (id === "ocean") {
    const src = loop(ac, noiseBuffer(ac, "brown", 6));
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    lfo(ac, lp.frequency, 0.08, 500);
    const g = ac.createGain();
    g.gain.value = 0.6;
    lfo(ac, g.gain, 0.08, 0.45);
    src.connect(lp).connect(g).connect(out);
    nodes.push(lp, g);
  } else if (id === "fire") {
    const src = loop(ac, noiseBuffer(ac, "brown"));
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const g = ac.createGain();
    g.gain.value = 0.7;
    lfo(ac, g.gain, 0.4, 0.15);
    src.connect(lp).connect(g).connect(out);
    nodes.push(lp, g);
    const crackle = () => {
      const t = ac.currentTime;
      const o = ac.createBufferSource();
      o.buffer = noiseBuffer(ac, "white", 0.02);
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1500 + Math.random() * 2000;
      const cg = ac.createGain();
      cg.gain.setValueAtTime(0.5 * Math.random(), t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03 + Math.random() * 0.05);
      o.connect(hp).connect(cg).connect(out);
      o.start(t);
      timers.push(window.setTimeout(crackle, 60 + Math.random() * (Math.random() < 0.2 ? 900 : 250)));
    };
    crackle();
  }
}

/* ---------- player incorporado (YouTube): volume e pausa pela API do iframe ---------- */

let embedFrame: HTMLIFrameElement | null = null;
let embedVolume = 0.6;
let embedPaused = false;

function ytCommand(func: string, args: unknown[] = []) {
  const f = embedFrame;
  if (!f?.contentWindow || !/youtube/.test(f.src)) return;
  f.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*");
}

function syncEmbed() {
  ytCommand(embedVolume > 0 ? "unMute" : "mute");
  ytCommand("setVolume", [Math.round(embedVolume * 100)]);
  ytCommand(embedPaused ? "pauseVideo" : "playVideo");
}

/** O player global avisa qual iframe está tocando. */
export function registerEmbed(frame: HTMLIFrameElement | null) {
  embedFrame = frame;
  if (!frame) return;
  // o YouTube só conversa depois de carregar: pede os eventos e reaplica volume/pausa algumas vezes
  frame.addEventListener("load", () => {
    frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
    [400, 1500, 4000].forEach((ms) => window.setTimeout(() => embedFrame === frame && syncEmbed(), ms));
  });
}

function setEmbedPaused(paused: boolean) {
  if (embedPaused === paused) return;
  embedPaused = paused;
  ytCommand(paused ? "pauseVideo" : "playVideo");
}

export function startAmbient(id: string, volume: number) {
  embedVolume = volume;
  if (current === id && master) return setAmbientVolume(volume);
  stopAmbient();
  if (isEmbedSound(id)) return setEmbedPaused(false);
  if (!id || id === "none") return;
  const ac = audio();
  master = ac.createGain();
  master.gain.setValueAtTime(0, ac.currentTime);
  master.gain.linearRampToValueAtTime(volume * 0.5, ac.currentTime + 1.2);
  master.connect(ac.destination);
  build(ac, id, master);
  current = id;
}

export function setAmbientVolume(volume: number) {
  embedVolume = volume;
  ytCommand(volume > 0 ? "unMute" : "mute");
  ytCommand("setVolume", [Math.round(volume * 100)]);
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(volume * 0.5, ctx.currentTime, 0.08);
}

export function stopAmbient() {
  setEmbedPaused(true);
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
  const m = master;
  const old = nodes;
  nodes = [];
  master = null;
  current = "none";
  if (!ctx || !m) return;
  const t = ctx.currentTime;
  m.gain.cancelScheduledValues(t);
  m.gain.setValueAtTime(m.gain.value, t);
  m.gain.linearRampToValueAtTime(0, t + 0.4);
  window.setTimeout(() => {
    old.forEach((n) => {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        /* já parado */
      }
      n.disconnect();
    });
    m.disconnect();
  }, 450);
}

export const ambientPlaying = () => current;

/** Sino suave de fim de etapa. */
export function playChime(volume = 0.6) {
  try {
    const ac = audio();
    const t = ac.currentTime + 0.02;
    const out = ac.createGain();
    out.gain.value = Math.max(0.15, volume) * 0.35;
    out.connect(ac.destination);
    [
      [880, 0],
      [1318.5, 0.18],
      [1760, 0.36],
    ].forEach(([freq, delay]) => {
      [1, 2.76, 5.4].forEach((mult, k) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = "sine";
        o.frequency.value = freq * mult;
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(k === 0 ? 0.6 : 0.12 / k, t + delay + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 2.2);
        o.connect(g).connect(out);
        o.start(t + delay);
        o.stop(t + delay + 2.3);
      });
    });
  } catch {
    /* sem áudio disponível */
  }
}

/**
 * Rádios ao vivo do canal oficial Lofi Girl (youtube.com/@LofiGirl), em ordem de preferência.
 * Se uma sair do ar, o player passa para a próxima.
 */
export const LOFI_STREAMS = [
  "rFZHOHl-L8A", // lofi hip hop radio 📚 beats to relax/study to
  "jfKfPfyJRdk", // endereço antigo da mesma rádio
  "CwPCy1GLS38", // sad lofi radio ☔ beats for rainy days
  "0muHFBSiybw", // summer lofi radio ☀️
];

const withApi = (url: string) => `${url}&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;

/** Converte um link do YouTube ou Spotify no endereço do player incorporado. */
export function embedUrl(id: string, custom: string, lofiIndex = 0): string | null {
  if (id === "lofi") return withApi(`https://www.youtube.com/embed/${LOFI_STREAMS[lofiIndex % LOFI_STREAMS.length]}?autoplay=1&rel=0`);
  if (id !== "custom" || !custom.trim()) return null;
  try {
    const u = new URL(custom.trim());
    if (/youtu\.be$/.test(u.hostname)) return withApi(`https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?autoplay=1&rel=0`);
    if (/youtube\.com$/.test(u.hostname)) {
      const list = u.searchParams.get("list");
      const v = u.searchParams.get("v");
      if (v) return withApi(`https://www.youtube-nocookie.com/embed/${v}?autoplay=1&rel=0${list ? `&list=${list}` : ""}`);
      if (list) return withApi(`https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=1`);
      const m = u.pathname.match(/\/(?:live|embed|shorts)\/([\w-]+)/);
      if (m) return withApi(`https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0`);
    }
    if (/open\.spotify\.com$/.test(u.hostname)) {
      const m = u.pathname.match(/\/(playlist|album|track|artist|episode|show)\/(\w+)/);
      if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0`;
    }
  } catch {
    /* link inválido */
  }
  return null;
}
