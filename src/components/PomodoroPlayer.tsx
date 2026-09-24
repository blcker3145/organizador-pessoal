/*
 * Player de música do Pomodoro (lo-fi e playlist própria).
 * Fica montado no app inteiro, então a música não para ao trocar de página:
 * na página do Pomodoro ele se encaixa sobre o espaço reservado no palco; fora dela fica oculto, tocando.
 */
import { useEffect, useRef, useState } from "react";
import { embedUrl, LOFI_STREAMS, registerEmbed } from "../lib/ambient";
import { useTimer } from "../lib/pomodoro";
import { useApp } from "../lib/store";

export const PLAYER_SLOT = "pomo-player-slot";

export function PomodoroPlayer() {
  const t = useTimer();
  const prefs = useApp().pomodoroPrefs;
  const [lofiIndex, setLofiIndex] = useState(0);
  const embed = t.mode === "focus" && t.status !== "idle" ? embedUrl(prefs.sound, prefs.musicUrl, lofiIndex) : null;
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // acompanha o espaço reservado no palco (rolagem, tela cheia, redimensionamento).
  // Só recalcula quando algo muda de lugar: medir a cada quadro travava a rolagem.
  useEffect(() => {
    if (!embed) return;
    let last = "";
    const follow = () => {
      const box = boxRef.current;
      const slot = document.querySelector<HTMLElement>(`.${PLAYER_SLOT}`);
      if (box) {
        let css = "hidden";
        if (slot) {
          const r = slot.getBoundingClientRect();
          const full = !!slot.closest(".pomo-stage.full");
          // fora da tela cheia, recorta o que passar da área de conteúdo ao rolar
          const main = full ? null : document.querySelector(".main")?.getBoundingClientRect();
          const y = r.top + 4;
          const h = r.height - 8;
          const clipTop = main ? Math.max(0, main.top - y) : 0;
          const clipBottom = main ? Math.max(0, y + h - main.bottom) : 0;
          css = `${r.left + 4}|${y}|${r.width - 8}|${h}|${full}|${clipTop}|${clipBottom}`;
        }
        if (css !== last) {
          last = css;
          if (slot) {
            const [x, y, w, h, full, ct, cb] = css.split("|");
            Object.assign(box.style, {
              left: `${x}px`,
              top: `${y}px`,
              width: `${w}px`,
              height: `${h}px`,
              opacity: "1",
              pointerEvents: Number(ct) + Number(cb) >= Number(h) ? "none" : "auto",
              zIndex: full === "true" ? "92" : "40",
              clipPath: `inset(${ct}px 0 ${cb}px 0 round 12px)`,
            });
          } else {
            Object.assign(box.style, { left: "-10000px", top: "0px", width: "320px", height: "180px", opacity: "0", pointerEvents: "none" });
          }
        }
      }
    };
    follow();
    const id = window.setInterval(follow, 300);
    const onMove = () => follow();
    window.addEventListener("scroll", onMove, { capture: true, passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("scroll", onMove, { capture: true });
      window.removeEventListener("resize", onMove);
    };
  }, [embed]);

  // volume e pausa chegam ao YouTube pela API do iframe
  useEffect(() => {
    if (!embed) return registerEmbed(null);
    const frame = frameRef.current;
    registerEmbed(frame);
    return () => registerEmbed(null);
  }, [embed]);

  // rádio lo-fi fora do ar: tenta a próxima da lista
  useEffect(() => {
    if (prefs.sound !== "lofi") return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || typeof e.data !== "string") return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "onError") setLofiIndex((i) => (i + 1 < LOFI_STREAMS.length * 2 ? i + 1 : i));
      } catch {
        /* mensagem que não é do player */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [prefs.sound]);

  if (!embed) return null;
  return (
    <div ref={boxRef} className="pomo-player-box" style={{ left: -10000, top: 0 }}>
      <iframe
        ref={frameRef}
        key={embed}
        src={embed}
        title="Música do Pomodoro"
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
