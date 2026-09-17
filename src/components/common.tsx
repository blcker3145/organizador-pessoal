import { Check, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Priority, TaskStatus, VideoStage } from "../lib/types";
import { cx } from "../lib/util";

/** Interruptor de ligar/desligar com rótulo. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={cx("ee-switch", checked && "on")} onClick={() => onChange(!checked)}>
      <span className="ee-switch-track">
        <span className="ee-switch-thumb" />
      </span>
      {label}
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  round,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  round?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label || (checked ? "Desmarcar" : "Marcar")}
      className={cx("check", checked && "on", round && "round")}
      onClick={(e) => {
        e.stopPropagation();
        // anima só quando a pessoa clica
        const el = e.currentTarget;
        el.classList.remove("pop");
        void el.offsetWidth;
        el.classList.add("pop");
        onChange(!checked);
      }}
      onAnimationEnd={(e) => e.currentTarget.classList.remove("pop")}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width,
  className,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx("modal", className)} role="dialog" aria-modal="true" style={width ? { maxWidth: width } : undefined}>
        {title && (
          <div className="modal-head">
            <span>{title}</span>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const escapeStack: (() => void)[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && escapeStack.length) {
      e.preventDefault();
      escapeStack[escapeStack.length - 1]();
    }
  });
}

/** Esc fecha só a sobreposição mais recente. */
export function useEscape(fn: () => void, active = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const handler = () => ref.current();
    escapeStack.push(handler);
    return () => {
      const i = escapeStack.lastIndexOf(handler);
      if (i >= 0) escapeStack.splice(i, 1);
    };
  }, [active]);
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          className={cx("tab", value === it.value && "on")}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Textarea que cresce com o conteúdo. */
export function AutoTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef?: React.Ref<HTMLTextAreaElement> },
) {
  const { inputRef, ...rest } = props;
  const local = useRef<HTMLTextAreaElement | null>(null);
  const fit = () => {
    const el = local.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [props.value]);
  // a largura também muda a quantidade de linhas (tela menor, painel lateral…)
  useEffect(() => {
    const el = local.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea
      rows={1}
      {...rest}
      ref={(el) => {
        local.current = el;
        if (typeof inputRef === "function") inputRef(el);
        else if (inputRef && typeof inputRef === "object") (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
      }}
    />
  );
}

export const PRIORITY_LABEL: Record<Priority, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const PRIORITY_COLOR: Record<Priority, string> = { alta: "red", media: "orange", baixa: "" };
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "A fazer", doing: "Fazendo", done: "Feito" };
export const STATUS_COLOR: Record<TaskStatus, string> = { todo: "", doing: "blue", done: "green" };

export const STAGES: { value: VideoStage; label: string; color: string }[] = [
  { value: "ideia", label: "Ideia", color: "" },
  { value: "roteiro", label: "Roteiro", color: "purple" },
  { value: "gravacao", label: "Gravação", color: "orange" },
  { value: "edicao", label: "Edição", color: "blue" },
  { value: "agendado", label: "Agendado", color: "blue" },
  { value: "publicado", label: "Publicado", color: "green" },
];
export const stageInfo = (s: VideoStage) => STAGES.find((x) => x.value === s)!;
export const PLATFORMS = ["YouTube", "Shorts", "Reels", "TikTok", "Instagram"];

export function PriorityPill({ p }: { p: Priority | null }) {
  if (!p) return null;
  return <span className={cx("pill", PRIORITY_COLOR[p])}>{PRIORITY_LABEL[p]}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Campo de texto que só salva ao sair ou apertar Enter. */
export function CommitInput({
  value,
  onCommit,
  className,
  placeholder,
  type = "text",
  ariaLabel,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  type?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={className || "input"}
      value={draft}
      type={type}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim().replace(/^#/, "");
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  };
  return (
    <div className="row wrap" style={{ gap: 4 }}>
      {tags.map((t) => (
        <span key={t} className="pill">
          {t}
          <button className="link-btn" aria-label={`Remover tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        className="input bare"
        style={{ width: 120, minHeight: 26 }}
        placeholder={tags.length ? "+ tag" : "Adicionar tag"}
        aria-label="Nova tag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

export function MoneyInput({
  value,
  onChange,
  id,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="row" style={{ gap: 0 }}>
      <span className="muted" style={{ padding: "0 8px 0 2px" }}>
        R$
      </span>
      <input
        id={id}
        className="input num"
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
      />
    </div>
  );
}

export function ProgressBar({ pct, warnAt = 90 }: { pct: number; warnAt?: number }) {
  const cls = pct > 100 ? "over" : pct >= warnAt ? "warn" : "";
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <i className={cls} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
