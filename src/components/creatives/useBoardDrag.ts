/*
 * Arrastar cartões do quadro com eventos de ponteiro.
 * - Só vira arraste depois de o ponteiro andar alguns pixels (ou segurar no toque).
 * - Um arraste nunca dispara o clique que abre o cartão.
 * - A cópia do cartão acompanha o ponteiro "erguida" e pousa no lugar ao soltar.
 */
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../../lib/motion";

export interface DragState {
  id: string | null;
  overCol: string | null;
  before: string | null;
}

const IDLE: DragState = { id: null, overCol: null, before: null };
const MOUSE_SLOP = 6;
const TOUCH_HOLD_MS = 260;
const TOUCH_SLOP = 8;
const EDGE = 64;

interface Session {
  id: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  source: HTMLElement;
  started: boolean;
  holdTimer: number | undefined;
  float: HTMLDivElement | null;
  raf: number;
}

/** Impede o clique que o navegador dispara logo após soltar o arraste. */
function swallowNextClick() {
  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 400);
}

type DropFn = (id: string, columnId: string, beforeId: string | null) => void;

export function useBoardDrag(onDrop: DropFn) {
  const [drag, setDragState] = useState<DragState>(IDLE);
  const boardRef = useRef<HTMLDivElement>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  // o controlador é criado uma vez: os ouvintes do window continuam os mesmos
  const [ctl] = useState(() => createController(setDragState, boardRef, onDropRef));
  useEffect(() => () => ctl.dispose(), [ctl]);
  return { drag, press: ctl.press, boardRef };
}

function createController(
  setDragState: (d: DragState) => void,
  boardRef: React.RefObject<HTMLDivElement>,
  onDropRef: React.MutableRefObject<DropFn>,
) {
  const dragRef = { current: IDLE as DragState };
  const session = { current: null as Session | null };

  const setDrag = (next: DragState) => {
    const cur = dragRef.current;
    if (cur.id === next.id && cur.overCol === next.overCol && cur.before === next.before) return;
    dragRef.current = next;
    setDragState(next);
  };

  /* onde o cartão cairia com o ponteiro em (x, y) */
  const hitTest = (x: number, y: number, id: string) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const col = el?.closest<HTMLElement>("[data-col]");
    if (!col) return { overCol: dragRef.current.overCol, before: dragRef.current.before };
    const cards = Array.from(col.querySelectorAll<HTMLElement>(".tcard[data-flip]")).filter((c) => c.dataset.flip !== id);
    let before: string | null = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        before = c.dataset.flip!;
        break;
      }
    }
    return { overCol: col.dataset.col!, before };
  };

  const moveFloat = (s: Session) => {
    if (s.float) s.float.style.transform = `translate3d(${s.x - s.offsetX}px, ${s.y - s.offsetY}px, 0)`;
  };

  /* rolagem automática perto das bordas */
  const autoScroll = (s: Session) => {
    const board = boardRef.current;
    if (board) {
      const r = board.getBoundingClientRect();
      if (s.x < r.left + EDGE) board.scrollLeft -= Math.ceil((r.left + EDGE - s.x) / 4);
      else if (s.x > r.right - EDGE) board.scrollLeft += Math.ceil((s.x - (r.right - EDGE)) / 4);
    }
    const list = (document.elementFromPoint(s.x, s.y) as HTMLElement | null)?.closest<HTMLElement>(".tcol")?.querySelector<HTMLElement>(".tcol-cards");
    if (list) {
      const r = list.getBoundingClientRect();
      if (s.y < r.top + EDGE / 2) list.scrollTop -= Math.ceil((r.top + EDGE / 2 - s.y) / 3);
      else if (s.y > r.bottom - EDGE / 2) list.scrollTop += Math.ceil((s.y - (r.bottom - EDGE / 2)) / 3);
    }
  };

  const tick = () => {
    const s = session.current;
    if (!s || !s.started) return;
    autoScroll(s);
    const hit = hitTest(s.x, s.y, s.id);
    setDrag({ id: s.id, overCol: hit.overCol, before: hit.before });
    s.raf = requestAnimationFrame(tick);
  };

  const begin = (s: Session) => {
    s.started = true;
    const rect = s.source.getBoundingClientRect();
    s.offsetX = s.startX - rect.left;
    s.offsetY = s.startY - rect.top;
    const float = document.createElement("div");
    float.className = "drag-float";
    float.style.width = `${rect.width}px`;
    const ghost = s.source.cloneNode(true) as HTMLElement;
    ghost.classList.add("drag-ghost");
    ghost.classList.remove("dragging");
    ghost.removeAttribute("data-flip");
    float.appendChild(ghost);
    document.body.appendChild(float);
    s.float = float;
    moveFloat(s);
    document.body.classList.add("is-dragging");
    window.getSelection()?.removeAllRanges();
    navigator.vibrate?.(8);
    const hit = hitTest(s.x, s.y, s.id);
    setDrag({ id: s.id, overCol: hit.overCol, before: hit.before });
    s.raf = requestAnimationFrame(tick);
  };

  const cleanup = () => {
    const s = session.current;
    if (!s) return;
    window.clearTimeout(s.holdTimer);
    cancelAnimationFrame(s.raf);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("touchmove", blockScroll);
    document.body.classList.remove("is-dragging");
    session.current = null;
  };

  /* a cópia pousa no destino e some */
  const settle = (float: HTMLDivElement | null, target: () => HTMLElement | null) => {
    if (!float) return;
    let landing: HTMLElement | null = null;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      float.remove();
      if (landing) landing.style.opacity = "";
    };
    if (prefersReducedMotion()) return done();
    // garantia: nunca deixa a cópia na tela se a animação atrasar
    window.setTimeout(done, 500);
    requestAnimationFrame(() => {
      if (finished) return;
      landing = target();
      // o cartão real aparece quando a cópia termina de pousar
      if (landing) landing.style.opacity = "0";
      const to = landing?.getBoundingClientRect() ?? null;
      const ghost = float.firstElementChild as HTMLElement | null;
      if (!to) {
        float.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).onfinish = done;
        return;
      }
      const from = float.getBoundingClientRect();
      float.style.transform = `translate3d(${to.left}px, ${to.top}px, 0)`;
      float.animate(
        [{ transform: `translate3d(${from.left}px, ${from.top}px, 0)` }, { transform: `translate3d(${to.left}px, ${to.top}px, 0)` }],
        { duration: 260, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
      ).onfinish = done;
      ghost?.animate([{ transform: "rotate(2.5deg) scale(1.03)" }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" });
    });
  };

  const onMove = (e: PointerEvent) => {
    const s = session.current;
    if (!s || e.pointerId !== s.pointerId) return;
    s.x = e.clientX;
    s.y = e.clientY;
    const dist = Math.hypot(s.x - s.startX, s.y - s.startY);
    if (!s.started) {
      if (s.pointerType === "mouse" || s.pointerType === "pen") {
        if (dist > MOUSE_SLOP) begin(s);
      } else if (dist > TOUCH_SLOP) {
        // mexeu antes de segurar: é rolagem, não arraste
        cleanup();
      }
      return;
    }
    moveFloat(s);
  };

  const finish = (drop: boolean) => {
    const s = session.current;
    if (!s) return;
    const wasStarted = s.started;
    const { id, overCol, before } = dragRef.current;
    const float = s.float;
    const source = s.source;
    cleanup();
    setDrag(IDLE);
    if (!wasStarted) return;
    swallowNextClick();
    if (drop && id && overCol) {
      onDropRef.current(id, overCol, before);
      settle(float, () => document.querySelector<HTMLElement>(`.tcard[data-flip="${CSS.escape(id)}"]`));
    } else {
      settle(float, () => (source.isConnected ? source : null));
    }
  };

  const onUp = (e: PointerEvent) => {
    if (session.current && e.pointerId === session.current.pointerId) finish(true);
  };
  const onCancel = () => finish(false);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  };
  const blockScroll = (e: TouchEvent) => {
    if (session.current?.started) e.preventDefault();
  };

  /** Chame no onPointerDown do cartão. */
  const press = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0 || session.current) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    const s: Session = {
      id,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      offsetX: 0,
      offsetY: 0,
      source: e.currentTarget,
      started: false,
      holdTimer: undefined,
      float: null,
      raf: 0,
    };
    session.current = s;
    if (e.pointerType === "touch") {
      s.holdTimer = window.setTimeout(() => {
        if (session.current === s && !s.started) begin(s);
      }, TOUCH_HOLD_MS);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchmove", blockScroll, { passive: false });
  };

  const dispose = () => {
    session.current?.float?.remove();
    cleanup();
  };

  return { press, dispose };
}
