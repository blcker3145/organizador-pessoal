import { CheckSquare, Clapperboard, FileText, Mic, Palette, Send, Sparkles, Trash2, Wallet, X, CheckCheck, CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AiError, providerLabel, useAiProvider, type ChatMessage } from "../lib/ai";
import { runAssistant, type CreatedItem } from "../lib/assistant";
import { createStore } from "../lib/createStore";
import { navigate, ui, useUI } from "../lib/ui";
import { cx } from "../lib/util";
import { useEscape } from "./common";
import { useDictation } from "./Dictation";

interface Turn {
  role: "user" | "assistant";
  text: string;
  items?: CreatedItem[];
  error?: boolean;
}

/** Conversa guardada enquanto o app estiver aberto. */
const convoStore = createStore<{ turns: Turn[]; api: ChatMessage[] }>({ turns: [], api: [] });

const SUGGESTIONS = [
  "O que eu tenho para fazer hoje?",
  "Adicione uma tarefa para amanhã: ligar para o contador",
  "Crie um vídeo curto sobre por que você não é a sua profissão, já com roteiro",
  "Crie um criativo carrossel com 5 erros de identidade visual",
  "Anote uma ideia de vídeo: gameplay de Minecraft de fundo falando de mercado de trabalho",
  "Gastei 45 reais no almoço hoje",
  "Marque uma reunião com a Ana amanhã às 15h com Google Meet",
];

const ICONS: Record<CreatedItem["kind"], React.ReactNode> = {
  task: <CheckSquare size={13} />,
  done: <CheckCheck size={13} />,
  video: <Clapperboard size={13} />,
  creative: <Palette size={13} />,
  note: <FileText size={13} />,
  transaction: <Wallet size={13} />,
  event: <CalendarDays size={13} />,
};

const KIND_LABEL: Record<CreatedItem["kind"], string> = {
  task: "Tarefa criada",
  done: "Tarefa concluída",
  video: "Vídeo criado",
  creative: "Criativo criado",
  note: "Nota criada",
  transaction: "Lançamento registrado",
  event: "Evento criado",
};

export function AssistantDrawer() {
  const { assistantOpen } = useUI();
  useEscape(ui.closeAssistant, assistantOpen);
  if (!assistantOpen) return null;
  return (
    <>
      <div className="drawer-overlay" onMouseDown={ui.closeAssistant} />
      <aside className="drawer assistant" role="dialog" aria-label="Assistente IA">
        <AssistantChat />
      </aside>
    </>
  );
}

function AssistantChat() {
  const { turns, api } = convoStore.use();
  const provider = useAiProvider();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation((text) => setInput((v) => (v ? `${v.trimEnd()} ${text.trim()}` : text.trim())));

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns.length, loading]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || loading) return;
    if (dictation.listening) dictation.stop();
    setInput("");
    const history: ChatMessage[] = [...api, { role: "user", content: message }];
    convoStore.set((s) => ({ ...s, turns: [...s.turns, { role: "user", text: message }] }));
    setLoading(true);
    try {
      const { messages, items } = await runAssistant(history);
      const last = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
      const reply = (last && "content" in last && last.content) || (items.length ? "Pronto." : "Não consegui responder. Tente reformular.");
      convoStore.set({ api: messages, turns: [...convoStore.get().turns, { role: "assistant", text: reply, items }] });
    } catch (e) {
      const msg = e instanceof AiError ? e.message : "Algo deu errado ao falar com a IA. Tente de novo.";
      convoStore.set((s) => ({ ...s, turns: [...s.turns, { role: "assistant", text: msg, error: true }] }));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const openItem = (item: CreatedItem) => {
    if (item.kind === "task" || item.kind === "done") {
      ui.closeAssistant();
      ui.openTask(item.id);
    } else if (item.path) {
      ui.closeAssistant();
      navigate(item.path);
    }
  };

  return (
    <div className="assistant-wrap">
      <div className="drawer-top">
        <span className={cx("ai-orb", loading && "busy")} aria-hidden>
          <Sparkles size={15} />
        </span>
        <strong className="ai-text">Assistente IA</strong>
        {provider && (
          <span className="muted" style={{ fontSize: 12 }}>
            {providerLabel(provider)}
          </span>
        )}
        <span className="grow" />
        {turns.length > 0 && (
          <button className="btn ghost sm" onClick={() => convoStore.set({ turns: [], api: [] })}>
            <Trash2 size={13} /> Nova conversa
          </button>
        )}
        <button className="icon-btn" onClick={ui.closeAssistant} aria-label="Fechar assistente">
          <X size={18} />
        </button>
      </div>

      <div className="assistant-list" ref={listRef}>
        {turns.length === 0 && (
          <div className="stack" style={{ gap: 10 }}>
            <p className="muted" style={{ margin: 0 }}>
              Peça em linguagem normal. Eu crio tarefas, vídeos com roteiro, criativos, notas e lançamentos, e respondo o que você tem para fazer.
            </p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="assistant-suggestion" disabled={loading} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cx("bubble", t.role, t.error && "error")}>
            <div style={{ whiteSpace: "pre-wrap" }}>{t.text}</div>
            {t.items && t.items.length > 0 && (
              <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                {t.items.map((it) => (
                  <button key={`${it.kind}${it.id}`} className="created-chip" onClick={() => openItem(it)} disabled={it.kind === "transaction" && !it.path}>
                    {ICONS[it.kind]}
                    <span className="muted">{KIND_LABEL[it.kind]}:</span>
                    <span className="ellipsis">{it.label}</span>
                    <span className="muted">↗</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="bubble assistant thinking" aria-live="polite">
            <span className="thinking-text">Pensando</span>
            <span className="thinking-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>

      <form
        className={cx("assistant-input", loading && "busy")}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          ref={inputRef}
          id="assistant-input"
          className="textarea"
          rows={2}
          autoFocus
          placeholder={dictation.listening ? dictation.interim || "Ouvindo… fale seu pedido" : "Ex.: adicione um criativo story para a Loja Aurora com entrega sexta"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button type="button" className={cx("btn ghost sm", dictation.listening && "dictate-btn on")} onClick={dictation.toggle}>
            <Mic size={14} /> {dictation.listening ? "Parar" : "Falar"}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Enter envia · Shift Enter quebra linha
          </span>
          <button type="submit" className="btn primary sm" disabled={loading || !input.trim()}>
            <Send size={13} /> Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
