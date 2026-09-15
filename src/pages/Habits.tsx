import { Archive, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Empty, Modal, Tabs, useEscape } from "../components/common";
import {
  addDays,
  fromISO,
  monthDays,
  monthKey,
  monthLabel,
  shiftMonthKey,
  shortDate,
  startOfWeek,
  today,
  WEEKDAYS_LETTER,
  WEEKDAYS_SHORT,
  weekday,
} from "../lib/dates";
import { bestStreak, currentStreak, freqLabel, habitValue, isHabitDone, isScheduled, monthRate } from "../lib/habits";
import { deleteHabit, insert, patch, setHabitValue, toggleHabit, useApp } from "../lib/store";
import type { AppState, Habit, HabitFreq } from "../lib/types";
import { ui, usePersistedView } from "../lib/ui";
import { cx, uid } from "../lib/util";

type View = "semana" | "mes";

export function HabitsPage() {
  const state = useApp();
  const [view, setView] = usePersistedView<View>("habits", "semana");
  const [weekStart, setWeekStart] = useState(startOfWeek(today()));
  const [month, setMonth] = useState(monthKey(today()));
  const [detail, setDetail] = useState<string | null>(null);
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const habits = state.habits.filter((h) => h.archived === showArchived);
  const detailHabit = state.habits.find((h) => h.id === detail);

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <h1 className="page-title">Hábitos</h1>
        <button className="btn primary" onClick={() => setEditing("new")}>
          <Plus size={15} /> Novo hábito
        </button>
      </div>
      <Tabs
        value={view}
        onChange={setView}
        items={[
          { value: "semana", label: "Semana" },
          { value: "mes", label: "Mês" },
        ]}
      />
      <div className="filters">
        {view === "semana" ? (
          <>
            <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semana anterior">
              <ChevronLeft size={16} />
            </button>
            <strong style={{ minWidth: 130, textAlign: "center" }}>
              {shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}
            </strong>
            <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Próxima semana">
              <ChevronRight size={16} />
            </button>
            <button className="btn sm" onClick={() => setWeekStart(startOfWeek(today()))}>
              Esta semana
            </button>
          </>
        ) : (
          <>
            <button className="icon-btn" onClick={() => setMonth(shiftMonthKey(month, -1))} aria-label="Mês anterior">
              <ChevronLeft size={16} />
            </button>
            <strong style={{ minWidth: 130, textAlign: "center" }}>{monthLabel(month)}</strong>
            <button className="icon-btn" onClick={() => setMonth(shiftMonthKey(month, 1))} aria-label="Próximo mês">
              <ChevronRight size={16} />
            </button>
          </>
        )}
        <span className="grow" />
        <button className="link-btn" onClick={() => setShowArchived(!showArchived)}>
          <Archive size={13} /> {showArchived ? "Ver ativos" : "Ver arquivados"}
        </button>
      </div>

      {habits.length === 0 ? (
        <Empty>{showArchived ? "Nenhum hábito arquivado." : "Nenhum hábito ainda. Crie o primeiro no botão acima."}</Empty>
      ) : view === "semana" ? (
        <WeekGrid habits={habits} weekStart={weekStart} onOpen={setDetail} />
      ) : (
        <MonthGrid habits={habits} month={month} onOpen={setDetail} />
      )}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
        Clique no quadrado para marcar. Contorno azul é hoje; tracejado é dia em que o hábito não é cobrado. Clique no nome para ver o histórico.
      </p>

      {detailHabit && <HabitDrawer habit={detailHabit} onClose={() => setDetail(null)} onEdit={() => setEditing(detailHabit)} />}
      {editing && <HabitForm habit={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Cell({ state, habit, date, small }: { state: AppState; habit: Habit; date: string; small?: boolean }) {
  const d0 = today();
  const future = date > d0;
  const done = isHabitDone(state, habit, date);
  const value = habitValue(state, habit.id, date);
  const partial = !done && value > 0;
  const off = !isScheduled(habit, date);
  const onClick = () => {
    if (future) return;
    if (habit.type === "qty") {
      const input = window.prompt(`${habit.name} em ${shortDate(date)} (meta ${habit.target} ${habit.unit})`, value ? String(value).replace(".", ",") : "");
      if (input === null) return;
      const n = Number(input.replace(",", "."));
      if (Number.isFinite(n)) setHabitValue(habit.id, date, Math.max(0, n));
      return;
    }
    toggleHabit(habit, date);
  };
  return (
    <button
      className={cx("hab-cell", small && "sm", done && "done", partial && "partial", off && !done && "off", future && "future", date === d0 && "today")}
      onClick={onClick}
      disabled={future}
      aria-label={`${habit.name}, ${shortDate(date)}: ${done ? "feito" : "não feito"}`}
      title={habit.type === "qty" ? `${String(value).replace(".", ",")} / ${habit.target} ${habit.unit}` : shortDate(date)}
    >
      {!small && habit.type === "qty" && value > 0 && !done ? String(value).replace(".", ",") : done && !small ? "✓" : ""}
    </button>
  );
}

function WeekGrid({ habits, weekStart, onOpen }: { habits: Habit[]; weekStart: string; onOpen: (id: string) => void }) {
  const state = useApp();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const cols = "minmax(160px, 1fr) repeat(7, 36px) 90px 56px";
  return (
    <div className="table-wrap">
      <div className="hab-grid" style={{ gridTemplateColumns: cols, minWidth: 560 }}>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Hábito
        </span>
        {days.map((d) => (
          <span key={d} className={cx("muted", d === today() && "text-2")} style={{ fontSize: 12, textAlign: "center", fontWeight: d === today() ? 600 : 400 }}>
            {WEEKDAYS_SHORT[weekday(d)]}
            <br />
            {fromISO(d).getDate()}
          </span>
        ))}
        <span className="muted" style={{ fontSize: 12.5 }}>
          Sequência
        </span>
        <span className="muted" style={{ fontSize: 12.5, textAlign: "right" }}>
          Mês
        </span>
        {habits.map((h) => {
          const streak = currentStreak(state, h);
          return (
            <div key={h.id} style={{ display: "contents" }}>
              <button className="link-btn" style={{ color: "var(--text)", fontSize: 14, textAlign: "left", flexDirection: "column", alignItems: "flex-start", gap: 0, padding: "6px 0" }} onClick={() => onOpen(h.id)}>
                <span>{h.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {freqLabel(h)}
                  {h.type === "qty" && ` · ${h.target} ${h.unit}`}
                </span>
              </button>
              {days.map((d) => (
                <Cell key={d} state={state} habit={h} date={d} />
              ))}
              <span className="num" style={{ fontSize: 13.5 }}>
                {streak.value} {streak.unit === "dia" ? (streak.value === 1 ? "dia" : "dias") : streak.value === 1 ? "sem." : "sem."}
              </span>
              <span className="num muted" style={{ textAlign: "right" }}>
                {monthRate(state, h)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ habits, month, onOpen }: { habits: Habit[]; month: string; onOpen: (id: string) => void }) {
  const state = useApp();
  const days = monthDays(month);
  return (
    <div className="table-wrap">
      <div className="hab-grid" style={{ gridTemplateColumns: `160px repeat(${days.length}, 22px) 50px`, gap: "6px 3px", minWidth: 160 + days.length * 25 + 60 }}>
        <span />
        {days.map((d) => (
          <span key={d} className="muted num" style={{ fontSize: 10.5, textAlign: "center", fontWeight: d === today() ? 700 : 400 }}>
            {fromISO(d).getDate()}
          </span>
        ))}
        <span className="muted" style={{ fontSize: 12, textAlign: "right" }}>
          %
        </span>
        {habits.map((h) => (
          <div key={h.id} style={{ display: "contents" }}>
            <button className="link-btn ellipsis" style={{ color: "var(--text)", fontSize: 13.5, textAlign: "left" }} onClick={() => onOpen(h.id)}>
              {h.name}
            </button>
            {days.map((d) => (
              <Cell key={d} state={state} habit={h} date={d} small />
            ))}
            <span className="num muted" style={{ textAlign: "right", fontSize: 13 }}>
              {monthRate(state, h, month)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HabitDrawer({ habit, onClose, onEdit }: { habit: Habit; onClose: () => void; onEdit: () => void }) {
  const state = useApp();
  const [month, setMonth] = useState(monthKey(today()));
  useEscape(onClose);
  const days = monthDays(month);
  const lead = (weekday(days[0]) + 6) % 7;
  const streak = currentStreak(state, habit);
  const routines = state.routines.filter((r) => r.steps.some((s) => s.habitId === habit.id));

  const del = async () => {
    const ok = await ui.confirm({ title: "Excluir hábito?", message: `"${habit.name}" e todo o histórico serão apagados. Para guardar o histórico, arquive.`, confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    onClose();
    deleteHabit(habit.id);
    ui.toast("Hábito excluído");
  };

  return (
    <>
      <div className="drawer-overlay" onMouseDown={onClose} />
      <aside className="drawer" role="dialog" aria-label={habit.name}>
        <div className="drawer-top">
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
          <span className="grow" />
          <button className="btn ghost sm" onClick={onEdit}>
            <Pencil size={14} /> Editar
          </button>
          <button
            className="btn ghost sm"
            onClick={() => {
              patch("habits", habit.id, { archived: !habit.archived });
              ui.toast(habit.archived ? "Hábito reativado" : "Hábito arquivado");
              onClose();
            }}
          >
            <Archive size={14} /> {habit.archived ? "Reativar" : "Arquivar"}
          </button>
          <button className="icon-btn" onClick={del} aria-label="Excluir hábito">
            <Trash2 size={16} />
          </button>
        </div>
        <h2 className="page-title" style={{ fontSize: 26 }}>
          {habit.name}
        </h2>
        <div className="muted" style={{ marginBottom: 18 }}>
          {freqLabel(habit)}
          {habit.type === "qty" ? ` · meta ${habit.target} ${habit.unit}` : ""}
          {routines.length > 0 && ` · na rotina ${routines.map((r) => r.name).join(", ")}`}
        </div>
        <div className="kpis" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
          <div className="kpi">
            <div className="k">Sequência atual</div>
            <div className="v">
              {streak.value} {streak.unit === "dia" ? "dias" : "semanas"}
            </div>
          </div>
          <div className="kpi">
            <div className="k">Melhor sequência</div>
            <div className="v">{bestStreak(state, habit)} dias</div>
          </div>
          <div className="kpi">
            <div className="k">Este mês</div>
            <div className="v">{monthRate(state, habit)}%</div>
          </div>
        </div>
        <div className="cal-head">
          <button className="icon-btn" onClick={() => setMonth(shiftMonthKey(month, -1))} aria-label="Mês anterior">
            <ChevronLeft size={16} />
          </button>
          <strong style={{ minWidth: 130, textAlign: "center" }}>{monthLabel(month)}</strong>
          <button className="icon-btn" onClick={() => setMonth(shiftMonthKey(month, 1))} aria-label="Próximo mês">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="heat">
          {["S", "T", "Q", "Q", "S", "S", "D"].map((l, i) => (
            <i key={i} className="blank">
              {l}
            </i>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <i key={`b${i}`} className="blank" />
          ))}
          {days.map((d) => {
            const done = isHabitDone(state, habit, d);
            const partial = !done && habitValue(state, habit.id, d) > 0;
            return (
              <i key={d} className={cx(done && "done", partial && "partial")} title={shortDate(d)}>
                {fromISO(d).getDate()}
              </i>
            );
          })}
        </div>
      </aside>
    </>
  );
}

function HabitForm({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const state = useApp();
  const [name, setName] = useState(habit?.name || "");
  const [type, setType] = useState<Habit["type"]>(habit?.type || "bool");
  const [target, setTarget] = useState(String(habit?.target ?? 1).replace(".", ","));
  const [unit, setUnit] = useState(habit?.unit || "");
  const [freqKind, setFreqKind] = useState<HabitFreq["kind"]>(habit?.freq.kind || "daily");
  const [times, setTimes] = useState(habit?.freq.kind === "weekly" ? habit.freq.times : 3);
  const [days, setDays] = useState<number[]>(habit?.freq.kind === "days" ? habit.freq.days : [1, 2, 3, 4, 5]);
  const [routineStep, setRoutineStep] = useState("");

  const save = () => {
    if (!name.trim()) return;
    const freq: HabitFreq = freqKind === "daily" ? { kind: "daily" } : freqKind === "weekly" ? { kind: "weekly", times } : { kind: "days", days };
    const t = Number(target.replace(",", "."));
    const data = { name: name.trim(), type, target: type === "qty" && t > 0 ? t : 1, unit: type === "qty" ? unit : "", freq };
    let id = habit?.id;
    if (habit) {
      patch("habits", habit.id, data);
      ui.toast("Hábito atualizado");
    } else {
      id = uid();
      insert("habits", { id, archived: false, createdAt: Date.now(), ...data });
      ui.toast("Hábito criado");
    }
    if (routineStep && id) {
      const [routineId, mode] = routineStep.split(":");
      const r = state.routines.find((x) => x.id === routineId);
      if (r && mode === "new") patch("routines", r.id, { steps: [...r.steps, { id: uid(), title: data.name, minutes: 15, habitId: id }] });
    }
    onClose();
  };

  return (
    <Modal
      title={habit ? "Editar hábito" : "Novo hábito"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={!name.trim()}>
            {habit ? "Salvar" : "Criar hábito"}
          </button>
        </>
      }
    >
      <label className="field">
        Nome
        <input id="habit-name" className="input" autoFocus value={name} placeholder="Ex.: Leitura 20 min" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      </label>
      <div className="field">
        Tipo
        <div className="row wrap">
          <button className={cx("chip-toggle", type === "bool" && "on")} onClick={() => setType("bool")}>
            Sim / não
          </button>
          <button className={cx("chip-toggle", type === "qty" && "on")} onClick={() => setType("qty")}>
            Quantidade
          </button>
        </div>
      </div>
      {type === "qty" && (
        <div className="grid-2">
          <label className="field">
            Meta por dia
            <input id="habit-target" className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="field">
            Unidade
            <input id="habit-unit" className="input" value={unit} placeholder="L, páginas, min…" onChange={(e) => setUnit(e.target.value)} />
          </label>
        </div>
      )}
      <div className="field">
        Frequência
        <div className="row wrap">
          <button className={cx("chip-toggle", freqKind === "daily" && "on")} onClick={() => setFreqKind("daily")}>
            Todo dia
          </button>
          <button className={cx("chip-toggle", freqKind === "weekly" && "on")} onClick={() => setFreqKind("weekly")}>
            Vezes por semana
          </button>
          <button className={cx("chip-toggle", freqKind === "days" && "on")} onClick={() => setFreqKind("days")}>
            Dias específicos
          </button>
        </div>
      </div>
      {freqKind === "weekly" && (
        <label className="field">
          Quantas vezes por semana
          <input id="habit-times" className="input" type="number" min={1} max={7} value={times} onChange={(e) => setTimes(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} style={{ width: 100 }} />
        </label>
      )}
      {freqKind === "days" && (
        <div className="row wrap">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button
              key={d}
              className={cx("chip-toggle", days.includes(d) && "on")}
              style={{ width: 40, justifyContent: "center", padding: 0 }}
              aria-label={WEEKDAYS_SHORT[d]}
              onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
            >
              {WEEKDAYS_LETTER[d]}
            </button>
          ))}
        </div>
      )}
      {!habit && state.routines.length > 0 && (
        <label className="field">
          Adicionar como passo de uma rotina (opcional)
          <select id="habit-routine" className="select" value={routineStep} onChange={(e) => setRoutineStep(e.target.value)}>
            <option value="">Não adicionar</option>
            {state.routines.map((r) => (
              <option key={r.id} value={`${r.id}:new`}>
                {r.name} ({r.start})
              </option>
            ))}
          </select>
        </label>
      )}
    </Modal>
  );
}
