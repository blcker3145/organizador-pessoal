import { Maximize2, Pause, PictureInPicture2, Play, RotateCcw, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { openPipTimer } from "../lib/pipTimer";
import { formatClock, MODE_LABEL, reset, setVolume, skip, timeLeft, toggle, useNow, useTimer } from "../lib/pomodoro";
import { useApp } from "../lib/store";
import { navigate, ui, useRoute } from "../lib/ui";
import { cx } from "../lib/util";
import { NeuronLogo } from "./Logo";

/** Pílula flutuante com o tempo restante quando o Pomodoro está ativo fora da página dele. */
export function PomodoroMini() {
  const t = useTimer();
  const { path } = useRoute();
  const running = t.status === "running";
  const now = useNow(running);
  if (t.status === "idle" || path.startsWith("/pomodoro")) return null;
  const left = timeLeft(t, now);
  const fill = Math.min(1, Math.max(0, 1 - left / t.duration));
  return (
    <div className={cx("pomo-mini", running && "running")} role="status">
      <button className="pomo-mini-main" onClick={() => navigate("/pomodoro")} title="Abrir Pomodoro">
        <span className="pomo-mini-orb" style={{ ["--fill" as string]: `${fill * 100}%` }}>
          <NeuronLogo bare size={18} />
        </span>
        <span className="pomo-mini-text">
          <strong className="num">{formatClock(left)}</strong>
          <small>{t.status === "paused" ? "Pausado" : MODE_LABEL[t.mode]}</small>
        </span>
      </button>
      {/* ao passar o mouse, a pílula cresce e mostra o resto dos controles */}
      <div className="pomo-mini-extra">
        <button className="pomo-mini-ghost" onClick={reset} aria-label="Reiniciar etapa" title="Reiniciar">
          <RotateCcw size={15} />
        </button>
        <button className="pomo-mini-ghost" onClick={skip} aria-label="Pular etapa" title="Pular etapa">
          <SkipForward size={15} />
        </button>
        <button
          className="pomo-mini-ghost"
          onClick={async () => {
            const ok = await openPipTimer();
            if (!ok) ui.toast("A janela flutuante funciona no Chrome e no Edge do computador.");
          }}
          aria-label="Abrir em janela flutuante"
          title="Janela flutuante, por cima de tudo"
        >
          <PictureInPicture2 size={15} />
        </button>
        <button className="pomo-mini-ghost" onClick={() => navigate("/pomodoro")} aria-label="Abrir o Pomodoro" title="Abrir a página do Pomodoro">
          <Maximize2 size={15} />
        </button>
      </div>
      <MiniVolume />
      <button className="pomo-mini-btn" onClick={toggle} aria-label={running ? "Pausar" : "Continuar"}>
        {running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      </button>
    </div>
  );
}

/** Botão de volume: clique abre o controle deslizante; clique no ícone dentro dele silencia. */
function MiniVolume() {
  const { volume, sound } = useApp().pomodoroPrefs;
  const [open, setOpen] = useState(false);
  const lastRef = useRef(volume || 0.6);
  const wrapRef = useRef<HTMLDivElement>(null);
  if (volume > 0) lastRef.current = volume;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (sound === "none") return null;
  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="pomo-mini-vol" ref={wrapRef}>
      <button className={cx("pomo-mini-ghost", open && "on")} onClick={() => setOpen(!open)} aria-label="Volume" aria-expanded={open} title="Volume">
        <Icon size={16} />
      </button>
      {open && (
        <div className="pomo-mini-pop" role="group" aria-label="Volume">
          <button className="pomo-mini-ghost" onClick={() => setVolume(volume === 0 ? lastRef.current : 0)} aria-label={volume === 0 ? "Ativar som" : "Silenciar"}>
            <Icon size={16} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            aria-label="Volume"
            style={{ ["--val" as string]: `${volume * 100}%` }}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <span className="num">{Math.round(volume * 100)}</span>
        </div>
      )}
    </div>
  );
}
