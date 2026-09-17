import { Bell, Link2, Maximize2, Minimize2, Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LavaCanvas } from "../components/LavaCanvas";
import { NeuronLogo } from "../components/Logo";
import { Checkbox } from "../components/common";
import { PLAYER_SLOT } from "../components/PomodoroPlayer";
import { AMBIENTS, ambientPlaying, embedUrl, isEmbedSound, startAmbient, stopAmbient } from "../lib/ambient";
import { today } from "../lib/dates";
import {
  focusStats,
  formatClock,
  MODE_LABEL,
  reset,
  setImmersive,
  setMode,
  setTask,
  setVolume,
  skip,
  syncIdleDuration,
  timeLeft,
  toggle,
  useNow,
  useTimer,
} from "../lib/pomodoro";
import { setState, useApp } from "../lib/store";
import type { PomodoroMode, PomodoroPrefs } from "../lib/types";
import { cx } from "../lib/util";

const MODES: PomodoroMode[] = ["focus", "short", "long"];

function usePrefs() {
  const prefs = useApp().pomodoroPrefs;
  const set = (p: Partial<PomodoroPrefs>) => setState((s) => ({ ...s, pomodoroPrefs: { ...s.pomodoroPrefs, ...p } }));
  return [prefs, set] as const;
}

/* ---------- palco (cartão e tela cheia) ---------- */

function Stage() {
  const t = useTimer();
  const state = useApp();
  const [prefs, setPrefs] = usePrefs();
  const running = t.status === "running";
  const now = useNow(running);
  const left = timeLeft(t, now);
  const fill = t.status === "idle" ? 0 : Math.min(1, Math.max(0, 1 - left / t.duration));
  const task = t.taskId ? state.tasks.find((x) => x.id === t.taskId) : null;
  const longEvery = Math.max(1, prefs.longEvery);
  const embed = t.mode === "focus" && t.status !== "idle" ? embedUrl(prefs.sound, prefs.musicUrl) : null;
  const muted = prefs.volume === 0;

  // cada grupo de controles escurece quando o líquido passa por trás dele
  const stageRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    const surface = box.bottom - fill * box.height;
    for (const el of [topRef.current, controlsRef.current, dockRef.current]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      el.classList.toggle("on-light", r.top + r.height / 2 > surface + 6);
    }
  });

  // Esc sai da tela cheia; espaço inicia/pausa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']");
      if (typing) return;
      if (e.key === "Escape" && t.immersive) setImmersive(false);
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t.immersive]);

  return (
    <section ref={stageRef} className={cx("pomo-stage", t.immersive && "full", running && "running", `mode-${t.mode}`, !["none", "white"].includes(prefs.sound) && "tinted")} aria-label="Cronômetro Pomodoro">
      <LavaCanvas fill={fill} calm={!running} hostRef={stageRef} palette={prefs.sound === "custom" && !prefs.musicUrl ? "none" : prefs.sound} />

      <header className="pomo-top" ref={topRef}>
        <span className="glass-chip">
          <span className="blend-in">{MODE_LABEL[t.mode]}</span>
        </span>
        <span className="pomo-dots" aria-label={`${t.cycle % longEvery} de ${longEvery} focos até a pausa longa`}>
          {Array.from({ length: longEvery }, (_, i) => (
            <i key={i} className={cx(i < t.cycle % longEvery || (t.cycle > 0 && t.cycle % longEvery === 0 && t.mode === "long") ? "on" : "")} />
          ))}
        </span>
        <span className="grow" />
        <button className="glass-btn sm" onClick={() => setImmersive(!t.immersive)} aria-label={t.immersive ? "Sair da tela cheia" : "Tela cheia"} title={t.immersive ? "Sair (Esc)" : "Tela cheia"}>
          {t.immersive ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </header>

      <div className="pomo-center blend">
        <div className="pomo-orb">
          <NeuronLogo bare size={t.immersive ? 120 : 84} />
        </div>
        <div className="pomo-clock" role="timer" aria-live="off">
          {formatClock(left)}
        </div>
        <div className="pomo-sub">{task ? task.title : t.status === "idle" ? (t.mode === "focus" ? "Pronto para focar" : "Hora de respirar") : t.status === "paused" ? "Pausado" : t.mode === "focus" ? "Em foco" : "Descansando"}</div>
      </div>

      <footer className="pomo-controls" ref={controlsRef}>
        <button className="glass-btn" onClick={reset} aria-label="Reiniciar" title="Reiniciar">
          <RotateCcw size={18} />
        </button>
        <button className="glass-btn primary" onClick={toggle} aria-label={running ? "Pausar" : "Iniciar"} title="Iniciar/pausar (espaço)">
          {running ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" style={{ marginLeft: 3 }} />}
        </button>
        <button className="glass-btn" onClick={skip} aria-label="Pular etapa" title="Pular etapa">
          <SkipForward size={18} />
        </button>
      </footer>

      {t.immersive && (
        <div className="pomo-dock" ref={dockRef}>
          <div className="glass-bar" role="radiogroup" aria-label="Som">
            {AMBIENTS.filter((a) => a.id !== "custom" || prefs.musicUrl).map((a) => (
              <button
                key={a.id}
                role="radio"
                aria-checked={prefs.sound === a.id}
                className={cx("glass-pill", prefs.sound === a.id && "on")}
                onClick={() => {
                  setPrefs({ sound: a.id });
                  if (running && t.mode === "focus") startAmbient(a.id, prefs.volume);
                }}
              >
                {a.label}
              </button>
            ))}
            <span className="glass-sep" />
            <button className="glass-btn xs" onClick={() => setVolume(muted ? 0.6 : 0)} aria-label={muted ? "Ativar som" : "Silenciar"}>
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              className="glass-range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.volume}
              aria-label="Volume"
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
              }}
            />
          </div>
        </div>
      )}

      {/* o player de verdade é global (continua tocando em outras páginas) e se encaixa aqui */}
      {embed && <div className={cx("pomo-player glass", PLAYER_SLOT, !t.immersive && "inline")} />}
    </section>
  );
}

/* ---------- página ---------- */

export function PomodoroPage() {
  const state = useApp();
  const t = useTimer();
  const [prefs, setPrefs] = usePrefs();
  const [url, setUrl] = useState(prefs.musicUrl);
  const stats = focusStats();
  const d0 = today();

  useEffect(() => syncIdleDuration(), [prefs.focus, prefs.short, prefs.long]);
  // sai da tela cheia ao deixar a página
  useEffect(() => () => setImmersive(false), []);

  const tasks = useMemo(
    () =>
      state.tasks
        .filter((x) => x.status !== "done")
        .sort((a, b) => Number(b.focusDate === d0) - Number(a.focusDate === d0) || Number(b.date === d0) - Number(a.date === d0))
        .slice(0, 60),
    [state.tasks, d0],
  );

  const week = useMemo(() => {
    const days: { label: string; minutes: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({
        label: d.toLocaleDateString("pt-BR", { weekday: "narrow" }).toUpperCase(),
        minutes: state.pomodoroLog.filter((l) => l.date === iso).reduce((a, l) => a + l.minutes, 0),
      });
    }
    return days;
  }, [state.pomodoroLog]);
  const maxWeek = Math.max(25, ...week.map((w) => w.minutes));
  const recent = [...state.pomodoroLog].reverse().slice(0, 6);
  const validUrl = !url.trim() || !!embedUrl("custom", url);

  const chooseSound = (id: string) => {
    setPrefs({ sound: id });
    if (t.status === "running" && t.mode === "focus") startAmbient(id, prefs.volume);
    else if (!isEmbedSound(id) && id !== "none") {
      // prévia curta para ouvir o som
      startAmbient(id, prefs.volume);
      window.setTimeout(() => {
        if (ambientPlaying() === id && t.status !== "running") stopAmbient();
      }, 2500);
    }
  };

  const num = (key: "focus" | "short" | "long" | "longEvery", min: number, max: number) => (
    <input
      className="input pomo-num"
      type="number"
      min={min}
      max={max}
      value={prefs[key]}
      onChange={(e) => {
        const v = Math.round(Number(e.target.value));
        if (Number.isFinite(v)) setPrefs({ [key]: Math.min(max, Math.max(min, v)) } as Partial<PomodoroPrefs>);
      }}
    />
  );

  return (
    <div className="page pomo-page">
      <div className="page-head">
        <div className="row" style={{ gap: 12 }}>
          <span className="pomo-icon">
            <NeuronLogo size={40} />
          </span>
          <div>
            <h1 className="page-title">Pomodoro</h1>
            <div className="page-sub">Blocos de foco com pausas. Espaço inicia e pausa.</div>
          </div>
        </div>
      </div>

      <div className="seg pomo-modes" role="tablist" aria-label="Etapa">
        {MODES.map((m) => (
          <button key={m} role="tab" aria-selected={t.mode === m} className={cx(t.mode === m && "on")} onClick={() => setMode(m)}>
            {MODE_LABEL[m]}
            <span className="pomo-mode-min"> · {m === "focus" ? prefs.focus : m === "short" ? prefs.short : prefs.long} min</span>
          </button>
        ))}
      </div>

      <Stage />

      <div className="pomo-grid">
        <section className="card">
          <div className="card-title">Tarefa em foco</div>
          <select className="select" value={t.taskId || ""} onChange={(e) => setTask(e.target.value || null)} aria-label="Tarefa em foco">
            <option value="">Nenhuma tarefa</option>
            {tasks.map((x) => (
              <option key={x.id} value={x.id}>
                {x.focusDate === d0 ? "★ " : ""}
                {x.title || "Sem título"}
              </option>
            ))}
          </select>
          <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
            Os focos concluídos ficam registrados com a tarefa escolhida.
          </p>
        </section>

        <section className="card">
          <div className="card-title">
            <span>Hoje</span>
            <span className="muted num">{stats.count} {stats.count === 1 ? "foco" : "focos"}</span>
          </div>
          <div className="pomo-stat">
            <strong className="num">{Math.floor(stats.minutes / 60) ? `${Math.floor(stats.minutes / 60)} h ` : ""}{stats.minutes % 60} min</strong>
            <span className="muted">de foco</span>
          </div>
          <div className="pomo-week" aria-label="Minutos de foco nos últimos 7 dias">
            {week.map((w, i) => (
              <div key={i} className="pomo-bar" title={`${w.minutes} min`}>
                <span style={{ height: `${Math.max(4, (w.minutes / maxWeek) * 100)}%` }} className={cx(w.minutes > 0 && "on", i === 6 && "today")} />
                <small>{w.label}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="card pomo-sounds">
          <div className="card-title">
            <span>Som ambiente</span>
            <span className="row" style={{ gap: 6 }}>
              <Volume2 size={14} className="muted" />
              <input
                className="pomo-range"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={prefs.volume}
                aria-label="Volume"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                }}
              />
            </span>
          </div>
          <div className="sound-grid" role="radiogroup" aria-label="Som ambiente">
            {AMBIENTS.map((a) => (
              <button key={a.id} role="radio" aria-checked={prefs.sound === a.id} className={cx("sound-card", `s-${a.id}`, prefs.sound === a.id && "on")} onClick={() => chooseSound(a.id)}>
                <span className="sound-art" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <strong>{a.label}</strong>
                <small>{a.hint}</small>
              </button>
            ))}
          </div>
          {prefs.sound === "custom" && (
            <label className="field" style={{ marginTop: 10 }}>
              <span className="row" style={{ gap: 6 }}>
                <Link2 size={13} /> Link da playlist (YouTube ou Spotify)
              </span>
              <input
                className="input"
                placeholder="https://open.spotify.com/playlist/… ou https://youtube.com/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => validUrl && setPrefs({ musicUrl: url.trim() })}
              />
              {!validUrl && <span className="red">Esse link não parece ser do YouTube ou do Spotify.</span>}
            </label>
          )}
          <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
            O som toca durante os focos e para nas pausas. Chuva, mar, lareira e ruídos são gerados aqui mesmo e funcionam sem internet.
          </p>
        </section>

        <section className="card">
          <div className="card-title">Ajustes</div>
          <div className="pomo-settings">
            <label>
              Foco (min) {num("focus", 1, 180)}
            </label>
            <label>
              Pausa curta {num("short", 1, 60)}
            </label>
            <label>
              Pausa longa {num("long", 1, 90)}
            </label>
            <label>
              Pausa longa a cada {num("longEvery", 1, 12)}
            </label>
          </div>
          <label className="row" style={{ gap: 8, marginTop: 12, cursor: "pointer" }}>
            <Checkbox checked={prefs.autoStart} onChange={(v) => setPrefs({ autoStart: v })} label="Iniciar a próxima etapa sozinho" />
            Iniciar a próxima etapa sozinho
          </label>
          <label className="row" style={{ gap: 8, marginTop: 8, cursor: "pointer" }}>
            <Checkbox checked={prefs.notify} onChange={(v) => setPrefs({ notify: v })} label="Avisar no fim de cada etapa" />
            <Bell size={13} className="muted" /> Avisar no fim de cada etapa
          </label>
        </section>

        {recent.length > 0 && (
          <section className="card">
            <div className="card-title">Últimos focos</div>
            {recent.map((r) => {
              const task = r.taskId ? state.tasks.find((x) => x.id === r.taskId) : null;
              return (
                <div key={r.id} className="step-row">
                  <span className="muted num" style={{ fontSize: 12.5, width: 92, flex: "none" }}>
                    {new Date(r.endedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="s-title grow ellipsis">{task ? task.title : "Foco livre"}</span>
                  <span className="pill num">{r.minutes} min</span>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
