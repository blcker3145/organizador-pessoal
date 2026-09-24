/*
 * Janela flutuante do Pomodoro (Picture-in-Picture de documento).
 * Fica por cima dos outros programas, então dá para trabalhar em qualquer lugar
 * sem manter a janela do app à vista. A aba do app continua aberta por trás.
 */
import { formatClock, MODE_LABEL, skip, timeLeft, timerStore, toggle } from "./pomodoro";

interface PipApi {
  requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
  window: Window | null;
}

const pip = (): PipApi | null => (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture || null;

export const pipSupported = () => !!pip();
export const pipOpen = () => !!pip()?.window;

const CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    background: #0a0a0c; color: #fff; font-family: -apple-system, "Segoe UI", system-ui, sans-serif; user-select: none;
    cursor: default;
  }
  .mode { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.55; }
  .clock { font-size: 15vw; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; }
  .task { font-size: 12px; opacity: 0.6; max-width: 90%; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
  button {
    border: 0; border-radius: 999px; background: rgba(255, 255, 255, 0.14); color: #fff; cursor: pointer;
    width: 34px; height: 34px; display: grid; place-items: center; font-size: 14px; transition: background 150ms ease, transform 150ms ease;
  }
  button:hover { background: rgba(255, 255, 255, 0.26); }
  button:active { transform: scale(0.92); }
  button.play { width: 44px; height: 44px; background: #fff; color: #000; font-size: 17px; }
  button.play:hover { background: #eee; }
  .bar { position: fixed; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255, 255, 255, 0.12); }
  .bar i { display: block; height: 100%; background: #fff; transition: width 300ms linear; }
`;

const ICON = { play: "▶", pause: "❚❚", skip: "⏭" };

/** Abre a janelinha; devolve false quando o navegador não tem o recurso. */
export async function openPipTimer(): Promise<boolean> {
  const api = pip();
  if (!api) return false;
  if (api.window) {
    api.window.focus();
    return true;
  }
  let win: Window;
  try {
    win = await api.requestWindow({ width: 260, height: 190 });
  } catch {
    // alguns navegadores (e telas embutidas) têm a API mas não abrem a janela
    return false;
  }
  const doc = win.document;
  const style = doc.createElement("style");
  style.textContent = CSS;
  doc.head.append(style);

  const mode = doc.createElement("div");
  mode.className = "mode";
  const clock = doc.createElement("div");
  clock.className = "clock";
  const task = doc.createElement("div");
  task.className = "task";
  const row = doc.createElement("div");
  row.className = "row";
  const playBtn = doc.createElement("button");
  playBtn.className = "play";
  playBtn.title = "Iniciar ou pausar";
  const skipBtn = doc.createElement("button");
  skipBtn.textContent = ICON.skip;
  skipBtn.title = "Pular etapa";
  const bar = doc.createElement("div");
  bar.className = "bar";
  const fill = doc.createElement("i");
  bar.append(fill);

  playBtn.onclick = () => toggle();
  skipBtn.onclick = () => skip();

  row.append(playBtn, skipBtn);
  doc.body.append(mode, clock, task, row, bar);

  const render = () => {
    const s = timerStore.get();
    const left = timeLeft(s);
    mode.textContent = MODE_LABEL[s.mode];
    clock.textContent = formatClock(left);
    playBtn.textContent = s.status === "running" ? ICON.pause : ICON.play;
    fill.style.width = `${Math.min(100, Math.max(0, (1 - left / Math.max(1, s.duration)) * 100))}%`;
    task.textContent = s.status === "paused" ? "Pausado" : "";
    doc.title = `${formatClock(left)} · ${MODE_LABEL[s.mode]}`;
  };

  render();
  const timer = win.setInterval(render, 500);
  const stop = timerStore.subscribe(render);
  win.addEventListener("pagehide", () => {
    win.clearInterval(timer);
    stop();
  });
  return true;
}

export function closePipTimer() {
  pip()?.window?.close();
}
