import {
  AlignLeft,
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  Clock,
  Image as ImageIcon,
  MoreHorizontal,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { attachmentCount, checklistProgress, dueState, dueText, labelStyle, newColumn, sortCards } from "../../lib/board";
import { imageFileToDataUrl } from "../../lib/creatives";
import { useFlip } from "../../lib/motion";
import { createCreative, deleteBoardColumn, moveCreative, patchCreative, setBoard, useApp } from "../../lib/store";
import type { BoardColumn, BoardLabel, Creative } from "../../lib/types";
import { navigate, ui } from "../../lib/ui";
import { cx } from "../../lib/util";
import { useEscape } from "../common";
import { useBoardDrag, type DragState } from "./useBoardDrag";

/* ---------- utilidades ---------- */

/** Abre o seletor de arquivos e devolve a imagem já reduzida. */
export function pickImage(maxSide = 1000): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await imageFileToDataUrl(file, maxSide, 0.82));
      } catch {
        ui.toast("Não foi possível ler essa imagem.");
        resolve(null);
      }
    };
    input.click();
  });
}

const blocksHaveText = (c: Creative) => c.briefing.some((b) => !/^h\d/.test(b.type) && b.text.trim()) || !!c.bodyText.trim();

/** Menu flutuante preso a um botão. */
export function Popover({ anchor, onClose, children, width = 280 }: { anchor: DOMRect; onClose: () => void; children: ReactNode; width?: number }) {
  useEscape(onClose);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight || 0;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.left));
    let top = anchor.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.top - h - 6);
    setPos({ left, top });
  }, [anchor, width]);
  return (
    <>
      <div className="pop-backdrop" onMouseDown={onClose} />
      <div ref={ref} className="pop" style={{ width, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }} role="menu">
        {children}
      </div>
    </>
  );
}

export function PopItem({ icon, children, onClick, danger }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" className={cx("pop-item", danger && "danger")} onClick={onClick}>
      {icon && <span className="pop-ico">{icon}</span>}
      <span className="grow">{children}</span>
    </button>
  );
}

export function LabelChip({ label }: { label: BoardLabel }) {
  return (
    <span className="tlabel" style={labelStyle(label.color)} title={label.name}>
      {label.name || " "}
    </span>
  );
}

/* ---------- cartão ---------- */

function CardBadges({ c }: { c: Creative }) {
  const due = dueState(c);
  const cl = checklistProgress(c.checklist);
  const files = attachmentCount(c);
  const text = dueText(c);
  return (
    <div className="tcard-badges">
      {text && (
        <span className={cx("tbadge", c.dueDate && `due-${due}`)} title={c.dueTime ? `Entrega às ${c.dueTime}` : undefined}>
          <Clock size={13} /> {text}
        </span>
      )}
      {blocksHaveText(c) && (
        <span className="tbadge plain" title="Tem descrição">
          <AlignLeft size={14} />
        </span>
      )}
      {files > 0 && (
        <span className="tbadge plain" title="Anexos e links">
          <Paperclip size={13} /> {files}
        </span>
      )}
      {cl.total > 0 && (
        <span className={cx("tbadge", cl.done === cl.total ? "due-done" : "plain")} title="Checklist">
          <CheckSquare size={13} /> {cl.done}/{cl.total}
        </span>
      )}
    </div>
  );
}

function Card({
  c,
  labels,
  dragging,
  dropBefore,
  onPress,
}: {
  c: Creative;
  labels: BoardLabel[];
  dragging: boolean;
  dropBefore: boolean;
  onPress: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  const [broken, setBroken] = useState(false);
  const cardLabels = c.labelIds.map((id) => labels.find((l) => l.id === id)).filter((l): l is BoardLabel => !!l);
  return (
    <>
      {dropBefore && <div className="tdrop" />}
      <div
        className={cx("tcard", dragging && "dragging", c.pinned && "pinned")}
        data-flip={c.id}
        role="button"
        tabIndex={0}
        onPointerDown={onPress}
        onDragStart={(e) => e.preventDefault()}
        onClick={() => navigate(`/criativos/${c.id}`)}
        onKeyDown={(e) => e.key === "Enter" && navigate(`/criativos/${c.id}`)}
      >
        {c.cover && !broken && <img className="tcard-cover" src={c.cover} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />}
        {c.cover && broken && (
          <div className="tcard-cover broken">
            <ImageIcon size={18} /> Capa indisponível
          </div>
        )}
        <div className="tcard-body">
          {cardLabels.length > 0 && (
            <div className="tcard-labels">
              {cardLabels.map((l) => (
                <LabelChip key={l.id} label={l} />
              ))}
            </div>
          )}
          <span className="tcard-title">{c.title || "Sem título"}</span>
          <CardBadges c={c} />
        </div>
        <button
          className={cx("tcard-pin", c.pinned && "on")}
          title={c.pinned ? "Desafixar do topo" : "Fixar no topo da lista"}
          aria-label={c.pinned ? "Desafixar do topo" : "Fixar no topo da lista"}
          onClick={(e) => {
            e.stopPropagation();
            patchCreative(c.id, { pinned: !c.pinned });
          }}
        >
          {c.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
      </div>
    </>
  );
}

/* ---------- capa da lista ---------- */

function ColumnCover({ col, onMenu }: { col: BoardColumn; onMenu: (r: DOMRect) => void }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [col.cover]);
  if (!col.cover) return null;
  return (
    <button className="tcover" onClick={(e) => onMenu(e.currentTarget.getBoundingClientRect())} title="Trocar capa da lista">
      {!broken ? <img src={col.cover} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} /> : <span className="tcover-fallback" />}
      {(col.coverTitle || broken) && <span className="tcover-title">{col.title}</span>}
    </button>
  );
}

/* ---------- lista ---------- */

function Column({
  col,
  index,
  total,
  cards,
  labels,
  drag,
  press,
}: {
  col: BoardColumn;
  index: number;
  total: number;
  cards: Creative[];
  labels: BoardLabel[];
  drag: DragState;
  press: (e: React.PointerEvent<HTMLElement>, id: string) => void;
}) {
  const state = useApp();
  const [menu, setMenu] = useState<{ rect: DOMRect; mode: "main" | "cover" } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(col.title);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLTextAreaElement>(null);

  const patchCol = (p: Partial<BoardColumn>) => setBoard((b) => ({ ...b, columns: b.columns.map((c) => (c.id === col.id ? { ...c, ...p } : c)) }));
  const moveCol = (dir: -1 | 1) =>
    setBoard((b) => {
      const cols = [...b.columns];
      const j = index + dir;
      if (j < 0 || j >= cols.length) return b;
      [cols[index], cols[j]] = [cols[j], cols[index]];
      return { ...b, columns: cols };
    });

  const addCard = () => {
    const title = draft.trim();
    if (!title) return;
    const last = cards[cards.length - 1];
    createCreative({ title, columnId: col.id, order: (last?.order || 0) + 1000, stage: col.done ? "entregue" : "ideia" });
    setDraft("");
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      addRef.current?.focus();
    });
  };

  const removeColumn = async () => {
    const others = state.creativeBoard.columns.filter((c) => c.id !== col.id);
    const ok = await ui.confirm({
      title: `Excluir a lista "${col.title}"?`,
      message: cards.length
        ? others.length
          ? `Os ${cards.length} cartões dela vão para "${others[0].title}".`
          : `Os ${cards.length} cartões dela serão excluídos.`
        : "A lista está vazia.",
      confirmLabel: "Excluir lista",
      danger: true,
    });
    if (ok) deleteBoardColumn(col.id, others[0]?.id || null);
  };

  const setCoverFromFile = async () => {
    setMenu(null);
    const img = await pickImage(1000);
    if (img) patchCol({ cover: img });
  };

  const isOver = drag.overCol === col.id;
  // cartões deslizam para abrir espaço e para a nova posição
  useFlip(listRef, `${cards.map((c) => c.id).join(",")}|${isOver ? drag.before ?? "fim" : ""}|${drag.id ?? ""}`);
  return (
    <section className={cx("tcol", isOver && drag.id && "over")} data-col={col.id}>
      <header className="tcol-head">
        {renaming ? (
          <input
            className="tcol-rename"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim()) patchCol({ title: name.trim() });
              else setName(col.title);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setName(col.title);
                setRenaming(false);
              }
            }}
            aria-label="Nome da lista"
          />
        ) : (
          <h2 className="tcol-title" onClick={() => setRenaming(true)} title="Clique para renomear">
            {col.title}
          </h2>
        )}
        <span className="tcol-count">{cards.length}</span>
        <button className="tcol-menu" aria-label={`Ações da lista ${col.title}`} onClick={(e) => setMenu({ rect: e.currentTarget.getBoundingClientRect(), mode: "main" })}>
          <MoreHorizontal size={16} />
        </button>
      </header>

      <div className="tcol-cards" ref={listRef}>
        <ColumnCover col={col} onMenu={(rect) => setMenu({ rect, mode: "cover" })} />
        {cards.map((c) => (
          <Card
            key={c.id}
            c={c}
            labels={labels}
            dragging={drag.id === c.id}
            dropBefore={!!drag.id && drag.overCol === col.id && drag.before === c.id && drag.id !== c.id}
            onPress={(e) => press(e, c.id)}
          />
        ))}
        {!!drag.id && isOver && drag.before === null && <div className="tdrop" />}

        {adding && (
          <div className="tcomposer">
            <textarea
              ref={addRef}
              className="tcomposer-input"
              placeholder="Insira um título para este cartão…"
              value={draft}
              autoFocus
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  addCard();
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setAdding(false);
                  setDraft("");
                }
              }}
            />
            <div className="row">
              <button className="btn primary sm" onClick={addCard}>
                Adicionar cartão
              </button>
              <button className="icon-btn" aria-label="Cancelar" onClick={() => (setAdding(false), setDraft(""))}>
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {!adding && (
        <button className="tcol-add" onClick={() => setAdding(true)}>
          <Plus size={16} /> Adicionar um cartão
        </button>
      )}

      {menu && (
        <Popover anchor={menu.rect} onClose={() => setMenu(null)}>
          {menu.mode === "main" ? (
            <>
              <div className="pop-title">{col.title}</div>
              <PopItem icon={<Plus size={15} />} onClick={() => (setMenu(null), setAdding(true))}>
                Adicionar cartão
              </PopItem>
              <PopItem icon={<ImageIcon size={15} />} onClick={() => setMenu({ ...menu, mode: "cover" })}>
                {col.cover ? "Capa da lista" : "Adicionar capa no topo"}
              </PopItem>
              <label className="pop-item">
                <span className="pop-ico">
                  <input type="checkbox" checked={col.done} onChange={(e) => patchCol({ done: e.target.checked })} />
                </span>
                <span className="grow">Lista de concluídos</span>
              </label>
              <div className="pop-sep" />
              <PopItem icon={<ArrowLeft size={15} />} onClick={() => (moveCol(-1), setMenu(null))}>
                {index === 0 ? <span className="muted">Mover para a esquerda</span> : "Mover para a esquerda"}
              </PopItem>
              <PopItem icon={<ArrowRight size={15} />} onClick={() => (moveCol(1), setMenu(null))}>
                {index === total - 1 ? <span className="muted">Mover para a direita</span> : "Mover para a direita"}
              </PopItem>
              <div className="pop-sep" />
              <PopItem icon={<Trash2 size={15} />} danger onClick={() => (setMenu(null), removeColumn())}>
                Excluir lista
              </PopItem>
            </>
          ) : (
            <>
              <div className="pop-title">Capa da lista</div>
              {col.cover && (
                <div className="pop-preview">
                  <img src={col.cover} alt="" />
                </div>
              )}
              <PopItem icon={<ImageIcon size={15} />} onClick={setCoverFromFile}>
                {col.cover ? "Trocar imagem" : "Enviar imagem"}
              </PopItem>
              <form
                className="pop-url"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!/^https?:\/\//.test(coverUrl.trim())) return ui.toast("Cole um link que comece com https://");
                  patchCol({ cover: coverUrl.trim() });
                  setCoverUrl("");
                }}
              >
                <input className="input" placeholder="…ou cole o link da imagem" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} aria-label="Link da imagem" />
              </form>
              {col.cover && (
                <>
                  <label className="pop-item">
                    <span className="pop-ico">
                      <input type="checkbox" checked={col.coverTitle} onChange={(e) => patchCol({ coverTitle: e.target.checked })} />
                    </span>
                    <span className="grow">Mostrar o nome sobre a capa</span>
                  </label>
                  <PopItem icon={<Trash2 size={15} />} danger onClick={() => (patchCol({ cover: null }), setMenu(null))}>
                    Remover capa
                  </PopItem>
                </>
              )}
              <p className="pop-hint">A capa fica fixa no topo da lista. Tamanho ideal: 1000 × 540 px.</p>
            </>
          )}
        </Popover>
      )}
    </section>
  );
}

/* ---------- quadro ---------- */


export function CreativeBoardView({ creatives }: { creatives: Creative[] }) {
  const state = useApp();
  const board = state.creativeBoard;
  const { drag, press, boardRef } = useBoardDrag(moveCreative);
  const [newList, setNewList] = useState<string | null>(null);

  const addList = () => {
    const title = (newList || "").trim();
    if (!title) return;
    setBoard((b) => ({ ...b, columns: [...b.columns, newColumn(title)] }));
    setNewList("");
  };

  return (
    <div ref={boardRef} className={cx("tboard", board.background && "has-bg", drag.id && "dragging")} style={board.background ? { backgroundImage: `url("${board.background}")` } : undefined}>
      {board.columns.map((col, i) => (
        <Column
          key={col.id}
          col={col}
          index={i}
          total={board.columns.length}
          cards={sortCards(creatives.filter((c) => c.columnId === col.id))}
          labels={board.labels}
          drag={drag}
          press={press}
        />
      ))}
      <div className="tcol tcol-new">
        {newList === null ? (
          <button className="tcol-add" onClick={() => setNewList("")}>
            <Plus size={16} /> Adicionar outra lista
          </button>
        ) : (
          <div className="tcomposer">
            <input
              className="input"
              autoFocus
              placeholder="Nome da lista"
              value={newList}
              onChange={(e) => setNewList(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addList();
                if (e.key === "Escape") setNewList(null);
              }}
            />
            <div className="row">
              <button className="btn primary sm" onClick={addList}>
                Adicionar lista
              </button>
              <button className="icon-btn" aria-label="Cancelar" onClick={() => setNewList(null)}>
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
