import { ArrowRight, CalendarClock, Plus, Star, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hm, isAllDayLike, meetLink, type UiEvent } from "../lib/calendar";
import { eventsForDay } from "../lib/calendarActions";
import { refreshGcalStatus, useGcal } from "../lib/gcal";
import { CAPTURE_KINDS, guessCapture } from "../lib/capture";
import { creativeStageInfo } from "../lib/creatives";
import { addDays, longDate, monthKey, nowMinutes, relativeDate, timeToMinutes, today, weekday } from "../lib/dates";
import { monthSummary } from "../lib/finance";
import { habitValue, isHabitDone, isScheduled, routineTotalMinutes } from "../lib/habits";
import { createTask, FOCUS_LIMIT, patch, setHabitValue, setRoutineStep, toggleFocus, toggleHabit, toggleTask, useApp } from "../lib/store";
import type { Habit, Task } from "../lib/types";
import { navigate, ui } from "../lib/ui";
import { cx, money } from "../lib/util";
import { Checkbox, Empty, PriorityPill, ProgressBar, stageInfo } from "../components/common";
import { saveGuess } from "../components/QuickCapture";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function TaskLine({ task, showDate, showFocus = true }: { task: Task; showDate?: boolean; showFocus?: boolean }) {
  const state = useApp();
  const project = state.projects.find((p) => p.id === task.projectId);
  const d0 = today();
  const inFocus = task.focusDate === d0;
  const subDone = task.subtasks.filter((s) => s.done).length;
  return (
    <div className={cx("task-row", task.status === "done" && "done")} onClick={() => ui.openTask(task.id)}>
      <Checkbox checked={task.status === "done"} onChange={() => toggleTask(task.id)} />
      <span className="t-title">{task.title || "Sem título"}</span>
      <span className="meta">
        {task.subtasks.length > 0 && (
          <span className="muted num" style={{ fontSize: 12 }}>
            {subDone}/{task.subtasks.length}
          </span>
        )}
        {task.status === "doing" && <span className="pill blue">Fazendo</span>}
        <PriorityPill p={task.priority} />
        {project && <span className="pill">{project.name}</span>}
        {showDate && task.date && <span className={cx("pill", task.date < d0 && task.status !== "done" && "red")}>{relativeDate(task.date)}</span>}
        {showFocus && task.status !== "done" && (
          <button
            className={cx("icon-btn star", inFocus && "on")}
            aria-label={inFocus ? "Tirar do foco do dia" : "Adicionar ao foco do dia"}
            title={inFocus ? "Tirar do foco" : "Adicionar ao foco do dia"}
            onClick={(e) => {
              e.stopPropagation();
              if (!toggleFocus(task.id)) ui.toast(`O foco do dia aceita até ${FOCUS_LIMIT} tarefas`);
            }}
          >
            <Star size={15} fill={inFocus ? "currentColor" : "none"} />
          </button>
        )}
      </span>
    </div>
  );
}

export function QuickAddTask({ date, placeholder = "Adicionar tarefa", extra }: { date?: string | null; placeholder?: string; extra?: Partial<Task> }) {
  const [title, setTitle] = useState("");
  const add = () => {
    if (!title.trim()) return;
    createTask({ title: title.trim(), date: date ?? null, ...extra });
    setTitle("");
  };
  return (
    <div className="add-row">
      <Plus size={16} />
      <input placeholder={placeholder} aria-label={placeholder} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
    </div>
  );
}

export function TodayPage() {
  const state = useApp();
  const d0 = today();
  const [capture, setCapture] = useState("");
  const guess = useMemo(() => (capture.trim() ? guessCapture(capture) : null), [capture]);

  const open = state.tasks.filter((t) => t.status !== "done" || t.completedAt! >= new Date(d0 + "T00:00").getTime());
  const focus = state.tasks.filter((t) => t.focusDate === d0);
  const overdue = open.filter((t) => t.status !== "done" && t.date && t.date < d0 && t.focusDate !== d0);
  const todays = open.filter((t) => t.date === d0 && t.focusDate !== d0).sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));

  const submitCapture = () => {
    if (saveGuess(capture)) setCapture("");
  };

  const moveOverdue = () => {
    overdue.forEach((t) => patch("tasks", t.id, { date: d0 }));
    ui.toast(`${overdue.length} tarefa(s) movida(s) para hoje`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {greeting()}
            {state.profile.name ? `, ${state.profile.name}` : ""}
          </h1>
          <div className="page-sub">{longDate(d0)}</div>
        </div>
        <button className="btn" onClick={ui.openReview}>
          <CalendarClock size={15} /> Revisão semanal
        </button>
      </div>

      <div className="capture-bar">
        <input
          id="today-capture"
          placeholder="Anote algo… vira tarefa, ideia, vídeo, criativo ou gasto"
          value={capture}
          onChange={(e) => setCapture(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitCapture()}
        />
        <button className="btn ghost sm" onClick={() => (ui.openCapture(capture), setCapture(""))}>
          Mais opções
        </button>
        <button className="btn primary sm" onClick={submitCapture} disabled={!capture.trim()}>
          Salvar
        </button>
      </div>
      <div className="capture-hint">
        {guess ? (
          <>
            <ArrowRight size={13} /> Enter salva como <span className="pill blue">{CAPTURE_KINDS.find((k) => k.kind === guess.kind)!.label}</span>
            {guess.date && <span className="pill">{relativeDate(guess.date)}</span>}
            {guess.amount !== null && <span className="pill">{money(guess.amount)}</span>}
            {guess.categoryName && <span className="pill">{guess.categoryName}</span>}
          </>
        ) : (
          <span>Dica: "amanhã", "sexta" ou "15/10" viram data · "R$ 32,50" vira gasto · começar com "vídeo" ou "criativo" vira ideia</span>
        )}
      </div>

      <div className="today-grid">
        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <div className="card-title">
              <span>
                Foco do dia · {focus.length}/{FOCUS_LIMIT}
              </span>
            </div>
            {focus.length === 0 && <Empty>Escolha até 3 tarefas importantes: passe o mouse numa tarefa e clique na estrela.</Empty>}
            {focus.map((t) => (
              <TaskLine key={t.id} task={t} />
            ))}
          </section>

          <section className="card">
            <div className="card-title">
              <span>Tarefas</span>
              <a className="link-btn" href="#/tarefas">
                Ver todas
              </a>
            </div>
            {overdue.length > 0 && (
              <>
                <div className="group-head">
                  <span className="red">Atrasadas</span>
                  <span className="pill red">{overdue.length}</span>
                  <span className="grow" />
                  <button className="btn ghost sm" onClick={moveOverdue}>
                    Mover para hoje
                  </button>
                </div>
                {overdue.map((t) => (
                  <TaskLine key={t.id} task={t} showDate />
                ))}
              </>
            )}
            <div className="group-head">
              Hoje <span className="pill">{todays.filter((t) => t.status !== "done").length}</span>
            </div>
            {todays.length === 0 && <Empty>Nada marcado para hoje.</Empty>}
            {todays.map((t) => (
              <TaskLine key={t.id} task={t} />
            ))}
            <QuickAddTask date={d0} placeholder="Adicionar tarefa para hoje" />
          </section>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <AgendaToday />
          <RoutineNow />
          <HabitsToday />
          <MoneyToday />
          <VideosSoon />
          <CreativesSoon />
        </div>
      </div>
    </div>
  );
}

function AgendaToday() {
  const state = useApp();
  const gcal = useGcal();
  const [events, setEvents] = useState<UiEvent[] | null>(null);
  const d0 = today();

  useEffect(() => {
    refreshGcalStatus();
  }, []);

  useEffect(() => {
    let alive = true;
    eventsForDay(new Date()).then((list) => alive && setEvents(list));
    return () => {
      alive = false;
    };
  }, [d0, state.events, state.calendarPrefs.hidden, gcal.version, gcal.connected, gcal.calendars]);

  const now = Date.now();
  return (
    <section className="card">
      <div className="card-title">
        <span>Agenda de hoje{events ? ` · ${events.length}` : ""}</span>
        <a className="link-btn" href="#/agenda">
          Abrir agenda
        </a>
      </div>
      {events === null && <Empty>Carregando…</Empty>}
      {events?.length === 0 && <Empty>Nenhum compromisso hoje.</Empty>}
      {events?.map((ev) => {
        const past = !isAllDayLike(ev) && ev.end.getTime() < now;
        const meet = meetLink(ev.google);
        return (
          <div key={ev.key} className={cx("step-row", past && "done")} style={{ cursor: "pointer" }} onClick={() => navigate("/agenda")}>
            <i style={{ width: 8, height: 8, borderRadius: "50%", background: ev.color, flex: "none" }} />
            <span className="muted num" style={{ fontSize: 12.5, width: 44, flex: "none" }}>
              {isAllDayLike(ev) ? "dia" : hm(ev.start)}
            </span>
            <span className="s-title grow ellipsis">{ev.title}</span>
            {meet && !past && (
              <a className="icon-btn" href={meet} target="_blank" rel="noreferrer" title="Entrar no Google Meet" aria-label="Entrar no Google Meet" onClick={(e) => e.stopPropagation()}>
                <Video size={14} />
              </a>
            )}
          </div>
        );
      })}
      {gcal.checked && gcal.configured && !gcal.connected && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          <a className="link" href="#/agenda">
            Conectar Google Agenda
          </a>{" "}
          para ver seus compromissos aqui.
        </div>
      )}
    </section>
  );
}

function RoutineNow() {
  const state = useApp();
  const d0 = today();
  const wd = weekday(d0);
  const routines = state.routines.filter((r) => r.days.includes(wd)).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const now = nowMinutes();
  // rotina ativa: a última que já começou; antes da primeira, mostra a primeira
  let active = routines[0];
  routines.forEach((r) => {
    if (timeToMinutes(r.start) <= now) active = r;
  });
  if (!active) {
    return (
      <section className="card">
        <div className="card-title">Rotina</div>
        <Empty>
          Nenhuma rotina para hoje. <a className="link" href="#/rotina">Criar rotina</a>
        </Empty>
      </section>
    );
  }
  const logs = state.routineLogs[d0] || {};
  const doneCount = active.steps.filter((s) => logs[s.id]).length;
  let clock = timeToMinutes(active.start);
  const started = timeToMinutes(active.start) <= now;
  const ended = timeToMinutes(active.start) + routineTotalMinutes(active) < now;
  return (
    <section className="card">
      <div className="card-title">
        <span>
          Rotina · {active.name} · {doneCount}/{active.steps.length}
        </span>
        <a className="link-btn" href="#/rotina">
          {started ? (ended ? "Terminou" : "Agora") : `Começa ${active.start}`}
        </a>
      </div>
      {active.steps.map((s) => {
        const t = clock;
        clock += s.minutes;
        const done = !!logs[s.id];
        return (
          <div key={s.id} className={cx("step-row", done && "done")}>
            <Checkbox checked={done} onChange={(v) => setRoutineStep(s.id, d0, v, s.habitId)} />
            <span className="muted num" style={{ fontSize: 12.5, width: 40 }}>
              {String(Math.floor(t / 60)).padStart(2, "0")}:{String(t % 60).padStart(2, "0")}
            </span>
            <span className="s-title grow ellipsis">{s.title}</span>
            {s.habitId && <span className="pill outline">hábito</span>}
          </div>
        );
      })}
    </section>
  );
}

function HabitChip({ habit }: { habit: Habit }) {
  const state = useApp();
  const d0 = today();
  const done = isHabitDone(state, habit, d0);
  const value = habitValue(state, habit.id, d0);
  if (habit.type === "qty") {
    const step = habit.target >= 10 ? Math.round(habit.target / 5) : habit.target <= 3 ? 0.25 : 1;
    return (
      <span className={cx("chip-toggle", done && "on")} style={{ paddingRight: 4 }}>
        {habit.name}{" "}
        <span className="num" style={{ opacity: 0.8 }}>
          {String(Math.round(value * 100) / 100).replace(".", ",")}/{String(habit.target).replace(".", ",")} {habit.unit}
        </span>
        <button
          className="icon-btn"
          style={{ width: 22, height: 22, color: "inherit" }}
          aria-label={`Somar ${step} ${habit.unit} em ${habit.name}`}
          onClick={() => setHabitValue(habit.id, d0, Math.round((value + step) * 100) / 100)}
        >
          <Plus size={13} />
        </button>
      </span>
    );
  }
  return (
    <button className={cx("chip-toggle", done && "on")} onClick={() => toggleHabit(habit, d0)} aria-pressed={done}>
      {done ? "✓ " : ""}
      {habit.name}
    </button>
  );
}

function HabitsToday() {
  const state = useApp();
  const d0 = today();
  const habits = state.habits.filter((h) => !h.archived && isScheduled(h, d0));
  const done = habits.filter((h) => isHabitDone(state, h, d0)).length;
  return (
    <section className="card">
      <div className="card-title">
        <span>
          Hábitos · {done}/{habits.length}
        </span>
        <a className="link-btn" href="#/habitos">
          Ver grade
        </a>
      </div>
      {habits.length === 0 && <Empty>Nenhum hábito para hoje.</Empty>}
      <div className="row wrap" style={{ gap: 6 }}>
        {habits.map((h) => (
          <HabitChip key={h.id} habit={h} />
        ))}
      </div>
    </section>
  );
}

function MoneyToday() {
  const state = useApp();
  const d0 = today();
  const sum = monthSummary(state, monthKey(d0));
  const spentToday = state.transactions.filter((t) => t.date === d0 && t.kind === "saida").reduce((s, t) => s + t.amount, 0);
  const free = sum.budgetTotal - sum.budgetSpent;
  return (
    <section className="card">
      <div className="card-title">
        <span>Dinheiro do mês</span>
        <a className="link-btn" href="#/financas">
          Finanças
        </a>
      </div>
      <div className="row" style={{ justifyContent: "space-between", padding: "2px 0" }}>
        <span className="text-2">Gasto hoje</span>
        <strong className="num">{money(spentToday)}</strong>
      </div>
      <div className="row" style={{ justifyContent: "space-between", padding: "2px 0" }}>
        <span className="text-2">Livre no orçamento</span>
        <strong className={cx("num", free < 0 && "red")}>{money(free)}</strong>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <ProgressBar pct={sum.budgetUsedPct} />
        <span className="muted num" style={{ fontSize: 12.5 }}>
          {sum.budgetUsedPct}%
        </span>
      </div>
    </section>
  );
}

function VideosSoon() {
  const state = useApp();
  const d0 = today();
  const limit = addDays(d0, 7);
  const videos = state.videos
    .filter((v) => v.stage !== "publicado" && (v.stage === "gravacao" || (v.publishDate && v.publishDate >= d0 && v.publishDate <= limit)))
    .sort((a, b) => (a.publishDate || "9") .localeCompare(b.publishDate || "9"));
  return (
    <section className="card">
      <div className="card-title">
        <span>Vídeos</span>
        <a className="link-btn" href="#/videos">
          Pipeline
        </a>
      </div>
      {videos.length === 0 && <Empty>Nada gravando ou para publicar nos próximos 7 dias.</Empty>}
      {videos.map((v) => (
        <div key={v.id} className="task-row" onClick={() => navigate(`/videos/${v.id}`)}>
          <span className={cx("pill", stageInfo(v.stage).color)}>{stageInfo(v.stage).label}</span>
          <span className="t-title">{v.title}</span>
          {v.publishDate && <span className="muted" style={{ fontSize: 12.5 }}>{relativeDate(v.publishDate)}</span>}
        </div>
      ))}
    </section>
  );
}

function CreativesSoon() {
  const state = useApp();
  const d0 = today();
  const limit = addDays(d0, 7);
  const creatives = state.creatives
    .filter((c) => c.stage !== "entregue" && (c.stage === "criacao" || c.stage === "revisao" || (c.dueDate && c.dueDate <= limit)))
    .sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
  return (
    <section className="card">
      <div className="card-title">
        <span>Criativos</span>
        <a className="link-btn" href="#/criativos">
          Pipeline
        </a>
      </div>
      {creatives.length === 0 && <Empty>Nenhuma peça em criação ou com entrega nos próximos 7 dias.</Empty>}
      {creatives.map((c) => {
        const info = creativeStageInfo(c.stage);
        return (
          <div key={c.id} className="task-row" onClick={() => navigate(`/criativos/${c.id}`)}>
            <span className={cx("pill", info.color)}>{info.label}</span>
            <span className="t-title">{c.title || "Sem título"}</span>
            {c.dueDate && <span className={cx("muted", c.dueDate < d0 && "red")} style={{ fontSize: 12.5 }}>{relativeDate(c.dueDate)}</span>}
          </div>
        );
      })}
    </section>
  );
}
