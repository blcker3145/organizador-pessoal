/* Movimento no estilo iOS: arrastar com o cartão "levantado" e listas que se reorganizam suavemente. */
import { useLayoutEffect, useRef, type RefObject } from "react";

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Usa uma cópia levemente inclinada e com sombra como imagem do arraste,
 * como um cartão tirado da mesa. Chame dentro do onDragStart.
 */
export function liftDragImage(e: React.DragEvent<HTMLElement>) {
  const el = e.currentTarget;
  if (!e.dataTransfer || prefersReducedMotion()) return;
  const rect = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add("drag-ghost");
  ghost.classList.remove("dragging");
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-2000px",
    left: "-2000px",
    width: `${rect.width}px`,
    pointerEvents: "none",
  });
  // o fundo precisa ser sólido para a sombra aparecer
  const bg = getComputedStyle(el).backgroundColor;
  if (bg && bg !== "rgba(0, 0, 0, 0)") ghost.style.backgroundColor = bg;
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, Math.min(rect.width - 8, e.clientX - rect.left), Math.min(rect.height - 8, e.clientY - rect.top));
  window.setTimeout(() => ghost.remove(), 0);
}

/**
 * Anima os filhos com `data-flip="id"` quando mudam de posição (técnica FLIP)
 * e faz os novos entrarem com um leve crescimento.
 */
export function useFlip(container: RefObject<HTMLElement>, signature: string) {
  const last = useRef<Map<string, DOMRect> | null>(null);
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-flip]"));
    const next = new Map<string, DOMRect>();
    nodes.forEach((n) => next.set(n.dataset.flip!, n.getBoundingClientRect()));
    const prev = last.current;
    last.current = next;
    if (!prev || prefersReducedMotion()) return;
    nodes.forEach((n) => {
      const id = n.dataset.flip!;
      const before = prev.get(id);
      const after = next.get(id)!;
      if (!before) {
        n.animate(
          [
            { opacity: 0, transform: "scale(0.96) translateY(-4px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
        return;
      }
      const dy = before.top - after.top;
      const dx = before.left - after.left;
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return;
      n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 380,
        easing: "cubic-bezier(0.32, 0.72, 0, 1)",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
