import {
  AlignLeft,
  ArrowRight,
  ChevronDown,
  Bell,
  Calendar as CalendarIcon,
  Check,
  CheckSquare,
  Clock,
  Copy,
  ExternalLink,
  HelpCircle,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  APP_LAYERS,
  formatRange,
  fromRRule,
  GOOGLE_EVENT_COLORS,
  LOCAL_CALENDAR_ID,
  meetLink,
  parseLocal,
  reminderLabel,
  REMINDER_OPTIONS,
  repeatLabel,
  type GCalendar,
  type UiEvent,
} from "../../lib/calendar";
import { validateDraft, type EditScope, type EventDraft } from "../../lib/calendarActions";
import type { RepeatRule } from "../../lib/types";
import { cx } from "../../lib/util";
import { Modal, useEscape } from "../common";

/** Texto puro da descrição do Google (que pode vir em HTML). */
function plainText(html: string): string {
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n"), "text/html");
  return doc.body.textContent || "";
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="link">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const STATUS_LABEL: Record<string, string> = { accepted: "Sim", declined: "Não", tentative: "Talvez", needsAction: "Aguardando" };

/* ---------------- Detalhes ---------------- */

export function EventDetails({
  ev,
  anchor,
  calendars,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onRespond,
  onOpenApp,
  onToggleTask,
}: {
  ev: UiEvent;
  anchor: DOMRect;
  calendars: GCalendar[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRespond: (status: "accepted" | "declined" | "tentative") => void;
  onOpenApp: () => void;
  onToggleTask: () => void;
}) {
  useEscape(onClose);
  const box = useRef<HTMLDivElement>(null);
  // null = medindo (invisível); "sheet" = painel inferior no celular
  const [pos, setPos] = useState<{ left: number; top: number } | "sheet" | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 640) {
      setPos("sheet");
      return;
    }
    let left = anchor.right + 8;
    if (left + w > vw - 12) left = anchor.left - w - 8;
    if (left < 12) left = Math.max(12, Math.min(vw - w - 12, anchor.left));
    let top = anchor.top;
    if (top + h > vh - 12) top = Math.max(12, vh - h - 12);
    setPos({ left, top });
  }, [anchor, ev.key]);

  const g = ev.google;
  const cal = calendars.find((c) => c.id === ev.calendarId);
  const layer = APP_LAYERS.find((l) => l.id === ev.calendarId);
  const meet = meetLink(g);
  const rec = g?.recurrence ? fromRRule(g.recurrence) : null;
  const repeatText =
    ev.source === "local" && ev.local && ev.local.repeat !== "none"
      ? repeatLabel(ev.local.repeat, parseLocal(ev.local.start))
      : rec && rec.rule !== "none" && rec.rule !== "custom"
        ? repeatLabel(rec.rule, ev.start)
        : ev.recurring
          ? "Evento que se repete"
          : "";
  const self = g?.attendees?.find((a) => a.self);
  const attendees = g?.attendees || [];
  const counts = attendees.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.responseStatus || "needsAction"]: (acc[a.responseStatus || "needsAction"] || 0) + 1 }), {});
  const description = ev.description ? plainText(ev.description) : "";
  const reminders = ev.source === "local" ? ev.local?.reminders || [] : g?.reminders?.useDefault === false ? (g.reminders.overrides || []).map((o) => o.minutes) : null;

  const row = (icon: ReactNode, content: ReactNode) => (
    <div className="ed-row">
      <span className="ed-icon">{icon}</span>
      <div className="grow">{content}</div>
    </div>
  );

  return (
    <>
      <div className="ed-backdrop" onMouseDown={onClose} />
      <div ref={box} className={cx("ed-pop", pos === "sheet" && "sheet")}
        style={pos === null ? { left: 0, top: 0, visibility: "hidden" } : pos === "sheet" ? undefined : { left: pos.left, top: pos.top }} role="dialog" aria-label={ev.title}>
        <div className="ed-actions">
          {!ev.readOnly && (ev.source === "google" || ev.source === "local") && (
            <button className="icon-btn" onClick={onEdit} aria-label="Editar evento" title="Editar">
              <Pencil size={16} />
            </button>
          )}
          {(ev.source === "google" || ev.source === "local") && (
            <button className="icon-btn" onClick={onDuplicate} aria-label="Duplicar evento" title="Duplicar">
              <Copy size={16} />
            </button>
          )}
          {!ev.readOnly && (ev.source === "google" || ev.source === "local") && (
            <button className="icon-btn" onClick={onDelete} aria-label="Excluir evento" title="Excluir">
              <Trash2 size={16} />
            </button>
          )}
          {g?.htmlLink && (
            <a className="icon-btn" href={g.htmlLink} target="_blank" rel="noreferrer" aria-label="Abrir no Google Agenda" title="Abrir no Google Agenda">
              <ExternalLink size={16} />
            </a>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="ed-row">
          <span className="ed-icon">
            <i className="ed-swatch" style={{ background: ev.color }} />
          </span>
          <div className="grow">
            <h3 className={cx("ed-title", ev.done && "done")}>{ev.title}</h3>
            <div className="text-2" style={{ fontSize: 13.5 }}>
              {formatRange(ev)}
            </div>
            {repeatText && (
              <div className="muted" style={{ fontSize: 13 }}>
                <Repeat size={12} style={{ verticalAlign: -1 }} /> {repeatText}
              </div>
            )}
          </div>
        </div>

        {meet &&
          row(
            <Video size={16} />,
            <a className="btn primary sm" href={meet} target="_blank" rel="noreferrer">
              Participar com o Google Meet
            </a>,
          )}
        {ev.location &&
          row(
            <MapPin size={16} />,
            <a className="link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`} target="_blank" rel="noreferrer">
              {ev.location}
            </a>,
          )}
        {attendees.length > 0 &&
          row(
            <Users size={16} />,
            <div className="stack" style={{ gap: 4 }}>
              <span>
                {attendees.length} convidado{attendees.length > 1 ? "s" : ""}
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {" "}
                  · {Object.entries(counts).map(([k, n]) => `${n} ${STATUS_LABEL[k]?.toLowerCase() || k}`).join(", ")}
                </span>
              </span>
              {attendees.slice(0, 8).map((a) => (
                <span key={a.email} className="row" style={{ gap: 6, fontSize: 13 }}>
                  {a.responseStatus === "accepted" ? <Check size={13} className="green" /> : a.responseStatus === "declined" ? <X size={13} className="red" /> : <HelpCircle size={13} className="muted" />}
                  <span className="ellipsis">{a.displayName || a.email}</span>
                  {a.organizer && <span className="pill">organizador</span>}
                </span>
              ))}
              {attendees.length > 8 && <span className="muted">+{attendees.length - 8} pessoas</span>}
            </div>,
          )}
        {description && row(<AlignLeft size={16} />, <div className="ed-desc"><Linkified text={description} /></div>)}
        {reminders && reminders.length > 0 && row(<Bell size={16} />, <span>{reminders.map(reminderLabel).join(", ")}</span>)}
        {g?.visibility === "private" && row(<Lock size={16} />, <span>Privado</span>)}
        {row(<CalendarIcon size={16} />, <span>{cal?.summary || layer?.label || "Agenda"}</span>)}
        {ev.source === "google" && ev.readOnly && <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 0 34px" }}>Você só tem permissão de leitura nesta agenda.</p>}

        {self && !g?.organizer?.self && (
          <div className="ed-rsvp">
            <span className="muted">Vai participar?</span>
            {(["accepted", "declined", "tentative"] as const).map((s) => (
              <button key={s} className={cx("chip-toggle", self.responseStatus === s && "on")} onClick={() => onRespond(s)}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}

        {(ev.source === "task" || ev.source === "video" || ev.source === "creative") && (
          <div className="ed-rsvp">
            {ev.source === "task" && (
              <button className="btn sm" onClick={onToggleTask}>
                <CheckSquare size={14} /> {ev.done ? "Marcar como não feita" : "Marcar como feita"}
              </button>
            )}
            <button className="btn primary sm" onClick={onOpenApp}>
              Abrir {ev.source === "task" ? "tarefa" : ev.source === "video" ? "vídeo" : "criativo"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- Escolha de escopo (eventos repetidos) ---------------- */

export function ScopeDialog({ action, onChoose, onCancel }: { action: "edit" | "delete"; onChoose: (s: EditScope) => void; onCancel: () => void }) {
  const [scope, setScope] = useState<EditScope>("instance");
  return (
    <Modal
      title={action === "edit" ? "Editar evento recorrente" : "Excluir evento recorrente"}
      onClose={onCancel}
      width={380}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button className={cx("btn", action === "delete" ? "danger" : "primary")} onClick={() => onChoose(scope)}>
            {action === "edit" ? "Salvar" : "Excluir"}
          </button>
        </>
      }
    >
      <label className="row" style={{ cursor: "pointer" }}>
        <input type="radio" name="scope" checked={scope === "instance"} onChange={() => setScope("instance")} /> Este evento
      </label>
      <label className="row" style={{ cursor: "pointer" }}>
        <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} /> Todos os eventos
      </label>
    </Modal>
  );
}

/* ---------------- Editor ---------------- */

const REPEAT_OPTIONS: RepeatRule[] = ["none", "daily", "weekdays", "weekly", "monthly", "yearly"];

export function EventEditor({
  initial,
  editing,
  calendars,
  connected,
  isInstance,
  onSave,
  onDelete,
  onClose,
  onConnect,
}: {
  initial: EventDraft;
  editing: boolean;
  calendars: GCalendar[];
  connected: boolean;
  /** true quando é uma ocorrência de evento repetido do Google */
  isInstance: boolean;
  onSave: (d: EventDraft) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
  onConnect: () => void;
}) {
  const [d, setD] = useState<EventDraft>(initial);
  const [guest, setGuest] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (p: Partial<EventDraft>) => setD((x) => ({ ...x, ...p }));
  const isGoogle = d.calendarId !== LOCAL_CALENDAR_ID;
  const startDate = useMemo(() => parseLocal(d.startDate || new Date().toISOString().slice(0, 10)), [d.startDate]);

  const writable = calendars.filter((c) => c.accessRole === "owner" || c.accessRole === "writer");
  const cal = writable.find((c) => c.id === d.calendarId);
  const calColor = isGoogle ? cal?.backgroundColor || "#039be5" : APP_LAYERS[0].color;

  const changeStartDate = (value: string) => {
    if (!value) return;
    // mantém a duração ao mudar a data de início
    const diff = parseLocal(d.endDate).getTime() - parseLocal(d.startDate).getTime();
    const end = new Date(parseLocal(value).getTime() + Math.max(0, diff));
    const pad = (n: number) => String(n).padStart(2, "0");
    set({ startDate: value, endDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}` });
  };

  const changeStartTime = (value: string) => {
    if (!value) return;
    const s = parseLocal(`${d.startDate}T${d.startTime}`);
    const e = parseLocal(`${d.endDate}T${d.endTime}`);
    const duration = Math.max(15 * 60_000, e.getTime() - s.getTime());
    const ns = parseLocal(`${d.startDate}T${value}`);
    const ne = new Date(ns.getTime() + duration);
    const pad = (n: number) => String(n).padStart(2, "0");
    set({ startTime: value, endTime: `${pad(ne.getHours())}:${pad(ne.getMinutes())}`, endDate: `${ne.getFullYear()}-${pad(ne.getMonth() + 1)}-${pad(ne.getDate())}` });
  };

  const addGuest = () => {
    const emails = guest
      .split(/[,;\s]+/)
      .map((g) => g.trim())
      .filter(Boolean);
    if (!emails.length) return;
    set({ guests: [...d.guests, ...emails.filter((e) => !d.guests.includes(e))] });
    setGuest("");
  };

  const save = async () => {
    const pending = guest.trim() ? [...d.guests, ...guest.split(/[,;\s]+/).filter(Boolean)] : d.guests;
    const draft = { ...d, guests: pending };
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o evento.");
    } finally {
      setSaving(false);
    }
  };

  const hasAdvanced = d.transparency !== "opaque" || d.visibility !== "default";
  const [showMore, setShowMore] = useState(hasAdvanced);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const currentColor = GOOGLE_EVENT_COLORS.find((c) => c.id === d.colorId);
  const swatch = currentColor?.hex || calColor;

  return (
    <Modal
      onClose={onClose}
      width={640}
      className="ee-modal"
      title={editing ? "Editar evento" : "Novo evento"}
      footer={
        <>
          {editing && onDelete && (
            <button className="btn ghost danger" style={{ marginRight: "auto" }} onClick={onDelete} disabled={saving}>
              <Trash2 size={14} /> Excluir
            </button>
          )}
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <form
        className="ee"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="ee-row ee-head">
          <span className="ee-ico">
            <i className="ee-dot" style={{ background: swatch }} />
          </span>
          <input
            id="ev-title"
            className="ee-title"
            placeholder="Adicionar título"
            aria-label="Título"
            value={d.title}
            autoFocus
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>

        {/* Quando */}
        <section className="ee-group">
          <FieldRow icon={<Clock size={18} />} label="Data e horário">
            <div className="ee-when">
              <div className="ee-pair">
                <input id="ev-start-date" className="input" type="date" value={d.startDate} onChange={(e) => changeStartDate(e.target.value)} aria-label="Data de início" />
                {!d.allDay && <input id="ev-start-time" className="input ee-time" type="time" step={300} value={d.startTime} onChange={(e) => changeStartTime(e.target.value)} aria-label="Hora de início" />}
              </div>
              <ArrowRight size={14} className="ee-sep" aria-hidden />
              <div className="ee-pair">
                {!d.allDay && <input id="ev-end-time" className="input ee-time" type="time" step={300} value={d.endTime} onChange={(e) => set({ endTime: e.target.value })} aria-label="Hora de fim" />}
                <input id="ev-end-date" className="input" type="date" value={d.endDate} min={d.startDate} onChange={(e) => set({ endDate: e.target.value })} aria-label="Data de fim" />
              </div>
            </div>
            <div className="ee-inline">
              <Switch checked={d.allDay} onChange={(v) => set({ allDay: v })} label="Dia inteiro" />
              <span className="ee-divider" aria-hidden />
              {isInstance ? (
                <span className="ee-hint">
                  <Repeat size={13} /> Faz parte de uma série
                </span>
              ) : (
                <div className="ee-select-icon">
                  <Repeat size={14} />
                  <select id="ev-repeat" className="select" value={d.repeat} onChange={(e) => set({ repeat: e.target.value as EventDraft["repeat"] })} aria-label="Repetição">
                    {d.repeat === "custom" && <option value="custom">Repetição personalizada</option>}
                    {REPEAT_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {repeatLabel(r, startDate)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {d.repeat !== "none" && d.repeat !== "custom" && !isInstance && (
              <label className="ee-inline ee-label">
                Termina em
                <input id="ev-repeat-until" className="input" type="date" style={{ width: "auto" }} value={d.repeatUntil} min={d.startDate} onChange={(e) => set({ repeatUntil: e.target.value })} />
                {!d.repeatUntil && <span className="ee-hint">nunca</span>}
              </label>
            )}
          </FieldRow>
        </section>

        {/* Agenda e cor */}
        <section className="ee-group">
          <FieldRow icon={<CalendarIcon size={18} />} label="Agenda">
            <div className="ee-inline">
              <div className="ee-select-icon grow">
                <i className="ee-dot sm" style={{ background: calColor }} />
                <select id="ev-calendar" className="select" value={d.calendarId} onChange={(e) => set({ calendarId: e.target.value })} aria-label="Agenda">
                  {writable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary}
                      {c.primary ? " (principal)" : ""}
                    </option>
                  ))}
                  <option value={LOCAL_CALENDAR_ID}>Organizador (sem Google)</option>
                </select>
              </div>
              <div className="ee-color-wrap">
                <button type="button" className="ee-color-btn" onClick={() => setPaletteOpen((o) => !o)} aria-haspopup="true" aria-expanded={paletteOpen} aria-label="Cor do evento" title="Cor do evento">
                  <i className="ee-dot" style={{ background: swatch }} />
                  <ChevronDown size={14} />
                </button>
                {paletteOpen && (
                  <>
                    <div className="ee-palette-backdrop" onClick={() => setPaletteOpen(false)} />
                    <div className="ee-palette" role="radiogroup" aria-label="Cor do evento">
                      {[{ id: "", name: "Cor da agenda", hex: calColor }, ...GOOGLE_EVENT_COLORS].map((c) => (
                        <button
                          type="button"
                          key={c.id || "agenda"}
                          role="radio"
                          aria-checked={d.colorId === c.id}
                          className={cx("ee-color", d.colorId === c.id && "on")}
                          style={{ background: c.hex }}
                          title={c.name}
                          aria-label={c.name}
                          onClick={() => {
                            set({ colorId: c.id });
                            setPaletteOpen(false);
                          }}
                        >
                          {d.colorId === c.id && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            {!connected && (
              <div className="ee-callout">
                <span>Conecte o Google Agenda para salvar no Google, convidar pessoas e criar reuniões no Meet.</span>
                <button type="button" className="btn sm" onClick={onConnect}>
                  Conectar
                </button>
              </div>
            )}
          </FieldRow>
        </section>

        {/* Pessoas e reunião */}
        {isGoogle && (
          <section className="ee-group">
            <FieldRow icon={<Users size={18} />} label="Convidados">
              <input
                id="ev-guest"
                className="input"
                type="email"
                placeholder="Adicionar convidados por e-mail"
                aria-label="Adicionar convidados"
                value={guest}
                onChange={(e) => setGuest(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addGuest();
                  }
                }}
                onBlur={addGuest}
              />
              {d.guests.length > 0 && (
                <>
                  <div className="ee-chips">
                    {d.guests.map((g) => (
                      <span key={g} className="ee-chip">
                        <span className="ee-avatar">{g.charAt(0).toUpperCase()}</span>
                        <span className="ellipsis">{g}</span>
                        <button type="button" aria-label={`Remover ${g}`} onClick={() => set({ guests: d.guests.filter((x) => x !== g) })}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <Switch checked={d.sendInvites} onChange={(v) => set({ sendInvites: v })} label="Enviar convite e atualizações por e-mail" />
                </>
              )}
            </FieldRow>
            <FieldRow icon={<Video size={18} />} label="Videoconferência">
              {d.addMeet ? (
                <div className="ee-meet on">
                  <span className="ee-meet-logo">
                    <Video size={14} />
                  </span>
                  <span className="grow">
                    <strong>Google Meet</strong>
                    <span className="ee-hint">{initial.addMeet ? "Link da reunião já criado" : "O link é criado quando você salvar"}</span>
                  </span>
                  <button type="button" className="icon-btn" aria-label="Remover Google Meet" title="Remover" onClick={() => set({ addMeet: false })}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button type="button" className="ee-meet" onClick={() => set({ addMeet: true })}>
                  <span className="ee-meet-logo">
                    <Video size={14} />
                  </span>
                  Adicionar Google Meet
                </button>
              )}
            </FieldRow>
          </section>
        )}

        {/* Detalhes */}
        <section className="ee-group">
          <FieldRow icon={<MapPin size={18} />} label="Local">
            <input id="ev-location" className="input" placeholder="Adicionar local" aria-label="Local" value={d.location} onChange={(e) => set({ location: e.target.value })} />
          </FieldRow>

          <FieldRow icon={<Bell size={18} />} label="Notificações">
            {isGoogle && <Switch checked={d.useDefaultReminders} onChange={(v) => set({ useDefaultReminders: v })} label="Usar notificações padrão da agenda" />}
            {(!isGoogle || !d.useDefaultReminders) && (
              <div className="ee-list">
                {d.reminders.map((m, i) => (
                  <div key={i} className="ee-inline">
                    <select
                      className="select grow"
                      value={m}
                      aria-label="Notificação"
                      onChange={(e) => set({ reminders: d.reminders.map((x, j) => (j === i ? Number(e.target.value) : x)) })}
                    >
                      {[...new Set([...REMINDER_OPTIONS, m])].sort((a, b) => a - b).map((opt) => (
                        <option key={opt} value={opt}>
                          {reminderLabel(opt)}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="icon-btn" aria-label="Remover notificação" title="Remover" onClick={() => set({ reminders: d.reminders.filter((_, j) => j !== i) })}>
                      <X size={15} />
                    </button>
                  </div>
                ))}
                {d.reminders.length < 5 && (
                  <button type="button" className="ee-add" onClick={() => set({ reminders: [...d.reminders, 10] })}>
                    <Plus size={14} /> Adicionar notificação
                  </button>
                )}
                {!isGoogle && d.reminders.length > 0 && <span className="ee-hint">Eventos só do Organizador não enviam avisos. Salve no Google Agenda para ser notificado.</span>}
              </div>
            )}
          </FieldRow>

          <FieldRow icon={<AlignLeft size={18} />} label="Descrição">
            <textarea id="ev-description" className="textarea" rows={3} placeholder="Adicionar descrição" aria-label="Descrição" value={d.description} onChange={(e) => set({ description: e.target.value })} />
          </FieldRow>
        </section>

        {isGoogle && (
          <section className="ee-group">
            {showMore ? (
              <FieldRow icon={<Lock size={18} />} label="Disponibilidade e visibilidade" labeled>
                <div className="ee-two">
                  <label className="ee-label-stack">
                    Mostrar como
                    <select id="ev-transparency" className="select" value={d.transparency} onChange={(e) => set({ transparency: e.target.value as EventDraft["transparency"] })}>
                      <option value="opaque">Ocupado</option>
                      <option value="transparent">Disponível</option>
                    </select>
                  </label>
                  <label className="ee-label-stack">
                    Visibilidade
                    <select id="ev-visibility" className="select" value={d.visibility} onChange={(e) => set({ visibility: e.target.value as EventDraft["visibility"] })}>
                      <option value="default">Padrão da agenda</option>
                      <option value="public">Público</option>
                      <option value="private">Privado</option>
                    </select>
                  </label>
                </div>
              </FieldRow>
            ) : (
              <FieldRow icon={<Lock size={18} />} label="Mais opções">
                <button type="button" className="ee-add" onClick={() => setShowMore(true)}>
                  Mais opções <span className="ee-hint">disponibilidade e visibilidade</span>
                  <ChevronDown size={14} />
                </button>
              </FieldRow>
            )}
          </section>
        )}

        {error && (
          <div className="ai-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function FieldRow({ icon, label, labeled, children }: { icon: ReactNode; label: string; labeled?: boolean; children: ReactNode }) {
  return (
    <div className={cx("ee-row", labeled && "labeled")} role="group" aria-label={label}>
      <span className="ee-ico" title={label} aria-hidden>
        {icon}
      </span>
      <div className="ee-field">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={cx("ee-switch", checked && "on")} onClick={() => onChange(!checked)}>
      <span className="ee-switch-track">
        <span className="ee-switch-thumb" />
      </span>
      {label}
    </button>
  );
}
