/*
 * Lâmpada de lava do Pomodoro (shader WebGL).
 * - A base de lava branca sobe conforme o tempo passa.
 * - Bolhas aquecem na base, sobem devagar, esfriam e descem, fundindo-se entre si (metaballs).
 * - O mouse vira uma bolha que se funde com a lava, empurra as outras e deixa rastro;
 *   quanto mais rápido ele se move, mais agitada a lava fica.
 * - A cor segue o som escolhido (preto→branco no silêncio, azul na chuva, fogo na lareira…),
 *   com transição suave entre as paletas.
 * Sem WebGL, usa o líquido em canvas 2D.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { prefersReducedMotion } from "../lib/motion";
import { LiquidCanvas } from "./LiquidCanvas";

const MAX = 24; // bolhas enviadas ao shader (lava + mouse + rastro)

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

type Vec3 = [number, number, number];
interface Palette {
  c1: Vec3; // fundo da lava (base, mais escuro)
  c2: Vec3; // meio
  c3: Vec3; // topo e brilho
  mat: Vec3; // [opacidade do corpo, arco-íris, iridescência]
}

const hex = (h: string): Vec3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const pal = (a: string, b: string, c: string, mat: Vec3 = [1, 0, 0]): Palette => ({ c1: hex(a), c2: hex(b), c3: hex(c), mat });

/** Paleta da lava para cada som do Pomodoro. */
export const LAVA_PALETTES: Record<string, Palette> = {
  none: pal("#141418", "#8a8a94", "#ffffff"),
  rain: pal("#061a4a", "#1f6bff", "#a9d4ff"),
  ocean: pal("#00263a", "#0096c7", "#7df9e6"),
  fire: pal("#4a0600", "#ff3d00", "#ffc23d"),
  brown: pal("#1a0d06", "#8a4f2a", "#f0c79a"),
  white: pal("#2a2a30", "#d6d9e2", "#ffffff", [0.32, 0, 0]),
  lofi: pal("#2a0a3a", "#ff4fa0", "#ffe3f3", [1, 1, 0]),
  custom: pal("#120a2a", "#7a5cff", "#e9e4ff", [0.8, 0, 1]),
};
const paletteOf = (id: string) => LAVA_PALETTES[id] || LAVA_PALETTES.none;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uScale;
uniform float uTime;
uniform float uSurface;
uniform float uEnergy;
uniform vec3 uBlobs[${MAX}];
uniform int uCount;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uMat;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float scene(vec2 p) {
  float amp = 1.0 + uEnergy * 1.8;
  float wob = sin(p.x * 0.011 + uTime * 0.7) * 7.0 + sin(p.x * 0.026 - uTime * 1.1) * 3.5;
  float d = p.y - (uSurface + wob * amp);
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uCount) break;
    vec3 b = uBlobs[i];
    if (b.z < 0.5) continue;
    d = smin(d, length(p - b.xy) - b.z, 52.0);
  }
  return d;
}

vec3 grad3(float g) {
  return g < 0.5 ? mix(uC1, uC2, g * 2.0) : mix(uC2, uC3, (g - 0.5) * 2.0);
}

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

void main() {
  vec2 p = gl_FragCoord.xy / uScale;
  vec2 uv = p / uRes;
  float d = scene(p);
  vec2 e = vec2(1.5, 0.0);
  vec2 g = vec2(scene(p + e.xy) - scene(p - e.xy), scene(p + e.yx) - scene(p - e.yx));

  // perfil arredondado: borda inclinada, centro plano -> volume de vidro líquido
  float depth = clamp(-d / 46.0, 0.0, 1.0);
  float hgt = sqrt(1.0 - (1.0 - depth) * (1.0 - depth));
  vec2 gn = g / max(length(g), 1e-4);
  vec3 n = normalize(vec3(gn * (1.0 - hgt) * 1.8, max(hgt, 0.14)));

  vec3 L = normalize(vec3(-0.45, 0.65, 0.72));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(clamp(dot(n, H), 0.0, 1.0), 80.0);
  float spec2 = pow(clamp(dot(n, normalize(vec3(0.5, -0.3, 1.0))), 0.0, 1.0), 18.0);
  float fres = pow(1.0 - n.z, 2.0);

  // degradê de baixo (escuro) para cima (claro), com um leve deslocamento pela refração
  float top = max(uSurface / uRes.y + 0.16, 0.34);
  float gy = clamp(uv.y / top + gn.y * (1.0 - hgt) * 0.08 + diff * 0.12 - 0.04, 0.0, 1.0);
  vec3 tint = grad3(gy);
  // lo-fi: arco-íris que gira devagar
  vec3 rgb = hsv(fract(uv.y * 0.55 + uv.x * 0.25 + uTime * 0.045), 0.72, 0.35 + 0.65 * gy);
  tint = mix(tint, rgb, uMat.y);
  // playlist: película iridescente, como bolha de sabão
  vec3 iri = 0.55 + 0.45 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + fres * 1.4 + uv.y * 0.5 + uTime * 0.03));
  tint = mix(tint, mix(tint, iri * (0.4 + 0.6 * gy), 0.35 + fres * 0.6), uMat.z);

  // fundo preto com um clarão da cor da lava vindo de baixo
  vec3 bg = uC2 * (0.1 * (1.0 - uv.y)) + uC3 * 0.02;
  float glow = exp(-max(d, 0.0) / 36.0) * (0.14 + uEnergy * 0.08);
  bg += mix(uC2, uC3, 0.35) * glow;

  // corpo: meio translúcido no centro, mais denso nas bordas (vidro)
  vec3 body = tint * (0.78 + 0.42 * diff);
  float opac = uMat.x * mix(0.98, 0.72, hgt);
  vec3 inner = mix(bg + tint * 0.3, body, opac);
  // aro de luz e reflexos do vidro
  vec3 rim = mix(uC3, vec3(1.0), 0.25);
  inner += rim * fres * (0.22 + 0.4 * (1.0 - uMat.x));
  inner += spec * 0.9 + spec2 * 0.07 * rim;
  inner += rim * smoothstep(0.55, 1.0, hgt) * pow(clamp(dot(n, normalize(vec3(-0.2, 0.6, 1.0))), 0.0, 1.0), 6.0) * 0.06;
  // luz vinda de baixo, como a lâmpada
  inner *= mix(1.05, 0.92, uv.y);

  float inside = 1.0 - smoothstep(-1.2, 1.2, d);
  vec3 col = mix(bg, clamp(inner, 0.0, 1.0), inside);
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Blob {
  x: number;
  y: number;
  r: number;
  base: number;
  vx: number;
  vy: number;
  heat: number;
  phase: number;
}
interface Trail {
  x: number;
  y: number;
  r: number;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
  return sh;
}

type LavaProps = { fill: number; calm: boolean; hostRef: RefObject<HTMLElement>; palette?: string };

export function LavaCanvas({ palette, ...props }: LavaProps) {
  const [fallback, setFallback] = useState(false);
  if (fallback) return <LiquidCanvas {...props} />;
  return <LavaGL {...props} palette={palette} onFail={() => setFallback(true)} />;
}

function LavaGL({ fill, calm, hostRef, palette = "none", onFail }: LavaProps & { onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fillRef = useRef(fill);
  const calmRef = useRef(calm);
  fillRef.current = fill;
  calmRef.current = calm;
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) return onFail();

    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch {
      return onFail();
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = {
      res: gl.getUniformLocation(prog, "uRes"),
      scale: gl.getUniformLocation(prog, "uScale"),
      time: gl.getUniformLocation(prog, "uTime"),
      surface: gl.getUniformLocation(prog, "uSurface"),
      energy: gl.getUniformLocation(prog, "uEnergy"),
      blobs: gl.getUniformLocation(prog, "uBlobs"),
      count: gl.getUniformLocation(prog, "uCount"),
      c1: gl.getUniformLocation(prog, "uC1"),
      c2: gl.getUniformLocation(prog, "uC2"),
      c3: gl.getUniformLocation(prog, "uC3"),
      mat: gl.getUniformLocation(prog, "uMat"),
    };
    // paleta atual, que desliza até a do som escolhido
    const pal = { ...paletteOf(paletteRef.current) };

    const reduced = prefersReducedMotion();
    let w = 1;
    let h = 1;
    let scale = 1;
    let blobs: Blob[] = [];
    const trail: Trail[] = [];
    const data = new Float32Array(MAX * 3);
    let shown = fillRef.current;
    let energy = 0;
    const mouse = { x: 0, y: 0, r: 0, active: false, last: 0, lx: 0, ly: 0, lastTrail: 0 };
    let raf = 0;
    let prev = performance.now();
    const start = prev;

    const surfaceY = () => Math.max(0.05, shown) * h;

    const makeBlobs = () => {
      const unit = Math.min(w, h) / 820;
      const count = Math.max(6, Math.min(11, Math.round(w / 120)));
      blobs = Array.from({ length: count }, (_, i) => {
        const base = (34 + Math.random() * 46) * Math.max(0.6, unit);
        return {
          x: ((i + 0.5) / count) * w + (Math.random() - 0.5) * 40,
          y: Math.random() * h * 0.85,
          r: base,
          base,
          vx: 0,
          vy: (Math.random() - 0.5) * 20,
          heat: Math.random(),
          phase: Math.random() * Math.PI * 2,
        };
      });
    };

    const resize = () => {
      const r = host.getBoundingClientRect();
      scale = Math.min(1.5, window.devicePixelRatio || 1);
      const first = blobs.length === 0;
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (first) makeBlobs();
      else blobs.forEach((b) => (b.x = Math.min(w - b.r, Math.max(b.r, b.x))));
    };

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = h - (e.clientY - r.top);
      const t = performance.now();
      if (mouse.active && t - mouse.last < 150) {
        const dt = Math.max(8, t - mouse.last);
        const speed = Math.hypot(x - mouse.lx, y - mouse.ly) / dt; // px/ms
        energy = Math.min(1, energy + speed * 0.06);
        if (t - mouse.lastTrail > 40 && mouse.r > 6) {
          mouse.lastTrail = t;
          trail.push({ x, y, r: mouse.r * 0.72 });
          if (trail.length > 7) trail.shift();
        }
      }
      mouse.x = x;
      mouse.y = y;
      mouse.lx = x;
      mouse.ly = y;
      mouse.last = t;
      mouse.active = true;
    };
    const onLeave = () => (mouse.active = false);

    const simulate = (dt: number, t: number) => {
      const running = !calmRef.current;
      const pace = (running ? 1 : 0.45) * (1 + energy * 2.2) * (reduced ? 0.2 : 1);
      const target = fillRef.current;
      shown += (target - shown) * (Math.abs(target - shown) > 0.02 ? Math.min(1, dt * 3) : 1);
      energy = Math.max(0, energy - dt * 0.35);
      const surf = surfaceY();

      // bolha do mouse: cresce enquanto ele se move, some parado
      const moving = mouse.active && t - mouse.last < 160;
      mouse.r += ((moving ? 30 : 0) - mouse.r) * Math.min(1, dt * (moving ? 10 : 3));
      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].r -= dt * 55;
        if (trail[i].r <= 1) trail.splice(i, 1);
      }

      for (const b of blobs) {
        const inPool = b.y - b.r < surf + 6;
        // aquece na base, esfria no alto
        b.heat += (inPool ? 0.32 : -0.075) * dt * pace;
        b.heat = Math.max(0, Math.min(1, b.heat));
        let ay = (b.heat - 0.5) * 70;
        let ax = Math.sin(t * 0.00035 + b.phase) * 6;
        // o mouse empurra a lava
        if (mouse.active && mouse.r > 3) {
          const dx = b.x - mouse.x;
          const dy = b.y - mouse.y;
          const dist = Math.hypot(dx, dy) || 1;
          const reach = b.r + 110;
          if (dist < reach) {
            const f = (1 - dist / reach) * 900 * (0.4 + energy);
            ax += (dx / dist) * f;
            ay += (dy / dist) * f;
          }
        }
        b.vx = (b.vx + ax * dt * pace) * Math.pow(0.35, dt);
        b.vy = (b.vy + ay * dt * pace) * Math.pow(0.5, dt);
        const vmax = 55 * pace + 40;
        b.vy = Math.max(-vmax, Math.min(vmax, b.vy));
        b.vx = Math.max(-vmax, Math.min(vmax, b.vx));
        b.x += b.vx * dt * pace;
        b.y += b.vy * dt * pace;
        // pulsa de leve
        b.r = b.base * (1 + Math.sin(t * 0.0009 + b.phase) * 0.08);
        // limites
        if (b.x < b.r) (b.x = b.r), (b.vx = Math.abs(b.vx));
        if (b.x > w - b.r) (b.x = w - b.r), (b.vx = -Math.abs(b.vx));
        if (b.y > h - b.r * 0.6) (b.y = h - b.r * 0.6), (b.vy = -Math.abs(b.vy) * 0.4), (b.heat = Math.min(b.heat, 0.3));
        if (b.y < surf - b.r * 0.6) (b.y = surf - b.r * 0.6), (b.vy = Math.abs(b.vy) * 0.2);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      simulate(dt, now);
      const goal = paletteOf(paletteRef.current);
      const kp = Math.min(1, dt * 2.4);
      for (const key of ["c1", "c2", "c3", "mat"] as const) pal[key] = pal[key].map((v, i) => v + (goal[key][i] - v) * kp) as Vec3;

      let k = 0;
      const put = (x: number, y: number, r: number) => {
        if (k >= MAX) return;
        data[k * 3] = x;
        data[k * 3 + 1] = y;
        data[k * 3 + 2] = r;
        k++;
      };
      blobs.forEach((b) => put(b.x, b.y, b.r));
      if (mouse.r > 1) put(mouse.x, mouse.y, mouse.r);
      trail.forEach((tr) => put(tr.x, tr.y, tr.r));

      gl.uniform2f(u.res, w, h);
      gl.uniform1f(u.scale, scale);
      gl.uniform1f(u.time, reduced ? 0 : (now - start) / 1000);
      gl.uniform1f(u.surface, surfaceY());
      gl.uniform1f(u.energy, energy);
      gl.uniform3fv(u.blobs, data);
      gl.uniform1i(u.count, k);
      gl.uniform3fv(u.c1, pal.c1);
      gl.uniform3fv(u.c2, pal.c2);
      gl.uniform3fv(u.c3, pal.c3);
      gl.uniform3fv(u.mat, pal.mat);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      onFail();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("webglcontextlost", onLost);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostRef]);

  return <canvas ref={canvasRef} className="liquid-canvas" aria-hidden />;
}
