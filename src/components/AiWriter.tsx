import { Check, Copy, CornerDownLeft, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AiError, providerLabel, useAiProvider, WRITING_ACTIONS, writeWithAi } from "../lib/ai";
import { ui } from "../lib/ui";
import { cx } from "../lib/util";

/* ---------------- Estado de uma sessão de escrita com IA ---------------- */

export function useAiWriter(opts: { getText: () => string; context?: string; plain?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ instruction: string; result: string }[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = async (instruction: string, refine = false) => {
    if (!instruction.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await writeWithAi({
        text: opts.getText(),
        instruction,
        context: opts.context,
        plain: opts.plain,
        history: refine ? history : undefined,
      });
      if (!alive.current) return;
      setHistory((h) => (refine ? [...h, { instruction, result }] : [{ instruction, result }]));
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof AiError ? e.message : "Algo deu errado ao falar com a IA. Tente de novo.");
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  const result = history.length ? history[history.length - 1].result : "";
  return { loading, error, result, history, run, refine: (i: string) => run(i, true), reset: () => (setHistory([]), setError("")) };
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => ui.toast("Texto copiado"),
    () => ui.toast("Não foi possível copiar"),
  );
}

/* ---------------- Painel do editor de blocos ---------------- */

export type AiScope = "all" | "block";

export function AiPanel({
  initialInstruction,
  autoRun,
  getText,
  context,
  blockPreview,
  scope,
  onScope,
  onReplace,
  onInsert,
  onClose,
}: {
  initialInstruction: string;
  autoRun: boolean;
  getText: () => string;
  context?: string;
  /** Texto do parágrafo atual, quando existe; habilita a escolha de escopo. */
  blockPreview: string;
  scope: AiScope;
  onScope: (s: AiScope) => void;
  onReplace: (markdown: string) => void;
  onInsert: (markdown: string) => void;
  onClose: () => void;
}) {
  const writer = useAiWriter({ getText, context });
  const provider = useAiProvider();
  const [instruction, setInstruction] = useState(initialInstruction);
  const [followUp, setFollowUp] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (autoRun) writer.run(initialInstruction);
    else inputRef.current?.focus();
  }, []);

  const submit = () => {
    writer.run(instruction);
  };

  return (
    <div className="ai-panel" onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onClose())}>
      <div className="ai-head">
        <Sparkles size={15} />
        <strong>Escrever com IA</strong>
        {provider && (
          <span className="muted" style={{ fontSize: 12 }}>
            {providerLabel(provider)}
          </span>
        )}
        <span className="grow" />
        {blockPreview && (
          <span className="row" style={{ gap: 4 }}>
            <button className={cx("pill", scope === "all" ? "selected" : "outline")} onClick={() => onScope("all")}>
              Todo o texto
            </button>
            <button className={cx("pill", scope === "block" ? "selected" : "outline")} onClick={() => onScope("block")} title={blockPreview}>
              Só este parágrafo
            </button>
          </span>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Fechar IA">
          <X size={15} />
        </button>
      </div>

      <>
          {!writer.result && (
            <>
              <div className="row wrap" style={{ gap: 4 }}>
                {WRITING_ACTIONS.map((a) => (
                  <button key={a.id} className="chip-toggle ai-chip" disabled={writer.loading} onClick={() => (setInstruction(a.instruction), writer.run(a.instruction))}>
                    {a.label}
                  </button>
                ))}
              </div>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input
                  ref={inputRef}
                  id="ai-instruction"
                  className="input"
                  placeholder="Ou peça qualquer coisa: escreva uma legenda para esse roteiro, deixe mais engraçado…"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                />
                <button type="submit" className="btn primary sm" disabled={writer.loading || !instruction.trim()}>
                  <CornerDownLeft size={14} /> Pedir
                </button>
              </form>
            </>
          )}

          {writer.loading && (
            <div className="ai-loading">
              <Loader2 size={15} className="spin" /> Escrevendo…
            </div>
          )}
          {writer.error && <div className="ai-error">{writer.error}</div>}

          {writer.result && (
            <>
              <div className="ai-result">{writer.result}</div>
              <div className="row wrap" style={{ gap: 6 }}>
                <button className="btn primary sm" onClick={() => (onReplace(writer.result), onClose())}>
                  <Check size={14} /> Substituir {scope === "block" && blockPreview ? "parágrafo" : "texto"}
                </button>
                <button className="btn sm" onClick={() => (onInsert(writer.result), onClose())}>
                  Inserir abaixo
                </button>
                <button className="btn ghost sm" onClick={() => copy(writer.result)}>
                  <Copy size={13} /> Copiar
                </button>
                <button className="btn ghost sm" disabled={writer.loading} onClick={writer.reset}>
                  <RotateCcw size={13} /> Recomeçar
                </button>
              </div>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!followUp.trim()) return;
                  writer.refine(followUp);
                  setFollowUp("");
                }}
              >
                <input
                  id="ai-followup"
                  className="input"
                  placeholder="Pedir ajuste: mais curto, mais informal, troque o gancho…"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn sm" disabled={writer.loading || !followUp.trim()}>
                  Ajustar
                </button>
              </form>
            </>
          )}
          <div className="muted" style={{ fontSize: 11.5 }}>
            O texto é enviado ao provedor de IA ({providerLabel(provider)}) para gerar a resposta. Confira antes de publicar.
          </div>
        </>
    </div>
  );
}

/* ---------------- Botão ✨ para campos de texto simples ---------------- */

const FIELD_ACTIONS = [
  { label: "Melhorar", instruction: "Melhore este texto mantendo a ideia e o tamanho aproximado." },
  { label: "Mais persuasivo", instruction: "Deixe mais persuasivo e chamativo, como copy de redes sociais." },
  { label: "Mais curto", instruction: "Deixe mais curto e direto." },
  { label: "3 opções", instruction: "Dê 3 opções diferentes, uma por linha, numeradas." },
  { label: "Corrigir", instruction: "Corrija ortografia e gramática sem mudar o estilo." },
];

export function AiFieldButton({ value, onChange, context, label }: { value: string; onChange: (v: string) => void; context?: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="ai-field">
      <button type="button" className={cx("icon-btn ai-spark", open && "on")} onClick={() => setOpen(!open)} aria-label={`IA: melhorar ${label}`} title={`Escrever ${label} com IA`}>
        <Sparkles size={14} />
      </button>
      {open && <FieldPopover value={value} onChange={onChange} context={context} label={label} onClose={() => setOpen(false)} />}
    </span>
  );
}

function FieldPopover({ value, onChange, context, label, onClose }: { value: string; onChange: (v: string) => void; context?: string; label: string; onClose: () => void }) {
  const writer = useAiWriter({ getText: () => value, context: `${context ? context + ". " : ""}Campo: ${label}`, plain: true });
  const [instruction, setInstruction] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node) && !(e.target as HTMLElement).closest(".ai-spark")) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const options = writer.result
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").replace(/^["“]|["”]$/g, "").trim())
    .filter(Boolean);
  const multiple = writer.history[writer.history.length - 1]?.instruction.includes("3 opções") && options.length > 1;

  return (
    <div className="ai-popover" ref={box} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onClose())}>
      <div className="ai-head">
        <Sparkles size={14} />
        <strong style={{ fontSize: 13 }}>IA · {label}</strong>
        <span className="grow" />
        <button className="icon-btn" onClick={onClose} aria-label="Fechar">
          <X size={14} />
        </button>
      </div>
      <>
          <div className="row wrap" style={{ gap: 4 }}>
            {FIELD_ACTIONS.map((a) => (
              <button key={a.label} className="chip-toggle ai-chip" disabled={writer.loading} onClick={() => writer.run(value.trim() ? a.instruction : `Escreva ${label.toLowerCase()} do zero. ${a.instruction}`)}>
                {a.label}
              </button>
            ))}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!instruction.trim()) return;
              if (writer.result) writer.refine(instruction);
              else writer.run(instruction);
              setInstruction("");
            }}
          >
            <input
              id="ai-field-instruction"
              className="input"
              autoFocus
              placeholder={writer.result ? "Pedir ajuste…" : `Peça algo para ${label.toLowerCase()}…`}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button type="submit" className="btn sm" disabled={writer.loading || !instruction.trim()}>
              Pedir
            </button>
          </form>
          {writer.loading && (
            <div className="ai-loading">
              <Loader2 size={14} className="spin" /> Escrevendo…
            </div>
          )}
          {writer.error && <div className="ai-error">{writer.error}</div>}
          {writer.result &&
            (multiple ? options : [writer.result]).map((opt, i) => (
              <div key={i} className="ai-option">
                <span className="grow" style={{ whiteSpace: "pre-wrap" }}>
                  {opt}
                </span>
                <button className="btn primary sm" onClick={() => (onChange(opt), onClose())}>
                  Usar
                </button>
              </div>
            ))}
        </>
    </div>
  );
}
