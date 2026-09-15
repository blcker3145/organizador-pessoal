import {
  Calendar,
  CircleDot,
  Clapperboard,
  Flag,
  Folder,
  Lightbulb,
  Palette,
  Plus,
  Repeat,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { relativeDate, today } from "../lib/dates";
import {
  ensureProject,
  patch,
  remove,
  setTaskStatus,
  toggleFocus,
  useApp,
} from "../lib/store";
import type { Priority, Repeat as RepeatT, Task, TaskStatus } from "../lib/types";
import { navigate, ui, useUI } from "../lib/ui";
import { cx, uid } from "../lib/util";
import { BlockEditor } from "./BlockEditor";
import { AutoTextarea, Checkbox, STATUS_LABEL, TagInput, useEscape } from "./common";

export function TaskDrawer() {
  const { taskId } = useUI();
  const state = useApp();
  const task = state.tasks.find((t) => t.id === taskId);
  useEscape(ui.closeTask, !!task);
  if (!taskId || !task) return null;
  return (
    <>
      <div className="drawer-overlay" onMouseDown={ui.closeTask} />
      <aside className="drawer" role="dialog" aria-label="Tarefa">
        <TaskDetail task={task} key={task.id} />
      </aside>
    </>
  );
}

function TaskDetail({ task }: { task: Task }) {
  const state = useApp();
  const [newSub, setNewSub] = useState("");
  const set = (changes: Partial<Task>) => patch("tasks", task.id, changes);
  const inFocus = task.focusDate === today();
  const video = task.videoId ? state.videos.find((v) => v.id === task.videoId) : null;
  const creative = task.creativeId ? state.creatives.find((c) => c.id === task.creativeId) : null;
  const note = task.noteId ? state.notes.find((n) => n.id === task.noteId) : null;
  const subDone = task.subtasks.filter((s) => s.done).length;

  const del = async () => {
    const ok = await ui.confirm({ title: "Excluir tarefa?", message: task.title || "Sem título", confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    ui.closeTask();
    remove("tasks", task.id);
    ui.toast("Tarefa excluída");
  };

  const addSub = () => {
    const title = newSub.trim();
    if (!title) return;
    set({ subtasks: [...task.subtasks, { id: uid(), title, done: false }] });
    setNewSub("");
  };

  return (
    <>
      <div className="drawer-top">
        <button className="icon-btn" onClick={ui.closeTask} aria-label="Fechar">
          <X size={18} />
        </button>
        <span className="grow" />
        <button
          className={cx("btn ghost sm", inFocus && "orange")}
          onClick={() => {
            if (!toggleFocus(task.id)) ui.toast("O foco do dia aceita até 3 tarefas");
          }}
        >
          <Star size={14} fill={inFocus ? "currentColor" : "none"} /> {inFocus ? "No foco do dia" : "Adicionar ao foco"}
        </button>
        <button className="icon-btn" onClick={del} aria-label="Excluir tarefa">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        <span style={{ paddingTop: 10 }}>
          <Checkbox checked={task.status === "done"} onChange={(v) => setTaskStatus(task.id, v ? "done" : "todo")} />
        </span>
        <AutoTextarea
          className="title-input"
          style={{ fontSize: 24 }}
          value={task.title}
          placeholder="Sem título"
          aria-label="Título da tarefa"
          autoFocus={!task.title}
          onChange={(e) => set({ title: e.target.value.replace(/\n/g, "") })}
        />
      </div>

      <div className="props">
        <span className="prop-k">
          <CircleDot size={15} /> Status
        </span>
        <span className="prop-v">
          <select className="select bare" value={task.status} onChange={(e) => setTaskStatus(task.id, e.target.value as TaskStatus)} aria-label="Status">
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </span>

        <span className="prop-k">
          <Calendar size={15} /> Data
        </span>
        <span className="prop-v">
          <input className="input bare" type="date" value={task.date || ""} onChange={(e) => set({ date: e.target.value || null })} aria-label="Data" />
          {task.date && <span className={cx("muted", task.date < today() && task.status !== "done" && "red")}>{relativeDate(task.date)}</span>}
        </span>

        <span className="prop-k">
          <Flag size={15} /> Prioridade
        </span>
        <span className="prop-v">
          <select className="select bare" value={task.priority || ""} onChange={(e) => set({ priority: (e.target.value || null) as Priority | null })} aria-label="Prioridade">
            <option value="">Nenhuma</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </span>

        <span className="prop-k">
          <Folder size={15} /> Projeto
        </span>
        <span className="prop-v">
          <select
            className="select bare"
            value={task.projectId || ""}
            aria-label="Projeto"
            onChange={(e) => {
              if (e.target.value === "__new") {
                const name = window.prompt("Nome do novo projeto");
                if (name && name.trim()) set({ projectId: ensureProject(name) });
                return;
              }
              set({ projectId: e.target.value || null });
            }}
          >
            <option value="">Sem projeto</option>
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="__new">+ Novo projeto…</option>
          </select>
        </span>

        <span className="prop-k">
          <Clapperboard size={15} /> Vídeo
        </span>
        <span className="prop-v">
          <select className="select bare" value={task.videoId || ""} onChange={(e) => set({ videoId: e.target.value || null })} aria-label="Vídeo vinculado" style={{ maxWidth: 220 }}>
            <option value="">Nenhum</option>
            {state.videos
              .filter((v) => v.stage !== "publicado" || v.id === task.videoId)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title || "Sem título"}
                </option>
              ))}
          </select>
          {video && (
            <button
              className="link"
              onClick={() => {
                ui.closeTask();
                navigate(`/videos/${video.id}`);
              }}
            >
              Abrir ↗
            </button>
          )}
        </span>

        <span className="prop-k">
          <Palette size={15} /> Criativo
        </span>
        <span className="prop-v">
          <select className="select bare" value={task.creativeId || ""} onChange={(e) => set({ creativeId: e.target.value || null })} aria-label="Criativo vinculado" style={{ maxWidth: 220 }}>
            <option value="">Nenhum</option>
            {state.creatives
              .filter((c) => c.stage !== "entregue" || c.id === task.creativeId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || "Sem título"}
                </option>
              ))}
          </select>
          {creative && (
            <button
              className="link"
              onClick={() => {
                ui.closeTask();
                navigate(`/criativos/${creative.id}`);
              }}
            >
              Abrir ↗
            </button>
          )}
        </span>

        <span className="prop-k">
          <Repeat size={15} /> Repetir
        </span>
        <span className="prop-v">
          <select className="select bare" value={task.repeat} onChange={(e) => set({ repeat: e.target.value as RepeatT })} aria-label="Repetir">
            <option value="none">Não repete</option>
            <option value="daily">Todo dia</option>
            <option value="weekly">Toda semana</option>
            <option value="monthly">Todo mês</option>
          </select>
          {task.repeat !== "none" && !task.date && <span className="muted">defina uma data</span>}
        </span>

        <span className="prop-k">
          <Tag size={15} /> Tags
        </span>
        <span className="prop-v">
          <TagInput tags={task.tags} onChange={(tags) => set({ tags })} />
        </span>

        {note && (
          <>
            <span className="prop-k">
              <Lightbulb size={15} /> Origem
            </span>
            <span className="prop-v">
              <button
                className="link"
                onClick={() => {
                  ui.closeTask();
                  navigate(`/ideias/${note.id}`);
                }}
              >
                {note.title || "Sem título"} ↗
              </button>
            </span>
          </>
        )}
      </div>

      <div className="card-title" style={{ marginTop: 8 }}>
        Subtarefas {task.subtasks.length > 0 && `${subDone}/${task.subtasks.length}`}
      </div>
      <div className="stack" style={{ gap: 0, marginBottom: 20 }}>
        {task.subtasks.map((s) => (
          <div key={s.id} className={cx("step-row", s.done && "done")}>
            <Checkbox checked={s.done} onChange={(v) => set({ subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, done: v } : x)) })} />
            <input
              className="input bare s-title"
              value={s.title}
              aria-label="Subtarefa"
              onChange={(e) => set({ subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })}
            />
            <button className="icon-btn" aria-label="Remover subtarefa" onClick={() => set({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })}>
              <X size={14} />
            </button>
          </div>
        ))}
        <div className="add-row">
          <Plus size={16} />
          <input
            placeholder="Adicionar subtarefa"
            aria-label="Nova subtarefa"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSub()}
            onBlur={addSub}
          />
        </div>
      </div>

      <div className="card-title">Notas</div>
      <BlockEditor blocks={task.body} onChange={(body) => set({ body })} emptyHint="Escreva detalhes, links ou digite '/'" />
    </>
  );
}
