import { Pause, Play } from "lucide-react";
import { formatClock, MODE_LABEL, timeLeft, toggle, useNow, useTimer } from "../lib/pomodoro";
import { navigate, useRoute } from "../lib/ui";
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
      <button className="pomo-mini-btn" onClick={toggle} aria-label={running ? "Pausar" : "Continuar"}>
        {running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      </button>
    </div>
  );
}
