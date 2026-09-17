import { Sparkles } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { blocksToMarkdown, markdownToBlocks, WRITING_ACTIONS } from "../lib/ai";
import type { Block, BlockType } from "../lib/types";
import { ui } from "../lib/ui";
import { cx, normalize, textBlock } from "../lib/util";
import { hasUrl, splitLinks } from "../lib/links";
import { applyVoiceCommands } from "../lib/speech";
import { AiPanel, type AiScope } from "./AiWriter";
import { AutoTextarea, Checkbox } from "./common";
import { DictationBar, DictationButton, useDictation } from "./Dictation";

type MenuItem =
  | { kind: "block"; type: BlockType; label: string; hint: string; keys: string }
  | { kind: "ai"; id: string; label: string; hint: string; keys: string; instruction: string };

const BLOCK_MENU: { type: BlockType; label: string; hint: string; keys: string }[] = [
  { type: "p", label: "Texto", hint: "", keys: "texto paragrafo text" },
  { type: "h1", label: "Título 1", hint: "#", keys: "titulo 1 h1 heading" },
  { type: "h2", label: "Título 2", hint: "##", keys: "titulo 2 h2 heading subtitulo" },
  { type: "h3", label: "Título 3", hint: "###", keys: "titulo 3 h3 heading" },
  { type: "bullet", label: "Lista com marcadores", hint: "-", keys: "lista marcadores bullet" },
  { type: "number", label: "Lista numerada", hint: "1.", keys: "lista numerada numero number" },
  { type: "todo", label: "Checklist", hint: "[]", keys: "checklist tarefa todo caixa" },
  { type: "quote", label: "Citação", hint: ">", keys: "citacao quote" },
  { type: "divider", label: "Divisor", hint: "---", keys: "divisor linha divider" },
];

const AI_KEYS = "ia ai chatgpt gpt gemini inteligencia artificial";
const MENU: MenuItem[] = [
  { kind: "ai", id: "ai-pedir", label: "IA: pedir algo…", hint: "IA", keys: `${AI_KEYS} pedir perguntar escrever`, instruction: "" },
  ...BLOCK_MENU.map((m) => ({ kind: "block" as const, ...m })),
  ...WRITING_ACTIONS.map((a) => ({ kind: "ai" as const, id: `ai-${a.id}`, label: `IA: ${a.label}`, hint: "", keys: `${AI_KEYS} ${a.label.toLowerCase()}`, instruction: a.instruction })),
];

const SHORTCUTS: [RegExp, BlockType][] = [
  [/^###\s$/, "h3"],
  [/^##\s$/, "h2"],
  [/^#\s$/, "h1"],
  [/^[-*]\s$/, "bullet"],
  [/^1[.)]\s$/, "number"],
  [/^\[\s?\]\s$/, "todo"],
  [/^>\s$/, "quote"],
];

const LIST_TYPES: BlockType[] = ["bullet", "number", "todo"];

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  p: "Digite '/' para comandos",
  h1: "Título 1",
  h2: "Título 2",
  h3: "Título 3",
  bullet: "Lista",
  number: "Lista",
  todo: "Item",
  quote: "Citação",
};

/**
 * Camada por cima do texto com a mesma fonte e quebra de linha: os endereços viram links.
 * Só os links recebem clique; o resto do clique passa para a caixa de texto (edição).
 */
function LinkLayer({ text }: { text: string }) {
  return (
    <span className="blk-links" aria-hidden="true">
      {splitLinks(text).map((p, i) =>
        p.href ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noreferrer noopener"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            title="Abrir link"
          >
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
      {"​"}
    </span>
  );
}

export function BlockEditor({
  blocks,
  onChange,
  emptyHint = "Clique para escrever…",
  dictation = true,
  ai = true,
  aiContext,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  emptyHint?: string;
  /** Mostra o botão de ditado por voz. */
  dictation?: boolean;
  /** Mostra a escrita com IA no menu "/" e no botão ✨. */
  ai?: boolean;
  /** O que é este texto (ex.: roteiro de vídeo curto), para a IA entender o pedido. */
  aiContext?: string;
}) {
  const refs = useRef(new Map<string, HTMLTextAreaElement | HTMLDivElement>());
  const pending = useRef<{ id: string; pos: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ id: string; filter: string; index: number; top: number } | null>(null);
  // bloco em edição: os outros mostram os links clicáveis
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [aiPanel, setAiPanel] = useState<{ key: number; anchorId: string; scopeId: string | null; scope: AiScope; instruction: string; autoRun: boolean } | null>(null);

  const list = blocks.length ? blocks : [textBlock()];

  /* ---------- Ditado por voz ---------- */
  // onde o texto falado entra: último bloco e posição do cursor
  const caret = useRef<{ id: string; pos: number } | null>(null);
  const latest = useRef({ list, onChange });
  latest.current = { list, onChange };
  const trackCaret = (id: string, el: HTMLTextAreaElement) => {
    caret.current = { id, pos: el.selectionEnd ?? el.value.length };
  };

  const insertDictated = (raw: string) => {
    const spoken = applyVoiceCommands(raw);
    if (!spoken.replace(/\n/g, "").trim() && !spoken.includes("\n")) return;
    const { list: current, onChange: emit } = latest.current;
    const next = current.slice();
    let idx = caret.current ? next.findIndex((b) => b.id === caret.current!.id && b.type !== "divider") : -1;
    let pos = idx >= 0 ? Math.min(caret.current!.pos, next[idx].text.length) : 0;
    if (idx < 0) {
      const last = next[next.length - 1];
      if (last && last.type !== "divider" && !last.text) {
        idx = next.length - 1;
      } else {
        next.push(textBlock());
        idx = next.length - 1;
      }
      pos = next[idx].text.length;
    }

    const block = next[idx];
    const before = block.text.slice(0, pos);
    const after = block.text.slice(pos);
    const parts = spoken.split("\n");
    const capitalize = (text: string, prev: string) =>
      !prev.trim() || /[.!?]\s*$/.test(prev) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
    const join = (prev: string, text: string) => {
      if (!text) return prev;
      const needsSpace = prev && !/\s$/.test(prev) && !/^[,.;:!?]/.test(text);
      return prev + (needsSpace ? " " : "") + capitalize(text, prev);
    };

    let first = join(before, parts[0].trim());
    if (parts.length === 1) {
      next[idx] = { ...block, text: first + (after && !/^\s/.test(after) && !/[\s]$/.test(first) ? " " : "") + after };
      caret.current = { id: block.id, pos: first.length };
    } else {
      next[idx] = { ...block, text: first };
      const listType = block.type === "bullet" || block.type === "number" || block.type === "todo" ? block.type : "p";
      let lastId = block.id;
      let lastPos = first.length;
      parts.slice(1).forEach((part, i) => {
        const text = capitalize(part.trim(), "");
        const isLast = i === parts.length - 2;
        const nb: Block = { ...textBlock(text + (isLast && after ? (text ? " " : "") + after.trimStart() : ""), listType), checked: listType === "todo" ? false : undefined };
        next.splice(idx + 1 + i, 0, nb);
        lastId = nb.id;
        lastPos = text.length;
      });
      caret.current = { id: lastId, pos: lastPos };
      first = "";
    }
    // mantém o cursor no ponto do ditado se o campo estava em uso
    const active = document.activeElement;
    if (active && [...refs.current.values()].includes(active as HTMLTextAreaElement)) pending.current = caret.current;
    emit(next);
  };
  const dictate = useDictation(insertDictated);

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    const el = refs.current.get(p.id);
    if (!el) return;
    pending.current = null;
    el.focus();
    if (el instanceof HTMLTextAreaElement) {
      const pos = Math.min(p.pos, el.value.length);
      el.setSelectionRange(pos, pos);
    }
  });

  const commit = (next: Block[], focus?: { id: string; pos: number }) => {
    if (focus) {
      pending.current = focus;
      caret.current = focus;
    }
    onChange(next);
  };

  const replace = (id: string, changes: Partial<Block>) => list.map((b) => (b.id === id ? { ...b, ...changes } : b));

  const menuItems = menu
    ? MENU.filter((m) => {
        if (m.kind === "ai" && !ai) return false;
        const f = normalize(menu.filter.trim());
        return !f || normalize(m.label).includes(f) || normalize(m.keys).includes(f);
      })
    : [];

  /* ---------- Escrita com IA ---------- */
  const openAi = (anchorId: string, instruction: string, textAfterSlash: string | null) => {
    setMenu(null);
    const current = latest.current.list;
    let working = current;
    if (textAfterSlash !== null) {
      working = current.map((b) => (b.id === anchorId ? { ...b, text: textAfterSlash } : b));
      onChange(working);
    }
    const idx = working.findIndex((b) => b.id === anchorId);
    const anchor = working[idx];
    // parágrafo de referência: o próprio bloco se tiver texto, senão o anterior com texto
    let scopeId: string | null = anchor && anchor.type !== "divider" && anchor.text.trim() ? anchor.id : null;
    for (let i = idx - 1; !scopeId && i >= 0; i--) if (working[i].type !== "divider" && working[i].text.trim()) scopeId = working[i].id;
    const hasText = working.some((b) => b.text.trim());
    setAiPanel({ key: Date.now(), anchorId, scopeId, scope: "all", instruction, autoRun: !!instruction && hasText });
  };

  const aiGetText = () => {
    const { list: current } = latest.current;
    if (aiPanel?.scope === "block" && aiPanel.scopeId) return current.find((b) => b.id === aiPanel.scopeId)?.text || "";
    return blocksToMarkdown(current);
  };

  const aiReplace = (md: string) => {
    const generated = markdownToBlocks(md);
    const { list: current } = latest.current;
    if (aiPanel?.scope === "block" && aiPanel.scopeId) {
      const next: Block[] = [];
      current.forEach((b) => {
        if (b.id === aiPanel.scopeId) next.push(...generated);
        else if (!(b.id === aiPanel.anchorId && b.type === "p" && !b.text)) next.push(b);
      });
      onChange(next.length ? next : generated);
    } else {
      onChange(generated);
    }
    ui.toast("Texto da IA aplicado");
  };

  const aiInsert = (md: string) => {
    const generated = markdownToBlocks(md);
    const { list: current } = latest.current;
    const idx = current.findIndex((b) => b.id === aiPanel?.anchorId);
    const next = current.slice();
    if (idx < 0) next.push(...generated);
    else if (next[idx].type === "p" && !next[idx].text) next.splice(idx, 1, ...generated);
    else next.splice(idx + 1, 0, ...generated);
    onChange(next);
    ui.toast("Texto da IA inserido");
  };

  const choose = (id: string, item: MenuItem) => {
    if (item.kind === "block") {
      applyType(id, item.type);
      return;
    }
    const current = list.find((b) => b.id === id);
    const rest = menu && menu.id === id && current?.text.startsWith("/") ? current.text.slice(1 + menu.filter.length).trim() : current?.text || "";
    openAi(id, item.instruction, rest);
  };

  const applyType = (id: string, type: BlockType) => {
    // mantém o texto que vinha depois do comando "/filtro"
    const current = list.find((b) => b.id === id);
    const rest = menu && menu.id === id && current?.text.startsWith("/") ? current.text.slice(1 + menu.filter.length) : "";
    setMenu(null);
    const idx = list.findIndex((b) => b.id === id);
    if (type === "divider") {
      const next = list.slice();
      next[idx] = { ...next[idx], type: "divider", text: "" };
      const after = textBlock();
      next.splice(idx + 1, 0, after);
      commit(next, { id: after.id, pos: 0 });
      return;
    }
    commit(replace(id, { type, text: rest, checked: type === "todo" ? false : undefined }), { id, pos: 0 });
  };

  const handleText = (block: Block, value: string, el: HTMLTextAreaElement) => {
    if (block.type !== "divider") {
      if (value === "---") {
        applyType(block.id, "divider");
        return;
      }
      for (const [re, type] of SHORTCUTS) {
        if (re.test(value) && block.type !== type) {
          commit(replace(block.id, { type, text: "", checked: type === "todo" ? false : undefined }), { id: block.id, pos: 0 });
          return;
        }
      }
    }
    if (value.startsWith("/")) {
      const wrapTop = wrap.current?.getBoundingClientRect().top ?? 0;
      const top = el.getBoundingClientRect().bottom - wrapTop + 4;
      const caret = el.selectionStart ?? value.length;
      setMenu((m) => ({ id: block.id, filter: value.slice(1, Math.max(1, caret)), index: m && m.id === block.id ? Math.min(m.index, 8) : 0, top }));
    } else if (menu && menu.id === block.id) {
      setMenu(null);
    }
    onChange(replace(block.id, { text: value }));
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, block: Block, idx: number) => {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (menu && menu.id === block.id) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = menuItems.length || 1;
        setMenu({ ...menu, index: (menu.index + (e.key === "ArrowDown" ? 1 : -1) + n) % n });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = menuItems[menu.index];
        if (item) choose(block.id, item);
        else setMenu(null);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMenu(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (LIST_TYPES.includes(block.type) && block.text === "") {
        commit(replace(block.id, { type: "p", checked: undefined }), { id: block.id, pos: 0 });
        return;
      }
      const before = block.text.slice(0, start);
      const after = block.text.slice(end);
      const newType: BlockType = LIST_TYPES.includes(block.type) ? block.type : "p";
      const nb: Block = { ...textBlock(after, newType), checked: newType === "todo" ? false : undefined };
      const next = list.slice();
      next[idx] = { ...block, text: before };
      next.splice(idx + 1, 0, nb);
      commit(next, { id: nb.id, pos: 0 });
      return;
    }

    if (e.key === "Backspace" && start === 0 && end === 0) {
      if (block.type !== "p") {
        e.preventDefault();
        commit(replace(block.id, { type: "p", checked: undefined }), { id: block.id, pos: 0 });
        return;
      }
      if (idx > 0) {
        e.preventDefault();
        const prev = list[idx - 1];
        const next = list.slice();
        if (prev.type === "divider") {
          next.splice(idx - 1, 1);
          commit(next, { id: block.id, pos: 0 });
          return;
        }
        next[idx - 1] = { ...prev, text: prev.text + block.text };
        next.splice(idx, 1);
        commit(next, { id: prev.id, pos: prev.text.length });
        return;
      }
    }

    if (e.key === "ArrowUp" && start === 0 && idx > 0) {
      e.preventDefault();
      focusAt(list[idx - 1], "end");
    }
    if (e.key === "ArrowDown" && end === block.text.length && idx < list.length - 1) {
      e.preventDefault();
      focusAt(list[idx + 1], "start");
    }
  };

  const focusAt = (b: Block, where: "start" | "end") => {
    const el = refs.current.get(b.id);
    if (!el) return;
    el.focus();
    if (el instanceof HTMLTextAreaElement) {
      const pos = where === "end" ? el.value.length : 0;
      el.setSelectionRange(pos, pos);
    }
  };

  const handleDividerKey = (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => {
    const block = list[idx];
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const next = list.filter((b) => b.id !== block.id);
      const target = list[idx - 1] || list[idx + 1];
      commit(next.length ? next : [textBlock()], target ? { id: target.id, pos: target.text.length } : undefined);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const nb = textBlock();
      const next = list.slice();
      next.splice(idx + 1, 0, nb);
      commit(next, { id: nb.id, pos: 0 });
    } else if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      focusAt(list[idx - 1], "end");
    } else if (e.key === "ArrowDown" && idx < list.length - 1) {
      e.preventDefault();
      focusAt(list[idx + 1], "start");
    }
  };

  const addAtEnd = () => {
    const last = list[list.length - 1];
    if (last && last.type === "p" && last.text === "") {
      focusAt(last, "end");
      return;
    }
    const nb = textBlock();
    commit([...list, nb], { id: nb.id, pos: 0 });
  };

  function renderAiPanel() {
    if (!aiPanel) return null;
    const scopeBlock = aiPanel.scopeId ? list.find((b) => b.id === aiPanel.scopeId) : null;
    return (
      <AiPanel
        key={aiPanel.key}
        initialInstruction={aiPanel.instruction}
        autoRun={aiPanel.autoRun}
        getText={aiGetText}
        context={aiContext}
        blockPreview={scopeBlock ? scopeBlock.text.slice(0, 120) : ""}
        scope={aiPanel.scope}
        onScope={(scope) => setAiPanel((p) => (p ? { ...p, scope } : p))}
        onReplace={aiReplace}
        onInsert={aiInsert}
        onClose={() => setAiPanel(null)}
      />
    );
  }

  let numberCounter = 0;
  const isEmpty = list.length === 1 && list[0].type === "p" && !list[0].text;

  return (
    <div className="editor" ref={wrap}>
      {(dictation || ai) && (
        <div className="editor-tools">
          {ai && (
            <button
              type="button"
              className={cx("btn ghost sm", aiPanel && "ai-on")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (aiPanel) {
                  setAiPanel(null);
                  return;
                }
                const anchor = (caret.current && list.find((b) => b.id === caret.current!.id)) || list[list.length - 1];
                openAi(anchor.id, "", null);
              }}
              title="Escrever com IA. Também dá para digitar / e escolher uma ação de IA."
            >
              <Sparkles size={14} /> IA
            </button>
          )}
          {dictation && <DictationButton dictation={dictate} />}
        </div>
      )}
      {list.map((block, idx) => {
        numberCounter = block.type === "number" ? numberCounter + 1 : 0;
        const panelHere = aiPanel && aiPanel.anchorId === block.id;
        const panel = panelHere ? renderAiPanel() : null;
        if (block.type === "divider") {
          return (
            <Fragment key={block.id}>
            <div
              className="blk divider"
              tabIndex={0}
              role="separator"
              ref={(el) => {
                if (el) refs.current.set(block.id, el);
                else refs.current.delete(block.id);
              }}
              onKeyDown={(e) => handleDividerKey(e, idx)}
            >
              <hr />
            </div>
            {panel}
            </Fragment>
          );
        }
        return (
          <Fragment key={block.id}>
          <div className={cx("blk", block.type, block.checked && "checked")}>
            {block.type === "bullet" && <span className="marker">•</span>}
            {block.type === "number" && <span className="marker num">{numberCounter}.</span>}
            {block.type === "todo" && (
              <span className="marker">
                <Checkbox checked={!!block.checked} onChange={(v) => onChange(replace(block.id, { checked: v }))} />
              </span>
            )}
            <span className="blk-field">
            <AutoTextarea
              className={cx("blk-text", focusedId !== block.id && hasUrl(block.text) && "has-links")}
              value={block.text}
              placeholder={isEmpty ? emptyHint : PLACEHOLDER[block.type]}
              aria-label="Bloco de texto"
              inputRef={(el) => {
                if (el) refs.current.set(block.id, el);
                else refs.current.delete(block.id);
              }}
              onChange={(e) => {
                handleText(block, e.target.value, e.target);
                trackCaret(block.id, e.target);
              }}
              onKeyDown={(e) => handleKey(e, block, idx)}
              onKeyUp={(e) => trackCaret(block.id, e.currentTarget)}
              onClick={(e) => trackCaret(block.id, e.currentTarget)}
              onFocus={(e) => {
                setFocusedId(block.id);
                trackCaret(block.id, e.currentTarget);
              }}
              onBlur={() => {
                setFocusedId((f) => (f === block.id ? null : f));
                window.setTimeout(() => setMenu((m) => (m && m.id === block.id ? null : m)), 150);
              }}
            />
            {focusedId !== block.id && hasUrl(block.text) && <LinkLayer text={block.text} />}
            </span>
          </div>
          {panel}
          </Fragment>
        );
      })}
      {aiPanel && !list.some((b) => b.id === aiPanel.anchorId) && renderAiPanel()}
      <div className="editor-add" onClick={addAtEnd} aria-hidden="true">
        &nbsp;
      </div>
      {dictation && <DictationBar dictation={dictate} />}
      {menu && (
        <div className="menu" style={{ top: menu.top, left: 24 }} onMouseDown={(e) => e.preventDefault()}>
          {menuItems.length === 0 && <div className="menu-item muted">Nenhum bloco encontrado</div>}
          {menuItems.map((m, i) => (
            <div
              key={m.kind === "ai" ? m.id : m.type}
              className={cx("menu-item", i === menu.index && "on")}
              onMouseEnter={() => setMenu({ ...menu, index: i })}
              onClick={() => choose(menu.id, m)}
            >
              {m.kind === "ai" && <Sparkles size={13} className="ai-icon" />}
              {m.label}
              {m.hint && <small>{m.hint}</small>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
