import { useMemo, useState } from "react";
import { CAPTURE_KINDS, findCategory, guessCapture, type CaptureKind } from "../lib/capture";
import { relativeDate, today } from "../lib/dates";
import { accountsUsed } from "../lib/finance";
import { appStore, createNote, createTask, createTransaction, useApp } from "../lib/store";
import type { NoteKind, Priority } from "../lib/types";
import { navigate, ui, useUI } from "../lib/ui";
import { cx, money, moneyPlain, parseMoney, textBlock } from "../lib/util";
import { Modal, MoneyInput } from "./common";

function noteKindFor(kind: CaptureKind): NoteKind {
  return kind === "video" || kind === "criativo" || kind === "nota" ? kind : "ideia";
}

export function QuickCaptureModal() {
  const { captureOpen, captureText } = useUI();
  if (!captureOpen) return null;
  return (
    <Modal title="Captura rápida" onClose={ui.closeCapture}>
      <CaptureForm initialText={captureText} onDone={ui.closeCapture} autoFocus />
    </Modal>
  );
}

/** Formulário de captura usado no modal e reaproveitável. */
export function CaptureForm({ initialText = "", onDone, autoFocus }: { initialText?: string; onDone: () => void; autoFocus?: boolean }) {
  const state = useApp();
  const [text, setText] = useState(initialText);
  const [kindOverride, setKindOverride] = useState<CaptureKind | null>(null);
  const guess = useMemo(() => guessCapture(text), [text]);
  const kind = kindOverride || guess.kind;

  const [priority, setPriority] = useState<Priority | "">("");
  const [projectId, setProjectId] = useState("");
  const [account, setAccount] = useState("");

  // campos seguem o texto até a pessoa mexer neles
  const [manual, setManual] = useState<{ date?: string; amount?: string; txKind?: "entrada" | "saida"; categoryId?: string }>({});
  const date = manual.date ?? (guess.date || (kind === "tx" ? today() : ""));
  const amount = manual.amount ?? (guess.amount !== null ? moneyPlain(guess.amount) : "");
  const txKind = manual.txKind ?? guess.txKind;
  const categoryId = manual.categoryId ?? (findCategory(state.categories, guess.categoryName)?.id || "");
  const setDate = (v: string) => setManual((m) => ({ ...m, date: v }));
  const setAmount = (v: string) => setManual((m) => ({ ...m, amount: v }));
  const setTxKind = (v: "entrada" | "saida") => setManual((m) => ({ ...m, txKind: v }));
  const setCategoryId = (v: string) => setManual((m) => ({ ...m, categoryId: v }));

  const title = guess.title || text.trim();
  const cents = parseMoney(amount);
  const canSave = kind === "tx" ? !!cents && cents > 0 : !!title;

  const save = () => {
    if (!canSave) return;
    if (kind === "task") {
      const t = createTask({ title, date: date || null, priority: priority || null, projectId: projectId || null });
      ui.toast(`Tarefa criada${t.date ? ` para ${relativeDate(t.date).toLowerCase()}` : ""}`, { label: "Abrir", run: () => ui.openTask(t.id) });
    } else if (kind === "tx") {
      const cat = state.categories.find((c) => c.id === categoryId);
      createTransaction({
        kind: txKind,
        amount: cents!,
        description: title || cat?.name || (txKind === "entrada" ? "Entrada" : "Gasto"),
        categoryId: categoryId || null,
        date: date || today(),
        account,
      });
      ui.toast(`${txKind === "entrada" ? "Entrada" : "Gasto"} de ${money(cents!)} registrado`, { label: "Ver", run: () => navigate("/financas") });
    } else {
      const n = createNote({ title, kind: noteKindFor(kind), body: [textBlock()] });
      const label = CAPTURE_KINDS.find((k) => k.kind === kind)!.label;
      ui.toast(`${label} salva em Ideias & Notas`, { label: "Abrir", run: () => navigate(`/ideias/${n.id}`) });
    }
    onDone();
  };

  const categories = state.categories.filter((c) => c.kind === txKind);

  return (
    <form
      className="stack"
      style={{ gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        id="capture-text"
        className="input"
        style={{ fontSize: 16, minHeight: 40 }}
        placeholder="Ex.: ligar para o contador amanhã · R$ 32,50 almoço · vídeo sobre rotina"
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
      />
      <div className="row wrap" role="radiogroup" aria-label="Salvar como">
        <span className="muted" style={{ fontSize: 12.5 }}>
          Salvar como
        </span>
        {CAPTURE_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            className={cx("chip-toggle", kind === k.kind && "on")}
            onClick={() => setKindOverride(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {kind === "task" && (
        <div className="grid-2">
          <label className="field">
            Data
            <input id="capture-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            Prioridade
            <select id="capture-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")}>
              <option value="">Nenhuma</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </label>
          <label className="field">
            Projeto
            <select id="capture-project" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Sem projeto</option>
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {kind === "tx" && (
        <div className="grid-2">
          <label className="field">
            Tipo
            <select id="capture-txkind" className="select" value={txKind} onChange={(e) => setTxKind(e.target.value as "entrada" | "saida")}>
              <option value="saida">Saída (gasto)</option>
              <option value="entrada">Entrada</option>
            </select>
          </label>
          <label className="field">
            Valor
            <MoneyInput id="capture-amount" value={amount} onChange={(v) => setAmount(v)} />
          </label>
          <label className="field">
            Categoria
            <select id="capture-category" className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Data
            <input id="capture-txdate" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            Conta
            <input id="capture-account" className="input" list="accounts-list" value={account} placeholder="Nubank, Débito, Pix…" onChange={(e) => setAccount(e.target.value)} />
            <datalist id="accounts-list">
              {accountsUsed(state).map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
        </div>
      )}

      {(kind === "ideia" || kind === "video" || kind === "criativo" || kind === "nota") && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Vai para Ideias &amp; Notas{kind === "video" ? " como ideia de vídeo. De lá, um clique vira card no pipeline." : kind === "criativo" ? " como ideia de criativo. De lá, um clique vira card em Criativos." : "."}
        </p>
      )}

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Enter salva · Esc fecha
        </span>
        <button type="submit" className="btn primary" disabled={!canSave}>
          Salvar {CAPTURE_KINDS.find((k) => k.kind === kind)!.label.toLowerCase()}
        </button>
      </div>
    </form>
  );
}

/** Salva direto com o destino sugerido (usado na barra do Hoje). */
export function saveGuess(text: string): boolean {
  const g = guessCapture(text);
  const title = g.title || text.trim();
  if (g.kind === "tx") {
    if (!g.amount) return false;
    const state = appStore.get();
    const cat = findCategory(state.categories, g.categoryName);
    createTransaction({ kind: g.txKind, amount: g.amount, description: title || cat?.name || "Gasto", categoryId: cat?.id || null, date: g.date || today() });
    ui.toast(`${g.txKind === "entrada" ? "Entrada" : "Gasto"} de ${money(g.amount)} registrado`, { label: "Ver", run: () => navigate("/financas") });
    return true;
  }
  if (!title) return false;
  if (g.kind === "task") {
    const t = createTask({ title, date: g.date });
    ui.toast(`Tarefa criada${t.date ? ` para ${relativeDate(t.date).toLowerCase()}` : ""}`, { label: "Abrir", run: () => ui.openTask(t.id) });
    return true;
  }
  const n = createNote({ title, kind: noteKindFor(g.kind) });
  const label = CAPTURE_KINDS.find((k) => k.kind === g.kind)!.label;
  ui.toast(`${label} salva em Ideias & Notas`, { label: "Abrir", run: () => navigate(`/ideias/${n.id}`) });
  return true;
}
