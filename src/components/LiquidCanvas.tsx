/*
 * Líquido branco interativo do Pomodoro (canvas).
 * - Superfície simulada como molas: o mouse empurra a água ao cruzar a superfície.
 * - Quanto mais rápido o mouse se move, mais agitada a água fica; depois ela se acalma.
 * - Dentro do líquido, o mouse deixa um rastro de ondulações circulares.
 */
import { useEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "../lib/motion";

interface Ripple {
  x: number;
  y: number;
  born: number;
  power: number;
}
interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
  wobble: number;
}

const SPACING = 12; // px entre colunas de mola
const TENSION = 0.028;
const DAMPING = 0.028;
const SPREAD = 0.045;
const RIPPLE_LIFE = 1600; // ms
const MAX_RIPPLES = 48;

export function LiquidCanvas({ fill, calm, hostRef }: { fill: number; calm: boolean; hostRef: RefObject<HTMLElement> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fillRef = useRef(fill);
  const calmRef = useRef(calm);
  fillRef.current = fill;
  calmRef.current = calm;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = prefersReducedMotion();

    let w = 0;
    let h = 0;
    let dpr = 1;
    let heights: Float32Array = new Float32Array(0);
    let speeds: Float32Array = new Float32Array(0);
    let lDelta: Float32Array = new Float32Array(0);
    let rDelta: Float32Array = new Float32Array(0);
    let shown = fillRef.current; // nível exibido (suaviza saltos, ex.: reiniciar)
    let energy = 0; // agitação extra causada pelo mouse (0..1)
    const ripples: Ripple[] = [];
    let bubbles: Bubble[] = [];
    let last = { x: -1, y: -1, t: 0 };
    let lastRipple = 0;
    let raf = 0;
    let prevT = performance.now();

    const resize = () => {
      const r = host.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const n = Math.ceil(w / SPACING) + 3;
      const nh = new Float32Array(n);
      const ns = new Float32Array(n);
      nh.set(heights.subarray(0, Math.min(n, heights.length)));
      ns.set(speeds.subarray(0, Math.min(n, speeds.length)));
      heights = nh;
      speeds = ns;
      lDelta = new Float32Array(n);
      rDelta = new Float32Array(n);
      bubbles = Array.from({ length: Math.max(6, Math.round(w / 90)) }, () => newBubble(true));
    };

    const surfaceBase = () => h - Math.max(0.012, shown) * h;
    const newBubble = (anywhere = false): Bubble => ({
      x: Math.random() * w,
      y: anywhere ? surfaceBase() + Math.random() * (h - surfaceBase()) : h + 10,
      r: 2 + Math.random() * 5,
      speed: 12 + Math.random() * 30,
      wobble: Math.random() * Math.PI * 2,
    });

    const ambient = (x: number, t: number) => {
      const amp = (calmRef.current ? 2.2 : 4) + energy * 9;
      const s = t / 1000;
      return (
        Math.sin(x * 0.011 + s * 1.1) * amp +
        Math.sin(x * 0.023 - s * 1.7) * amp * 0.45 +
        Math.sin(x * 0.005 + s * 0.6) * amp * 0.8
      );
    };

    const surfaceAt = (x: number, t: number) => {
      const p = Math.max(0, Math.min(heights.length - 1.001, x / SPACING));
      const i = Math.floor(p);
      const k = p - i;
      const hv = heights[i] * (1 - k) + heights[i + 1] * k;
      return surfaceBase() + hv + (reduced ? 0 : ambient(x, t));
    };

    /* ---------- mouse ---------- */
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const t = performance.now();
      if (last.t && t - last.t < 120) {
        const dt = Math.max(8, t - last.t);
        const vx = ((x - last.x) / dt) * 16;
        const vy = ((y - last.y) / dt) * 16;
        const speed = Math.hypot(vx, vy);
        const surf = surfaceAt(x, t);
        const inside = y > surf - 4;
        // perto ou dentro da água: agita
        if (y > surf - 60) energy = Math.min(1, energy + speed * 0.0018);
        // cruzou a superfície: empurra as molas ao redor
        const crossed = (last.y - surfaceAt(last.x, t)) * (y - surf) <= 0;
        if (crossed || Math.abs(y - surf) < 18) {
          const i = Math.round(x / SPACING);
          const push = Math.max(-11, Math.min(11, vy * 0.7 + Math.sign(vy || 1) * Math.abs(vx) * 0.12));
          for (let k = -3; k <= 3; k++) {
            const j = i + k;
            if (j >= 0 && j < speeds.length) speeds[j] += push * Math.exp(-(k * k) / 4);
          }
        }
        // rastro dentro do líquido
        if (inside && speed > 0.6 && t - lastRipple > 45) {
          lastRipple = t;
          ripples.push({ x, y, born: t, power: Math.min(1, 0.35 + speed / 18) });
          if (ripples.length > MAX_RIPPLES) ripples.shift();
        }
      }
      last = { x, y, t };
    };
    const onLeave = () => (last = { x: -1, y: -1, t: 0 });

    /* ---------- desenho ---------- */
    const step = (t: number) => {
      const dt = Math.min(48, t - prevT);
      prevT = t;
      const f = Math.min(1.5, dt / 16.67);

      // nível sobe continuamente; saltos grandes (reiniciar) são suavizados
      const target = fillRef.current;
      shown += (target - shown) * (Math.abs(target - shown) > 0.02 ? 0.08 * f : 1);
      energy = Math.max(0, energy - 0.006 * f);

      // física das molas
      const n = heights.length;
      for (let i = 0; i < n; i++) {
        speeds[i] += (-TENSION * heights[i] - DAMPING * speeds[i]) * f;
        heights[i] = Math.max(-34, Math.min(34, heights[i] + speeds[i] * f));
      }
      // propagação estável: diferenças calculadas antes de aplicar
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < n; i++) {
          const l = i > 0 ? SPREAD * (heights[i] - heights[i - 1]) : 0;
          const r = i < n - 1 ? SPREAD * (heights[i] - heights[i + 1]) : 0;
          lDelta[i] = l;
          rDelta[i] = r;
        }
        for (let i = 0; i < n; i++) {
          if (i > 0) speeds[i - 1] += lDelta[i];
          if (i < n - 1) speeds[i + 1] += rDelta[i];
        }
      }
      // suavização leve: tira o serrilhado entre colunas
      for (let i = 1; i < n - 1; i++) heights[i] = heights[i] * 0.8 + (heights[i - 1] + heights[i + 1]) * 0.1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const base = surfaceBase();

      // camada de trás (mais transparente, defasada)
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 4; x += 4) {
        const y = base - 6 + (reduced ? 0 : ambient(x + 140, t * 0.8) * 0.9) + heights[Math.min(n - 1, Math.round(x / SPACING))] * 0.5;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fill();

      // corpo do líquido
      const path = new Path2D();
      path.moveTo(0, h);
      let first = true;
      for (let x = 0; x <= w + 4; x += 4) {
        const y = surfaceAt(x, t);
        if (first) {
          path.lineTo(0, y);
          first = false;
        }
        path.lineTo(x, y);
      }
      path.lineTo(w, h);
      path.closePath();

      const grad = ctx.createLinearGradient(0, base - 20, 0, h);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.18, "#f7f7f9");
      grad.addColorStop(0.7, "#e3e3e9");
      grad.addColorStop(1, "#cdcdd5");
      ctx.save();
      ctx.shadowColor = "rgba(255,255,255,0.35)";
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = -6;
      ctx.fillStyle = grad;
      ctx.fill(path);
      ctx.restore();

      ctx.save();
      ctx.clip(path);

      // sombras laterais e reflexo vertical (volume)
      const side = ctx.createLinearGradient(0, 0, w, 0);
      side.addColorStop(0, "rgba(0,0,0,0.10)");
      side.addColorStop(0.12, "rgba(0,0,0,0)");
      side.addColorStop(0.88, "rgba(0,0,0,0)");
      side.addColorStop(1, "rgba(0,0,0,0.12)");
      ctx.fillStyle = side;
      ctx.fillRect(0, base - 40, w, h);
      const sheen = ctx.createLinearGradient(w * 0.12, 0, w * 0.32, 0);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.5, "rgba(255,255,255,0.75)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(w * 0.12, base - 40, w * 0.2, h);

      // ondulações do mouse
      for (let k = ripples.length - 1; k >= 0; k--) {
        const rp = ripples[k];
        const age = t - rp.born;
        if (age > RIPPLE_LIFE) {
          ripples.splice(k, 1);
          continue;
        }
        const p = age / RIPPLE_LIFE;
        const radius = 6 + p * 110 * (0.6 + rp.power * 0.6);
        const alpha = (1 - p) * (1 - p) * rp.power;
        ctx.lineWidth = 2.2 * (1 - p) + 0.6;
        ctx.strokeStyle = `rgba(0,0,0,${(0.13 * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, radius, radius * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${(0.9 * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y + 1.6, radius * 0.97, radius * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (radius > 30) {
          ctx.strokeStyle = `rgba(0,0,0,${(0.06 * alpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(rp.x, rp.y, radius * 0.55, radius * 0.34, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // bolhas subindo
      if (!calmRef.current && !reduced) {
        for (const b of bubbles) {
          b.y -= (b.speed * dt) / 1000 * (1 + energy * 2);
          b.wobble += dt / 400;
          const bx = b.x + Math.sin(b.wobble) * 4;
          if (b.y < surfaceAt(bx, t) + b.r) Object.assign(b, newBubble());
          const g = ctx.createRadialGradient(bx - b.r * 0.3, b.y - b.r * 0.3, 0, bx, b.y, b.r);
          g.addColorStop(0, "rgba(255,255,255,0.95)");
          g.addColorStop(0.7, "rgba(215,215,224,0.35)");
          g.addColorStop(1, "rgba(0,0,0,0.12)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bx, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // brilho fino na superfície
      ctx.beginPath();
      for (let x = 0; x <= w + 4; x += 4) {
        const y = surfaceAt(x, t);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      raf = requestAnimationFrame(step);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [hostRef]);

  return <canvas ref={canvasRef} className="liquid-canvas" aria-hidden />;
}
