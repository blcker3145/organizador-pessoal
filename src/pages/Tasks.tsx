import { Plus } from "lucide-react";
import { liftDragImage } from "../lib/motion";
import { useMemo, useState } from "react";
import { Checkbox, Empty, PriorityPill, STATUS_LABEL, Tabs } from "../components/common";
import { MonthCalendar } from "../components/MonthCalendar";
import { addDays, relativeDate, today } from "../lib/dates";
import { createTask, patch, setTaskStatus, toggleTask, useApp } from "../lib/store";
import type { Task, TaskStatus } from "../lib/types";
import { ui, usePersistedView } from "../lib/ui";
import { cx } from "../lib/util";
import { QuickAddTask, TaskLine } from "./Today";

type View = "lista" | "quadro" | "calendario";

export function TasksPage() {
  const state = useApp();
  const [view, setView] = usePersistedView<View>("tasks", "lista");
  const [project, setProject] = useState("");
  const [priority, setPriority] = useState("");
  const [tag, setTag] = useState("");
  const [showDone, setShowDone] = useState(false);

  const allTags = useMemo(() => [...new Set(state.tasks.flatMap((t) => t.tags))].sort(), [state.tasks]);

  const filtered = state.tasks.filter(
    (t) =>
      (!project || (project === "__none" ? !t.projectId : t.projectId === project)) &&
      (!priority || (priority === "__none" ? !t.priority : t.priority === priority)) &&
      (!tag || t.tags.includes(tag)),
  );

  const newTask = () => {
    const t = createTask({ projectId: project && project !== "__none" ? project : null });
    ui.openTask(t.id);
  };

  return (
    <div className="page wide" style={{ maxWidth: 1200 }}>
      <div className="page-head">
        <h1 className="page-title">Tarefas</h1>
        <button className="btn primary" onClick={newTask}>
          <Plus size={15} /> Nova tarefa
        </button>
      </div>
      <Tabs
        value={view}
        onChange={setView}
        items={[
          { value: "lista", label: "Lista" },
          { value: "quadro", label: "Quadro" },
          { value: "calendario", label: "Calendário" },
        ]}
      />
      <div className="filters">
        <select id="f-project" className="select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filtrar por projeto">
          <option value="">Todos os projetos</option>
          {state.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__none">Sem projeto</option>
        </select>
        <select id="f-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filtrar por prioridade">
          <option value="">Qualquer prioridade</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
          <option value="__none">Sem prioridade</option>
        </select>
        <select id="f-tag" className="select" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filtrar por tag">
          <option value="">Todas as tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {view === "lista" && (
          <label className="row" style={{ gap: 6, fontSize: 13, cursor: "pointer" }}>
            <Checkbox checked={showDone} onChange={setShowDone} label="Mostrar concluídas" /> Mostrar concluídas
          </label>
        )}
        {(project || priority || tag) && (
          <button className="link-btn" onClick={() => (setProject(""), setPriority(""), setTag(""))}>
            Limpar filtros
          </button>
        )}
      </div>

      {view === "lista" && <ListView tasks={filtered} showDone={showDone} projectId={project && project !== "__none" ? project : null} />}
      {view === "quadro" && <BoardView tasks={filtered} />}
      {view === "calendario" && (
        <MonthCalendar
          items={filtered
            .filter((t) => t.date)
            .map((t) => ({ id: t.id, date: t.date!, label: t.title || "Sem título", done: t.status === "done", onClick: () => ui.openTask(t.id) }))}
          onDayClick={(date) => ui.openTask(createTask({ date }).id)}
          onDrop={(id, date) => patch("tasks", id, { date })}
        />
      )}
    </div>
  );
}

const PRIORITY_ORDER = { alta: 0, media: 1, baixa: 2 } as const;
const sortTasks = (a: Task, b: Task) =>
  (a.date || "9999").localeCompare(b.date || "9999") ||
  (a.priority ? PRIORITY_ORDER[a.priority] : 3) - (b.priority ? PRIORITY_ORDER[b.priority] : 3) ||
  a.createdAt - b.createdAt;

function ListView({ tasks, showDone, projectId }: { tasks: Task[]; showDone: boolean; projectId: string | null }) {
  const d0 = today();
  const week = addDays(d0, 7);
  const open = tasks.filter((t) => t.status !== "done").sort(sortTasks);
  const groups: { key: string; label: string; items: Task[]; date: string | null; red?: boolean }[] = [
    { key: "atrasadas", label: "Atrasadas", items: open.filter((t) => t.date && t.date < d0), date: null, red: true },
    { key: "hoje", label: "Hoje", items: open.filter((t) => t.date === d0), date: d0 },
    { key: "semana", label: "Próximos 7 dias", items: open.filter((t) => t.date && t.date > d0 && t.date <= week), date: addDays(d0, 1) },
    { key: "depois", label: "Mais tarde", items: open.filter((t) => t.date && t.date > week), date: null },
    { key: "sem", label: "Sem data", items: open.filter((t) => !t.date), date: null },
  ];
  const done = tasks.filter((t) => t.status === "done").sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  return (
    <div>
      {groups.map((g) =>
        g.items.length === 0 && g.key !== "hoje" && g.key !== "sem" ? null : (
          <section key={g.key} style={{ marginBottom: 8 }}>
            <div className="group-head">
              <span className={cx(g.red && "red")}>{g.label}</span>
              <span className={cx("pill", g.red && "red")}>{g.items.length}</span>
            </div>
            {g.items.map((t) => (
              <TaskLine key={t.id} task={t} showDate={g.key !== "hoje"} />
            ))}
            {(g.key === "hoje" || g.key === "sem") && (
              <QuickAddTask date={g.date} placeholder={g.key === "hoje" ? "Adicionar tarefa para hoje" : "Adicionar tarefa sem data"} extra={{ projectId }} />
            )}
          </section>
        ),
      )}
      {showDone && (
        <section>
          <div className="group-head">
            Concluídas <span className="pill green">{done.length}</span>
          </div>
          {done.length === 0 && <Empty>Nenhuma tarefa concluída.</Empty>}
          {done.slice(0, 50).map((t) => (
            <TaskLine key={t.id} task={t} showDate />
          ))}
        </section>
      )}
    </div>
  );
}

function BoardView({ tasks }: { tasks: Task[] }) {
  const state = useApp();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const d0 = today();
  const cols: TaskStatus[] = ["todo", "doing", "done"];
  const weekAgo = Date.now() - 7 * 86400000;

  return (
    <div className="board" style={{ gridAutoColumns: "minmax(260px, 1fr)" }}>
      {cols.map((status) => {
        let items = tasks.filter((t) => t.status === status).sort(sortTasks);
        if (status === "done") items = items.filter((t) => (t.completedAt || 0) >= weekAgo);
        return (
          <div
            key={status}
            className={cx("board-col", over === status && "drop")}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) setTaskStatus(id, status);
            }}
          >
            <div className="board-col-head">
              {STATUS_LABEL[status]} <span className="muted">{items.length}</span>
              {status === "done" && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· últimos 7 dias</span>}
            </div>
            {items.map((t) => {
              const project = state.projects.find((p) => p.id === t.projectId);
              return (
                <div
                  key={t.id}
                  className={cx("board-card", dragging === t.id && "dragging")}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", t.id);
                    liftDragImage(e);
                    setDragging(t.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => ui.openTask(t.id)}
                >
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <span style={{ paddingTop: 2 }}>
                      <Checkbox checked={t.status === "done"} onChange={() => toggleTask(t.id)} />
                    </span>
                    <span className={cx("c-title grow", t.status === "done" && "muted")}>{t.title || "Sem título"}</span>
                  </div>
                  <div className="row wrap" style={{ gap: 4 }}>
                    <PriorityPill p={t.priority} />
                    {project && <span className="pill">{project.name}</span>}
                    {t.date && <span className={cx("pill", t.date < d0 && t.status !== "done" && "red")}>{relativeDate(t.date)}</span>}
                  </div>
                </div>
              );
            })}
            <button
              className="link-btn"
              style={{ padding: "4px 6px" }}
              onClick={() => ui.openTask(createTask({ status, completedAt: status === "done" ? Date.now() : null }).id)}
            >
              <Plus size={14} /> Nova
            </button>
          </div>
        );
      })}
    </div>
  );
}
