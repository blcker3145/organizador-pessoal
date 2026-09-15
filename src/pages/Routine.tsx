import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Checkbox, CommitInput, Empty, Tabs } from "../components/common";
import { addDays, longDate, minutesToTime, nowMinutes, timeToMinutes, today, WEEKDAYS_LETTER, WEEKDAYS_SHORT, weekday } from "../lib/dates";
import { routineTotalMinutes } from "../lib/habits";
import { insert, patch, remove, setRoutineStep, setState, useApp } from "../lib/store";
import type { Routine, RoutineStep } from "../lib/types";
import { ui, usePersistedView } from "../lib/ui";
import { cx, uid } from "../lib/util";

type View = "hoje" | "modelos";

export function RoutinePage() {
  const state = useApp();
  const [view, setView] = usePersistedView<View>("routine", "hoje");
  const [selected, setSelected] = useState<string | null>(state.routines[0]?.id || null);

  const newRoutine = () => {
    const r: Routine = { id: uid(), name: "Nova rotina", days: [1, 2, 3, 4, 5], start: "08:00", steps: [{ id: uid(), title: "", minutes: 10, habitId: null }] };
    insert("routines", r);
    setSelected(r.id);
    setView("modelos");
  };

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <h1 className="page-title">Rotina</h1>
        <button className="btn primary" onClick={newRoutine}>
          <Plus size={15} /> Nova rotina
        </button>
      </div>
      <Tabs
        value={view}
        onChange={setView}
        items={[
          { value: "hoje", label: "Hoje" },
          { value: "modelos", label: "Modelos" },
        ]}
      />
      {view === "hoje" ? (
        <DayTimeline onEdit={(id) => (setSelected(id), setView("modelos"))} />
      ) : (
        <Templates selected={selected} onSelect={setSelected} />
      )}
    </div>
  );
}

function DayTimeline({ onEdit }: { onEdit: (id: string) => void }) {
  const state = useApp();
  const [date, setDate] = useState(today());
  const d0 = today();
  const wd = weekday(date);
  const routines = state.routines.filter((r) => r.days.includes(wd)).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const logs = state.routineLogs[date] || {};
  const now = nowMinutes();
  const currentId = date === d0 ? [...routines].reverse().find((r) => timeToMinutes(r.start) <= now)?.id : undefined;
  const totalSteps = routines.reduce((s, r) => s + r.steps.length, 0);
  const doneSteps = routines.reduce((s, r) => s + r.steps.filter((st) => logs[st.id]).length, 0);

  const resetDay = async () => {
    const ok = await ui.confirm({ title: "Desmarcar todos os passos deste dia?", confirmLabel: "Desmarcar" });
    if (!ok) return;
    setState((s) => {
      const next = { ...s.routineLogs };
      delete next[date];
      return { ...s, routineLogs: next };
    });
  };

  return (
    <>
      <div className="filters">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Dia anterior">
          <ChevronLeft size={16} />
        </button>
        <strong style={{ minWidth: 190, textAlign: "center" }}>{date === d0 ? `Hoje, ${longDate(date).split(", ")[1]}` : longDate(date)}</strong>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Próximo dia">
          <ChevronRight size={16} />
        </button>
        {date !== d0 && (
          <button className="btn sm" onClick={() => setDate(d0)}>
            Hoje
          </button>
        )}
        <span className="grow" />
        {totalSteps > 0 && (
          <span className="muted num">
            {doneSteps}/{totalSteps} passos
          </span>
        )}
        {doneSteps > 0 && (
          <button className="link-btn" onClick={resetDay}>
            <RotateCcw size={13} /> Desmarcar dia
          </button>
        )}
      </div>
      {routines.length === 0 && <Empty>Nenhuma rotina cadastrada para {WEEKDAYS_SHORT[wd]}. Crie ou edite em Modelos.</Empty>}
      <div className="timeline">
        {routines.map((r) => {
          let clock = timeToMinutes(r.start);
          const done = r.steps.filter((s) => logs[s.id]).length;
          return (
            <div key={r.id} className={cx("tl-block", r.id === currentId && "now")}>
              <div className="tl-time">{r.start}</div>
              <div className="tl-body">
                <div className="row" style={{ marginBottom: 4 }}>
                  <strong style={{ fontSize: 15 }}>{r.name}</strong>
                  <span className={cx("pill", done === r.steps.length && r.steps.length > 0 && "green")}>
                    {done}/{r.steps.length}
                  </span>
                  {r.id === currentId && <span className="pill blue">agora</span>}
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {minutesToTime(timeToMinutes(r.start))}–{minutesToTime(timeToMinutes(r.start) + routineTotalMinutes(r))}
                  </span>
                  <span className="grow" />
                  <button className="link-btn" onClick={() => onEdit(r.id)}>
                    Editar
                  </button>
                </div>
                {r.steps.map((s) => {
                  const t = clock;
                  clock += s.minutes || 0;
                  const checked = !!logs[s.id];
                  const habit = s.habitId ? state.habits.find((h) => h.id === s.habitId) : null;
                  return (
                    <div key={s.id} className={cx("step-row", checked && "done")}>
                      <Checkbox checked={checked} onChange={(v) => date <= d0 ? setRoutineStep(s.id, date, v, s.habitId) : ui.toast("Não dá para marcar um dia que ainda não chegou")} />
                      <span className="muted num" style={{ fontSize: 12.5, width: 42 }}>
                        {minutesToTime(t)}
                      </span>
                      <span className="s-title grow">{s.title || "Sem título"}</span>
                      {habit && <span className="pill outline" title="Marcar este passo marca o hábito">↔ {habit.name}</span>}
                      <span className="muted num" style={{ fontSize: 12.5 }}>
                        {s.minutes} min
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Templates({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const state = useApp();
  const sorted = [...state.routines].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const routine = state.routines.find((r) => r.id === selected) || sorted[0];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 240px) minmax(0, 1fr)", gap: 24, alignItems: "start" }} className="routine-templates">
      <div className="stack" style={{ gap: 2 }}>
        {sorted.length === 0 && <Empty>Nenhuma rotina.</Empty>}
        {sorted.map((r) => (
          <button key={r.id} className={cx("side-item", routine?.id === r.id && "active")} onClick={() => onSelect(r.id)} style={{ flexDirection: "column", alignItems: "flex-start", gap: 0, padding: "6px 10px" }}>
            <span>{r.name}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {r.start} · {routineTotalMinutes(r)} min · {r.days.length === 7 ? "todo dia" : r.days.map((d) => WEEKDAYS_SHORT[d]).join(", ")}
            </span>
          </button>
        ))}
      </div>
      {routine && <RoutineEditor routine={routine} key={routine.id} onDeleted={() => onSelect(null)} />}
    </div>
  );
}

function RoutineEditor({ routine, onDeleted }: { routine: Routine; onDeleted: () => void }) {
  const state = useApp();
  const set = (c: Partial<Routine>) => patch("routines", routine.id, c);
  const setStep = (id: string, c: Partial<RoutineStep>) => set({ steps: routine.steps.map((s) => (s.id === id ? { ...s, ...c } : s)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= routine.steps.length) return;
    const steps = routine.steps.slice();
    [steps[i], steps[j]] = [steps[j], steps[i]];
    set({ steps });
  };
  let clock = timeToMinutes(routine.start);

  const del = async () => {
    const ok = await ui.confirm({ title: "Excluir rotina?", message: `"${routine.name}" será apagada.`, confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    remove("routines", routine.id);
    onDeleted();
    ui.toast("Rotina excluída");
  };

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <CommitInput className="input bare" value={routine.name} onCommit={(name) => set({ name: name.trim() || "Sem nome" })} ariaLabel="Nome da rotina" />
        <button className="icon-btn" onClick={del} aria-label="Excluir rotina">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="props" style={{ gridTemplateColumns: "110px minmax(0,1fr)" }}>
        <span className="prop-k">Dias</span>
        <span className="prop-v" style={{ gap: 4 }}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const on = routine.days.includes(d);
            return (
              <button
                key={d}
                className={cx("chip-toggle", on && "on")}
                style={{ width: 34, padding: 0, justifyContent: "center" }}
                aria-label={WEEKDAYS_SHORT[d]}
                aria-pressed={on}
                onClick={() => set({ days: on ? routine.days.filter((x) => x !== d) : [...routine.days, d] })}
              >
                {WEEKDAYS_LETTER[d]}
              </button>
            );
          })}
        </span>
        <span className="prop-k">Começa às</span>
        <span className="prop-v">
          <input className="input bare" type="time" value={routine.start} onChange={(e) => e.target.value && set({ start: e.target.value })} aria-label="Horário de início" style={{ width: 120 }} />
          <span className="muted">
            termina {minutesToTime(timeToMinutes(routine.start) + routineTotalMinutes(routine))}
          </span>
        </span>
      </div>

      <div className="card-title">Passos</div>
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ width: 54 }}>Hora</th>
              <th>Passo</th>
              <th style={{ width: 80 }}>Minutos</th>
              <th style={{ width: 160 }}>Marca o hábito</th>
              <th style={{ width: 96 }} />
            </tr>
          </thead>
          <tbody>
            {routine.steps.map((s, i) => {
              const t = clock;
              clock += s.minutes || 0;
              return (
                <tr key={s.id}>
                  <td className="muted num">{minutesToTime(t)}</td>
                  <td>
                    <input className="input bare" value={s.title} placeholder="Descreva o passo" onChange={(e) => setStep(s.id, { title: e.target.value })} aria-label="Passo" autoFocus={!s.title && i === routine.steps.length - 1} />
                  </td>
                  <td>
                    <input className="input bare num" type="number" min={0} value={s.minutes} onChange={(e) => setStep(s.id, { minutes: Math.max(0, Number(e.target.value) || 0) })} aria-label="Minutos" />
                  </td>
                  <td>
                    <select className="select bare" value={s.habitId || ""} onChange={(e) => setStep(s.id, { habitId: e.target.value || null })} aria-label="Hábito vinculado" style={{ width: "100%" }}>
                      <option value="">Nenhum</option>
                      {state.habits
                        .filter((h) => !h.archived)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>
                    <span className="row" style={{ gap: 0 }}>
                      <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                        <ArrowUp size={14} />
                      </button>
                      <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === routine.steps.length - 1} aria-label="Descer">
                        <ArrowDown size={14} />
                      </button>
                      <button className="icon-btn" onClick={() => set({ steps: routine.steps.filter((x) => x.id !== s.id) })} aria-label="Remover passo">
                        <X size={14} />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => set({ steps: [...routine.steps, { id: uid(), title: "", minutes: 10, habitId: null }] })}>
        <Plus size={14} /> Adicionar passo
      </button>
    </div>
  );
}
