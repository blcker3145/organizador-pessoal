import { CheckSquare, Clapperboard, FileText, Lightbulb, Palette, Plus, Repeat2, CalendarCheck, Wallet, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, relativeDate, shortDate, startOfWeek, today, monthKey } from "../lib/dates";
import { creativeStageInfo } from "../lib/creatives";
import { monthSummary } from "../lib/finance";
import { isHabitDone, isScheduled } from "../lib/habits";
import { createNote, createTask, useApp } from "../lib/store";
import { navigate, ui, useUI } from "../lib/ui";
import { blocksToText, cx, money, normalize } from "../lib/util";
import { Modal, ProgressBar, stageInfo } from "./common";
import { MODULES } from "./Sidebar";

/* ---------------- Busca (Ctrl K) ---------------- */

interface PaletteItem {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const { paletteOpen } = useUI();
  if (!paletteOpen) return null;
  return <PaletteInner />;
}

function PaletteInner() {
  const state = useApp();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<PaletteItem[]>(() => {
    const nq = normalize(q.trim());
    const match = (...texts: string[]) => !nq || texts.some((t) => normalize(t).includes(nq));
    const out: PaletteItem[] = [];
    const cap = (arr: PaletteItem[], n: number) => arr.slice(0, nq ? n : Math.min(n, 3));

    out.push(
      ...MODULES.filter((m) => match(m.label))
        .slice(0, nq ? 7 : 7)
        .map((m) => ({ key: `m${m.path}`, group: "Ir para", label: m.label, icon: m.icon, run: () => navigate(m.path) })),
    );
    if (!nq) return out;

    out.push(
      ...cap(
        state.tasks
          .filter((t) => match(t.title, blocksToText(t.body), t.tags.join(" ")))
          .sort((a, b) => Number(a.status === "done") - Number(b.status === "done"))
          .map((t) => ({
            key: `t${t.id}`,
            group: "Tarefas",
            label: t.title || "Sem título",
            hint: t.status === "done" ? "Feita" : t.date ? relativeDate(t.date) : undefined,
            icon: <CheckSquare size={16} />,
            run: () => ui.openTask(t.id),
          })),
        6,
      ),
      ...cap(
        state.notes
          .filter((n) => match(n.title, blocksToText(n.body), n.tags.join(" ")))
          .map((n) => ({
            key: `n${n.id}`,
            group: "Ideias & Notas",
            label: n.title || "Sem título",
            hint: n.kind === "video" ? "Ideia de vídeo" : n.kind === "criativo" ? "Ideia de criativo" : n.kind === "nota" ? "Nota" : "Ideia",
            icon: n.kind === "nota" ? <FileText size={16} /> : <Lightbulb size={16} />,
            run: () => navigate(`/ideias/${n.id}`),
          })),
        6,
      ),
      ...cap(
        state.videos
          .filter((v) => match(v.title, blocksToText(v.script), v.caption))
          .map((v) => ({
            key: `v${v.id}`,
            group: "Vídeos",
            label: v.title || "Sem título",
            hint: stageInfo(v.stage).label,
            icon: <Clapperboard size={16} />,
            run: () => navigate(`/videos/${v.id}`),
          })),
        6,
      ),
      ...cap(
        state.creatives
          .filter((c) => match(c.title, c.client, c.format, c.headline, c.bodyText, c.cta, blocksToText(c.briefing), c.slides.map((s) => s.text).join(" ")))
          .map((c) => ({
            key: `c${c.id}`,
            group: "Criativos",
            label: c.title || "Sem título",
            hint: [creativeStageInfo(c.stage).label, c.client].filter(Boolean).join(" · "),
            icon: <Palette size={16} />,
            run: () => navigate(`/criativos/${c.id}`),
          })),
        6,
      ),
      ...cap(
        state.habits
          .filter((h) => match(h.name))
          .map((h) => ({ key: `h${h.id}`, group: "Hábitos", label: h.name, icon: <CalendarCheck size={16} />, run: () => navigate("/habitos") })),
        4,
      ),
      ...cap(
        state.routines
          .filter((r) => match(r.name, r.steps.map((s) => s.title).join(" ")))
          .map((r) => ({ key: `r${r.id}`, group: "Rotina", label: `Rotina: ${r.name}`, hint: r.start, icon: <Repeat2 size={16} />, run: () => navigate("/rotina") })),
        4,
      ),
      ...cap(
        state.transactions
          .filter((t) => match(t.description))
          .map((t) => ({
            key: `x${t.id}`,
            group: "Lançamentos",
            label: t.description,
            hint: `${t.kind === "entrada" ? "+" : "−"} ${money(t.amount)} · ${shortDate(t.date)}`,
            icon: <Wallet size={16} />,
            run: () => navigate("/financas/lancamentos"),
          })),
        4,
      ),
    );
    const title = q.trim();
    out.push(
      { key: "new-task", group: "Ações", label: `Criar tarefa "${title}"`, icon: <Plus size={16} />, run: () => ui.openTask(createTask({ title }).id) },
      {
        key: "new-idea",
        group: "Ações",
        label: `Criar ideia "${title}"`,
        icon: <Plus size={16} />,
        run: () => navigate(`/ideias/${createNote({ title }).id}`),
      },
      { key: "capture", group: "Ações", label: "Abrir captura rápida com esse texto", icon: <ArrowRight size={16} />, run: () => ui.openCapture(title) },
    );
    return out;
  }, [q, state]);

  useEffect(() => setIndex(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(".palette-item.on")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const run = (it: PaletteItem | undefined) => {
    if (!it) return;
    ui.closePalette();
    it.run();
  };

  let lastGroup = "";
  return (
    <Modal onClose={ui.closePalette} width={620}>
      <input
        id="palette-input"
        className="palette-input"
        style={{ margin: "-8px -16px 0", width: "calc(100% + 32px)" }}
        placeholder="Buscar em tudo ou digitar um comando…"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(items.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(items[index]);
          }
        }}
      />
      <div className="palette-list" ref={listRef} style={{ margin: "0 -10px -10px" }}>
        {items.length === 0 && <div className="empty">Nada encontrado.</div>}
        {items.map((it, i) => {
          const head = it.group !== lastGroup;
          lastGroup = it.group;
          return (
            <div key={it.key}>
              {head && <div className="palette-group">{it.group}</div>}
              <div className={cx("palette-item", i === index && "on")} onMouseMove={() => setIndex(i)} onClick={() => run(it)}>
                <span className="muted" style={{ display: "grid" }}>
                  {it.icon}
                </span>
                <span className="ellipsis">{it.label}</span>
                {it.hint && <span className="hint">{it.hint}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* ---------------- Confirmação ---------------- */

export function ConfirmDialog() {
  const { confirm } = useUI();
  if (!confirm) return null;
  return (
    <Modal
      title={confirm.title}
      onClose={() => confirm.resolve(false)}
      width={420}
      footer={
        <>
          <button className="btn" onClick={() => confirm.resolve(false)}>
            Cancelar
          </button>
          <button className={cx("btn", confirm.danger ? "danger" : "primary")} autoFocus onClick={() => confirm.resolve(true)}>
            {confirm.confirmLabel || "Confirmar"}
          </button>
        </>
      }
    >
      {confirm.message && <p style={{ margin: 0 }} className="text-2">{confirm.message}</p>}
    </Modal>
  );
}

/* ---------------- Avisos ---------------- */

export function Toasts() {
  const { toasts } = useUI();
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                ui.dismissToast(t.id);
                t.action!.run();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Revisão semanal ---------------- */

export function WeeklyReview() {
  const { reviewOpen } = useUI();
  const state = useApp();
  if (!reviewOpen) return null;
  const d0 = today();
  const ws = startOfWeek(d0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => d <= d0);
  const nextWeekEnd = addDays(ws, 13);
  const done = state.tasks.filter((t) => t.status === "done" && t.completedAt && t.completedAt >= new Date(ws + "T00:00").getTime()).length;
  const overdue = state.tasks.filter((t) => t.status !== "done" && t.date && t.date < d0);
  const sum = monthSummary(state, monthKey(d0));
  const upcomingVideos = state.videos.filter((v) => v.publishDate && v.publishDate >= d0 && v.publishDate <= nextWeekEnd && v.stage !== "publicado");
  const habits = state.habits.filter((h) => !h.archived);
  const upcomingCreatives = state.creatives.filter((c) => c.dueDate && c.dueDate <= nextWeekEnd && c.stage !== "entregue");

  return (
    <Modal title="Revisão semanal" onClose={ui.closeReview} width={620} footer={<button className="btn primary" onClick={ui.closeReview}>Concluir revisão</button>}>
      <p className="muted" style={{ margin: 0 }}>
        Semana de {shortDate(ws)} a {shortDate(addDays(ws, 6))}
      </p>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", margin: 0 }}>
        <div className="kpi">
          <div className="k">Tarefas feitas</div>
          <div className="v">{done}</div>
        </div>
        <div className="kpi">
          <div className="k">Atrasadas</div>
          <div className={cx("v", overdue.length > 0 && "red")}>{overdue.length}</div>
        </div>
        <div className="kpi">
          <div className="k">Orçamento usado</div>
          <div className="v">{sum.budgetUsedPct}%</div>
        </div>
      </div>
      <div>
        <div className="card-title">Hábitos na semana</div>
        {habits.map((h) => {
          const sched = days.filter((d) => isScheduled(h, d));
          const ok = sched.filter((d) => isHabitDone(state, h, d)).length;
          const expected = h.freq.kind === "weekly" ? h.freq.times : sched.length;
          const pct = expected ? (ok / expected) * 100 : 0;
          return (
            <div key={h.id} className="bud-row" style={{ gridTemplateColumns: "150px minmax(0,1fr) 60px" }}>
              <span className="ellipsis">{h.name}</span>
              <ProgressBar pct={pct} warnAt={101} />
              <span className="v">
                {ok}/{expected}
              </span>
            </div>
          );
        })}
      </div>
      {overdue.length > 0 && (
        <div>
          <div className="card-title">
            Atrasadas
          </div>
          {overdue.slice(0, 6).map((t) => (
            <div key={t.id} className="task-row" onClick={() => ui.openTask(t.id)}>
              <span className="t-title">{t.title}</span>
              <span className="pill red">{relativeDate(t.date!)}</span>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="card-title">Vídeos para as próximas duas semanas</div>
        {upcomingVideos.length === 0 && <div className="empty">Nenhum vídeo com data de publicação.</div>}
        {upcomingVideos.map((v) => (
          <div
            key={v.id}
            className="task-row"
            onClick={() => {
              ui.closeReview();
              navigate(`/videos/${v.id}`);
            }}
          >
            <span className={cx("pill", stageInfo(v.stage).color)}>{stageInfo(v.stage).label}</span>
            <span className="t-title">{v.title}</span>
            <span className="muted">{relativeDate(v.publishDate!)}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="card-title">Criativos para entregar em até duas semanas</div>
        {upcomingCreatives.length === 0 && <div className="empty">Nenhum criativo com entrega marcada.</div>}
        {upcomingCreatives.map((c) => (
          <div
            key={c.id}
            className="task-row"
            onClick={() => {
              ui.closeReview();
              navigate(`/criativos/${c.id}`);
            }}
          >
            <span className={cx("pill", creativeStageInfo(c.stage).color)}>{creativeStageInfo(c.stage).label}</span>
            <span className="t-title">{c.title}</span>
            <span className={cx("muted", c.dueDate! < d0 && "red")}>{relativeDate(c.dueDate!)}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
