/* Links no texto: detectar endereços e limpar o formato de link do Markdown/Trello. */

/** Endereços http(s) e "www." no meio do texto. */
export const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}])/gi;

export const hasUrl = (text: string) => /(?:https?:\/\/|www\.)\S/i.test(text);

export function hrefOf(raw: string) {
  return /^www\./i.test(raw) ? `https://${raw}` : raw;
}

/**
 * `[rótulo](https://…"título")` vira só o endereço (ou "rótulo: endereço" quando o rótulo é diferente).
 * O Trello exporta os links colados assim.
 */
export function flattenMarkdownLinks(text: string) {
  if (!text.includes("](")) return text;
  return text.replace(/\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/g, (_, label: string, url: string) => {
    const l = label.trim();
    if (!l || l === url || hrefOf(l) === url) return url;
    return `${l}: ${url}`;
  });
}

export type TextPart = { text: string; href?: string };

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i) });
    parts.push({ text: m[0], href: hrefOf(m[0]) });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
