import type { Block } from "./types";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const plain = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Centavos → "R$ 1.234,56" */
export function money(cents: number): string {
  return brl.format(cents / 100);
}

/** Centavos → "1.234,56" */
export function moneyPlain(cents: number): string {
  return plain.format(cents / 100);
}

/** Aceita "32,50", "1.234,56", "32.5", "R$ 12" → centavos. */
export function parseMoney(input: string): number | null {
  let s = input.replace(/r\$/i, "").replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function blocksToText(blocks: Block[]): string {
  return blocks.map((b) => b.text).join("\n");
}

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function textBlock(text = "", type: Block["type"] = "p"): Block {
  return { id: uid(), type, text };
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
