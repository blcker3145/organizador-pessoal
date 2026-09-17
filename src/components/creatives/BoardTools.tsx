import { Check, Download, ExternalLink, FileJson, Image as ImageIcon, KeyRound, Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { LABEL_COLORS, labelStyle } from "../../lib/board";
import { deleteBoardLabel, setBoard, useApp } from "../../lib/store";
import {
  fetchTrelloBoard,
  importTrelloBoard,
  listTrelloBoards,
  readTrelloFile,
  trelloTokenUrl,
  type ImportOptions,
  type TrelloAuth,
  type TrelloBoardData,
} from "../../lib/trello";
import type { BoardLabel, LabelColor } from "../../lib/types";
import { ui } from "../../lib/ui";
import { cx, uid } from "../../lib/util";
import { Modal } from "../common";
import { pickImage, Popover, PopItem } from "./Board";

const COLOR_ORDER = Object.keys(LABEL_COLORS) as LabelColor[];

/* ---------- etiquetas ---------- */

function LabelEditor({ initial, onSave, onCancel, onDelete }: { initial: BoardLabel; onSave: (l: BoardLabel) => void; onCancel: () => void; onDelete?: () => void }) {
  const [l, setL] = useState(initial);
  return (
    <div className="lbl-editor">
      <div className="lbl-preview">
        <span className="tlabel lg" style={labelStyle(l.color)}>
          {l.name || " "}
        </span>
      </div>
      <label className="ee-label-stack">
        Nome
        <input className="input" autoFocus value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && onSave(l)} />
      </label>
      <div className="ee-label-stack">
        Cor
        <div className="lbl-colors">
          {COLOR_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              className={cx("lbl-color", l.color === c && "on")}
              style={{ background: LABEL_COLORS[c].bg }}
              title={LABEL_COLORS[c].name}
              aria-label={LABEL_COLORS[c].name}
              onClick={() => setL({ ...l, color: c })}
            >
              {l.color === c && <Check size={12} color={LABEL_COLORS[c].fg} />}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <button className="btn primary sm" onClick={() => onSave(l)}>
          Salvar
        </button>
        <button className="btn sm" onClick={onCancel}>
          Cancelar
        </button>
        <span className="grow" />
        {onDelete && (
          <button className="btn ghost danger sm" onClick={onDelete}>
            <Trash2 size={13} /> Excluir
          </button>
        )}
      </div>
    </div>
  );
}

/** Lista de etiquetas para marcar num cartão (ou só gerenciar, sem `selected`). */
export function LabelPicker({ selected, onToggle }: { selected?: string[]; onToggle?: (id: string) => void }) {
  const labels = useApp().creativeBoard.labels;
  const [editing, setEditing] = useState<BoardLabel | null>(null);
  const [query, setQuery] = useState("");

  if (editing) {
    const exists = labels.some((l) => l.id === editing.id);
    return (
      <LabelEditor
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={(l) => {
          setBoard((b) => ({ ...b, labels: exists ? b.labels.map((x) => (x.id === l.id ? l : x)) : [...b.labels, l] }));
          if (!exists && onToggle) onToggle(l.id);
          setEditing(null);
        }}
        onDelete={
          exists
            ? async () => {
                const ok = await ui.confirm({ title: `Excluir a etiqueta "${editing.name}"?`, message: "Ela sai de todos os cartões.", confirmLabel: "Excluir", danger: true });
                if (ok) {
                  deleteBoardLabel(editing.id);
                  setEditing(null);
                }
              }
            : undefined
        }
      />
    );
  }

  const shown = labels.filter((l) => l.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="lbl-picker">
      <input className="input" placeholder="Buscar etiquetas…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar etiquetas" />
      <div className="lbl-list">
        {shown.map((l) => (
          <div key={l.id} className="lbl-row">
            {onToggle && <input type="checkbox" checked={!!selected?.includes(l.id)} onChange={() => onToggle(l.id)} aria-label={`Etiqueta ${l.name}`} />}
            <button type="button" className="tlabel lg grow" style={labelStyle(l.color)} onClick={() => (onToggle ? onToggle(l.id) : setEditing(l))}>
              {l.name || " "}
            </button>
            <button type="button" className="icon-btn" aria-label={`Editar ${l.name}`} onClick={() => setEditing(l)}>
              <Pencil size={13} />
            </button>
          </div>
        ))}
        {!shown.length && <p className="pop-hint">Nenhuma etiqueta.</p>}
      </div>
      <button className="btn sm" onClick={() => setEditing({ id: uid(), name: query, color: "green" })}>
        <Plus size={14} /> Criar etiqueta
      </button>
    </div>
  );
}

/* ---------- barra do quadro ---------- */

export function BoardToolbar({ labelFilter, setLabelFilter }: { labelFilter: string[]; setLabelFilter: (ids: string[]) => void }) {
  const state = useApp();
  const board = state.creativeBoard;
  const [menu, setMenu] = useState<{ rect: DOMRect; kind: "labels" | "filter" | "background" } | null>(null);
  const [importing, setImporting] = useState(false);

  const open = (kind: "labels" | "filter" | "background") => (e: React.MouseEvent<HTMLButtonElement>) => setMenu({ rect: e.currentTarget.getBoundingClientRect(), kind });

  return (
    <div className="tboard-bar">
      <button className={cx("btn sm", labelFilter.length > 0 && "active")} onClick={open("filter")}>
        <Tag size={14} /> {labelFilter.length ? `Etiquetas (${labelFilter.length})` : "Filtrar por etiqueta"}
      </button>
      <button className="btn sm" onClick={open("labels")}>
        <Pencil size={14} /> Etiquetas
      </button>
      <button className="btn sm" onClick={open("background")}>
        <ImageIcon size={14} /> Plano de fundo
      </button>
      <span className="grow" />
      <button className="btn sm" onClick={() => setImporting(true)}>
        <Download size={14} /> Importar do Trello
      </button>

      {menu && (
        <Popover anchor={menu.rect} onClose={() => setMenu(null)} width={300}>
          {menu.kind === "labels" && (
            <>
              <div className="pop-title">Etiquetas do quadro</div>
              <LabelPicker />
            </>
          )}
          {menu.kind === "filter" && (
            <>
              <div className="pop-title">Mostrar só cartões com</div>
              <div className="lbl-list">
                {board.labels.map((l) => (
                  <label key={l.id} className="lbl-row">
                    <input
                      type="checkbox"
                      checked={labelFilter.includes(l.id)}
                      onChange={() => setLabelFilter(labelFilter.includes(l.id) ? labelFilter.filter((x) => x !== l.id) : [...labelFilter, l.id])}
                    />
                    <span className="tlabel lg grow" style={labelStyle(l.color)}>
                      {l.name || " "}
                    </span>
                  </label>
                ))}
              </div>
              {labelFilter.length > 0 && (
                <button className="btn sm" onClick={() => setLabelFilter([])}>
                  Limpar filtro
                </button>
              )}
            </>
          )}
          {menu.kind === "background" && (
            <>
              <div className="pop-title">Plano de fundo</div>
              {board.background && (
                <div className="pop-preview">
                  <img src={board.background} alt="" />
                </div>
              )}
              <PopItem
                icon={<ImageIcon size={15} />}
                onClick={async () => {
                  setMenu(null);
                  const img = await pickImage(1920);
                  if (img) setBoard((b) => ({ ...b, background: img }));
                }}
              >
                {board.background ? "Trocar imagem" : "Enviar imagem"}
              </PopItem>
              {board.background && (
                <PopItem icon={<Trash2 size={15} />} danger onClick={() => (setBoard((b) => ({ ...b, background: null })), setMenu(null))}>
                  Remover plano de fundo
                </PopItem>
              )}
            </>
          )}
        </Popover>
      )}
      {importing && <TrelloImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

/* ---------- importar do Trello ---------- */

type Step = "choose" | "connect" | "boards" | "running" | "done";

function TrelloImportDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("choose");
  const [auth, setAuth] = useState<TrelloAuth>({ key: "", token: "" });
  const [boards, setBoards] = useState<{ id: string; name: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");
  const [opts, setOpts] = useState<ImportOptions>({ firstCoverAsListCover: true, downloadImages: true, importBackground: true });

  const run = async (data: TrelloBoardData, withAuth: TrelloAuth | null) => {
    setStep("running");
    setError("");
    try {
      const s = await importTrelloBoard(data, { ...opts, downloadImages: opts.downloadImages }, withAuth, setProgress);
      const parts = [
        `${s.created} cartão(ões) novo(s)`,
        s.updated ? `${s.updated} atualizado(s)` : "",
        s.lists ? `${s.lists} lista(s) criada(s)` : "",
        s.labels ? `${s.labels} etiqueta(s) criada(s)` : "",
        s.images ? `${s.images} imagem(ns) salva(s)` : "",
      ].filter(Boolean);
      setResult(
        `Quadro "${data.name || "Trello"}" importado: ${parts.join(", ")}.` +
          (s.imagesFailed ? ` ${s.imagesFailed} imagem(ns) do Trello não puderam ser baixadas; troque a capa desses cartões se aparecer "Capa indisponível".` : ""),
      );
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao importar.");
      setStep(withAuth ? "boards" : "choose");
    }
  };

  const connect = async () => {
    if (!auth.key.trim() || !auth.token.trim()) return setError("Preencha a chave e o token.");
    setBusy(true);
    setError("");
    try {
      const list = await listTrelloBoards(auth);
      setBoards(list.filter((b) => !b.closed));
      setStep("boards");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível falar com o Trello.");
    } finally {
      setBusy(false);
    }
  };

  const chooseBoard = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const data = await fetchTrelloBoard(auth, id);
      await run(data, auth);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler o quadro.");
    } finally {
      setBusy(false);
    }
  };

  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await readTrelloFile(file);
      await run(data, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arquivo inválido.");
    }
  };

  const options = (
    <div className="imp-opts">
      <label className="lbl-row">
        <input type="checkbox" checked={opts.firstCoverAsListCover} onChange={(e) => setOpts({ ...opts, firstCoverAsListCover: e.target.checked })} />
        <span>Usar o 1º cartão com imagem de cada lista como capa fixa da lista</span>
      </label>
      <label className="lbl-row">
        <input type="checkbox" checked={opts.importBackground} onChange={(e) => setOpts({ ...opts, importBackground: e.target.checked })} />
        <span>Trazer o plano de fundo do quadro</span>
      </label>
      {step !== "choose" && (
        <label className="lbl-row">
          <input type="checkbox" checked={opts.downloadImages} onChange={(e) => setOpts({ ...opts, downloadImages: e.target.checked })} />
          <span>Salvar as imagens de capa no Organizador</span>
        </label>
      )}
    </div>
  );

  return (
    <Modal title="Importar do Trello" onClose={step === "running" ? () => undefined : onClose} width={560} className="imp-modal">
      {error && (
        <div className="ai-error" role="alert">
          {error}
        </div>
      )}

      {step === "choose" && (
        <>
          <p className="imp-lead">Traga listas, etiquetas, cartões, prazos, checklists e capas. Se importar de novo, os cartões já trazidos são atualizados.</p>
          <div className="imp-choices">
            <button className="imp-choice" onClick={() => (setStep("connect"), setError(""))}>
              <KeyRound size={20} />
              <strong>Conectar com o Trello</strong>
              <span>Escolha o quadro e traga as imagens junto. Recomendado.</span>
            </button>
            <label className="imp-choice">
              <FileJson size={20} />
              <strong>Enviar arquivo JSON</strong>
              <span>No Trello: Menu do quadro → Imprimir, exportar e compartilhar → Exportar como JSON.</span>
              <input type="file" accept="application/json,.json" hidden onChange={(e) => fromFile(e.target.files?.[0])} />
            </label>
          </div>
          {options}
        </>
      )}

      {step === "connect" && (
        <>
          <ol className="imp-steps">
            <li>
              Abra{" "}
              <a className="link" href="https://trello.com/power-ups/admin" target="_blank" rel="noreferrer">
                trello.com/power-ups/admin <ExternalLink size={11} />
              </a>
              , crie um Power-Up (qualquer nome) e copie a <b>Chave de API</b>.
            </li>
            <li>
              <label className="ee-label-stack">
                Chave de API
                <input className="input" value={auth.key} onChange={(e) => setAuth({ ...auth, key: e.target.value })} autoComplete="off" spellCheck={false} />
              </label>
            </li>
            <li>
              {auth.key.trim().length >= 20 ? (
                <a className="btn sm" href={trelloTokenUrl(auth.key)} target="_blank" rel="noreferrer">
                  Gerar token de leitura <ExternalLink size={12} />
                </a>
              ) : (
                <span className="muted">Depois de colar a chave, gere um token de leitura.</span>
              )}{" "}
              Clique em <b>Permitir</b> e copie o token.
            </li>
            <li>
              <label className="ee-label-stack">
                Token
                <input className="input" type="password" value={auth.token} onChange={(e) => setAuth({ ...auth, token: e.target.value })} autoComplete="off" spellCheck={false} />
              </label>
            </li>
          </ol>
          <p className="pop-hint">A chave e o token só são usados agora, direto entre este navegador e o Trello. Não ficam salvos. O token só permite leitura e vence em 1 dia.</p>
          <div className="row">
            <button className="btn" onClick={() => setStep("choose")}>
              Voltar
            </button>
            <span className="grow" />
            <button className="btn primary" onClick={connect} disabled={busy}>
              {busy && <Loader2 size={14} className="spin" />} Ver meus quadros
            </button>
          </div>
        </>
      )}

      {step === "boards" && (
        <>
          <p className="imp-lead">Escolha o quadro para importar:</p>
          <div className="imp-boards">
            {boards.map((b) => (
              <button key={b.id} className="imp-board" onClick={() => chooseBoard(b.id)} disabled={busy}>
                <span className="grow">{b.name}</span>
                {busy ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
              </button>
            ))}
            {!boards.length && <p className="pop-hint">Nenhum quadro aberto nessa conta.</p>}
          </div>
          {options}
        </>
      )}

      {step === "running" && (
        <div className="imp-running">
          <Loader2 size={22} className="spin" />
          <span>{progress || "Lendo o quadro…"}</span>
        </div>
      )}

      {step === "done" && (
        <>
          <div className="imp-done">
            <Check size={20} />
            <span>{result}</span>
          </div>
          <div className="row">
            <span className="grow" />
            <button className="btn primary" onClick={onClose}>
              Ver quadro
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
