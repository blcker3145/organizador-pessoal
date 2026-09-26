/*
 * Animações com GSAP. Regras:
 * - só posição, escala e opacidade (o navegador anima isso sem recalcular a página);
 * - curtas (0,25–0,5 s) e com desaceleração suave, no estilo da Apple;
 * - quem pede "reduzir movimento" no sistema não vê nenhuma delas.
 */
import { gsap } from "gsap";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "./motion";

gsap.defaults({ ease: "power3.out", duration: 0.45 });

// sem animação para quem pede menos movimento, ou quando a aba está escondida
// (o navegador pausa as animações em segundo plano e o conteúdo ficaria invisível)
const off = () => prefersReducedMotion() || (typeof document !== "undefined" && document.visibilityState === "hidden");

/** Troca de página: os blocos entram em sequência, de cima para baixo. */
export function revealPage(root: HTMLElement | null) {
  if (!root || off()) return;
  const page = root.querySelector<HTMLElement>(".page");
  if (!page) return;
  // cada bloco da página; quando o bloco é uma grade de cartões, entram os cartões um a um
  const blocks: HTMLElement[] = [];
  for (const child of Array.from(page.children) as HTMLElement[]) {
    const inner = child.querySelectorAll<HTMLElement>(".card, .tcol, .gallery-card");
    if (inner.length >= 2) blocks.push(...Array.from(inner).slice(0, 12));
    else blocks.push(child);
    if (blocks.length >= 18) break;
  }
  gsap.killTweensOf(blocks);
  gsap.fromTo(
    blocks,
    { y: 14, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.5, stagger: 0.035, clearProps: "transform,opacity" },
  );
}

/** Janela que abre: sobe um pouco e cresce de leve. */
export function popIn(panel: HTMLElement | null, backdrop?: HTMLElement | null) {
  if (off()) return;
  if (backdrop) gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power1.out", clearProps: "opacity" });
  if (panel) gsap.fromTo(panel, { y: 16, scale: 0.965, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.42, ease: "back.out(1.25)", clearProps: "transform,opacity" });
}

/** Janela que fecha: desce e some; chama done no fim. */
export function popOut(panel: HTMLElement | null, backdrop: HTMLElement | null, done: () => void) {
  if (off() || !panel) return done();
  gsap.to(panel, { y: 10, scale: 0.97, opacity: 0, duration: 0.2, ease: "power2.in" });
  if (backdrop) gsap.to(backdrop, { opacity: 0, duration: 0.2, ease: "power1.in" });
  gsap.delayedCall(0.2, done);
}

/**
 * Destaque que desliza até o item ativo (barra lateral e abas).
 * O container precisa ter position: relative; o destaque é o primeiro filho com [data-glide].
 */
export function useGlide(container: RefObject<HTMLElement>, activeSelector: string, key: unknown, axis: "x" | "y") {
  const first = useRef(true);
  useLayoutEffect(() => {
    const box = container.current;
    const glide = box?.querySelector<HTMLElement>(":scope > [data-glide]");
    if (!box || !glide) return;
    const place = (animate: boolean) => {
      const active = box.querySelector<HTMLElement>(activeSelector);
      if (!active) {
        gsap.to(glide, { opacity: 0, duration: 0.2 });
        return;
      }
      const vars =
        axis === "y"
          ? { y: active.offsetTop, height: active.offsetHeight, opacity: 1 }
          : { x: active.offsetLeft, width: active.offsetWidth, height: active.offsetHeight, y: active.offsetTop, opacity: 1 };
      if (!animate || off()) gsap.set(glide, vars);
      else gsap.to(glide, { ...vars, duration: 0.5, ease: "power4.out", overwrite: true });
    };
    place(!first.current);
    first.current = false;
    // se o tamanho mudar (fonte carregando, janela), reposiciona sem animar
    const ro = new ResizeObserver(() => place(false));
    ro.observe(box);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
