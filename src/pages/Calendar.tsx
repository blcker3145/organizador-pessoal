import { ChevronLeft, ChevronRight, Link2, Loader2, LogOut, Menu, Plus, RefreshCw, Search, Star, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgendaView, MiniMonth, MonthView, TimeGridView, type ViewHandlers } from "../components/calendar/CalendarViews";
import { EventDetails, EventEditor, ScopeDialog } from "../components/calendar/EventDialogs";
import { Checkbox } from "../components/common";
import {
  addDaysDate,
  addMinutes,
  APP_LAYERS,
  LOCAL_CALENDAR_ID,
  startOfDay,
  startOfMonthDate,
  startOfWeekDate,
  ymd,
  type UiEvent,
} from "../lib/calendar";
import { deleteUiEvent, draftFromEvent, newDraft, rescheduleUiEvent, saveDraft, useCalendarEvents, type EditScope, type EventDraft } from "../lib/calendarActions";
import {
  connectGoogle,
  consumeGcalReturn,
  disconnectGoogle,
  GCAL_RETURN_MESSAGES,
  loadCalendars,
  refreshGcalStatus,
  respondEvent,
  useGcal,
  writableCalendars,
} from "../lib/gcal";
import { setState, toggleTask, useApp } from "../lib/store";
import type { CalendarPrefs } from "../lib/types";
import { navigate, ui, useUI } from "../lib/ui";
import { capitalize, cx } from "../lib/util";

type View = CalendarPrefs["view"];
const VIEWS: { value: View; label: string; key: string }[] = [
  { value: "day", label: "Dia", key: "d" },
  { value: "week", label: "Semana", key: "w" },
  { value: "month", label: "Mês", key: "m" },
  { value: "agenda", label: "Lista", key: "a" },
];

function rangeFor(view: View, anchor: Date, searching: boolean) {
  if (searching) {
    const from = addDaysDate(startOfDay(new Date()), -180);
    return { from, to: addDaysDate(from, 545), days: 545, label: "Resultados da busca" };
  }
  if (view === "day") {
    const from = startOfDay(anchor);
    return { from, to: addDaysDate(from, 1), days: 1, label: anchor.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) };
  }
  if (view === "week") {
    const from = startOfWeekDate(anchor);
    const to = addDaysDate(from, 7);
    const last = addDaysDate(from, 6);
    const sameMonth = from.getMonth() === last.getMonth();
    const label = sameMonth
      ? from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : `${from.toLocaleDateString("pt-BR", { month: "short" })} – ${last.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}`;
    return { from, to, days: 7, label };
  }
  if (view === "month") {
    const from = startOfWeekDate(startOfMonthDate(anchor));
    return { from, to: addDaysDate(from, 42), days: 42, label: anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  }
  const from = startOfDay(anchor);
  return { from, to: addDaysDate(from, 30), days: 30, label: `${from.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${addDaysDate(from, 29).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}` };
}

function shift(view: View, anchor: Date, dir: number): Date {
  if (view === "day") return addDaysDate(anchor, dir);
  if (view === "week") return addDaysDate(anchor, 7 * dir);
  if (view === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return addDaysDate(anchor, 30 * dir);
}

export function CalendarPage() {
  const state = useApp();
  const gcal = useGcal();
  const uiState = useUI();
  const prefs = state.calendarPrefs;
  const [anchor, setAnchor] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [sideOpen, setSideOpen] = useState(false);
  const [selected, setSelected] = useState<{ ev: UiEvent; rect: DOMRect } | null>(null);
  const [editor, setEditor] = useState<{ draft: EventDraft; original?: UiEvent } | null>(null);
  const [scopeAsk, setScopeAsk] = useState<{ action: "edit" | "delete"; resolve: (s: EditScope | null) => void } | null>(null);
  const [connecting, setConnecting] = useState(false);

  const view = prefs.view;
  const searching = query.trim().length > 0;
  const range = useMemo(() => rangeFor(view, anchor, searching), [view, anchor.getTime(), searching]);
  const { events, loading, error } = useCalendarEvents(range.from, range.to, query);

  const setPrefs = (p: Partial<CalendarPrefs>) => setState((s) => ({ ...s, calendarPrefs: { ...s.calendarPrefs, ...p } }));
  const setView = (v: View) => setPrefs({ view: v });

  const writable = writableCalendars(gcal.calendars);
  const defaultCalendar = gcal.connected
    ? writable.find((c) => c.id === prefs.defaultCalendarId)?.id || writable.find((c) => c.primary)?.id || writable[0]?.id || LOCAL_CALENDAR_ID
    : LOCAL_CALENDAR_ID;

  /* conexão com o Google */
  useEffect(() => {
    const back = consumeGcalReturn();
    if (back) {
      if (back.ok) ui.toast("Google Agenda conectado. Seus eventos já aparecem aqui.");
      else ui.toast(GCAL_RETURN_MESSAGES[back.reason || "google"] || GCAL_RETURN_MESSAGES.google);
    }
    refreshGcalStatus(!!back);
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      await connectGoogle();
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : "Não foi possível iniciar a conexão com o Google.");
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    const ok = await ui.confirm({
      title: "Desconectar o Google Agenda?",
      message: "Os eventos do Google somem daqui e o Organizador perde o acesso à sua agenda. Nada é apagado no Google.",
      confirmLabel: "Desconectar",
      danger: true,
    });
    if (!ok) return;
    try {
      await disconnectGoogle();
      ui.toast("Google Agenda desconectado");
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : "Não foi possível desconectar.");
    }
  };

  const askScope = (action: "edit" | "delete") => new Promise<EditScope | null>((resolve) => setScopeAsk({ action, resolve }));

  /* ações */
  const openCreate = useCallback(
    (start?: Date, end?: Date, allDay = false) => {
      const now = new Date();
      const s = start || new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
      const e = end || addMinutes(s, 60);
      setSelected(null);
      setSideOpen(false);
      setEditor({ draft: newDraft(s, e, allDay, defaultCalendar) });
    },
    [defaultCalendar],
  );

  const reschedule = async (ev: UiEvent, start: Date, end: Date) => {
    try {
      await rescheduleUiEvent(ev, start, end);
      if (ev.source === "google" && ev.google?.recurringEventId) ui.toast("Só esta ocorrência foi alterada");
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : "Não foi possível mover o evento.");
    }
  };

  const handlers: ViewHandlers = {
    onSelect: (ev, rect) => setSelected({ ev, rect }),
    onCreate: (s, e, allDay) => openCreate(s, e, allDay),
    onReschedule: (ev, s, e) => {
      if (ev.source === "task" || ev.source === "video" || ev.source === "creative") return;
      reschedule(ev, s, e);
    },
    onOpenDay: (day) => {
      setAnchor(day);
      setView("day");
      setQuery("");
    },
  };

  const saveEditor = async (draft: EventDraft) => {
    const original = editor?.original;
    let scope: EditScope = "instance";
    if (original?.source === "google" && original.google?.recurringEventId) {
      const chosen = await askScope("edit");
      setScopeAsk(null);
      if (!chosen) return;
      scope = chosen;
    }
    await saveDraft(draft, original, scope);
    setEditor(null);
    ui.toast(original ? "Evento atualizado" : draft.calendarId === LOCAL_CALENDAR_ID ? "Evento criado no Organizador" : "Evento criado no Google Agenda");
  };

  const removeEvent = async (ev: UiEvent) => {
    let scope: EditScope = "instance";
    if (ev.source === "google" && ev.google?.recurringEventId) {
      const chosen = await askScope("delete");
      setScopeAsk(null);
      if (!chosen) return;
      scope = chosen;
    } else {
      const guests = ev.google?.attendees?.filter((a) => !a.self).length || 0;
      const ok = await ui.confirm({
        title: "Excluir evento?",
        message: `"${ev.title}"${ev.source === "local" && ev.recurring ? " e todas as repetições" : ""} será excluído${ev.source === "google" ? " do Google Agenda" : ""}.${guests ? " Os convidados serão avisados." : ""}`,
        confirmLabel: "Excluir",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await deleteUiEvent(ev, scope, true);
      setSelected(null);
      setEditor(null);
      ui.toast("Evento excluído");
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : "Não foi possível excluir o evento.");
    }
  };

  const duplicate = (ev: UiEvent) => {
    const draft = draftFromEvent(ev);
    setSelected(null);
    setEditor({ draft: { ...draft, title: `${draft.title} (cópia)`, repeat: draft.repeat === "custom" ? "none" : draft.repeat, calendarId: ev.source === "google" && !ev.readOnly ? ev.calendarId : defaultCalendar } });
  };

  const respond = async (ev: UiEvent, status: "accepted" | "declined" | "tentative") => {
    try {
      await respondEvent(ev.calendarId, ev.id, status);
      setSelected(null);
      ui.toast("Resposta enviada ao organizador");
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : "Não foi possível responder.");
    }
  };

  /* atalhos de teclado, como no Google Agenda */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']");
      if (typing || e.ctrlKey || e.metaKey || e.altKey || editor || selected || scopeAsk || uiState.paletteOpen || uiState.captureOpen || uiState.taskId || uiState.assistantOpen || uiState.confirm) return;
      const k = e.key.toLowerCase();
      const v = VIEWS.find((x) => x.key === k);
      if (v) {
        e.preventDefault();
        setView(v.value);
      } else if (k === "t") {
        e.preventDefault();
        setAnchor(new Date());
      } else if (k === "c") {
        e.preventDefault();
        openCreate();
      } else if (k === "arrowleft") {
        setAnchor((a) => shift(view, a, -1));
      } else if (k === "arrowright") {
        e.preventDefault();
        setAnchor((a) => shift(view, a, 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggleHidden = (id: string) => setPrefs({ hidden: prefs.hidden.includes(id) ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id] });

  const days = useMemo(() => Array.from({ length: view === "day" ? 1 : 7 }, (_, i) => addDaysDate(range.from, i)), [view, range.from.getTime()]);
  const marked = useMemo(() => new Set(events.map((e) => ymd(e.start))), [events]);

  const side = (
    <aside className={cx("cal-side", sideOpen && "open")}>
      <button className="btn primary cal-create" onClick={() => openCreate()}>
        <Plus size={18} /> Criar
      </button>
      <MiniMonth
        value={anchor}
        marked={marked}
        onChange={(d) => {
          setAnchor(d);
          setQuery("");
          setSideOpen(false);
        }}
      />

      <div className="cal-connect">
        {!gcal.checked ? (
          <span className="muted row">
            <Loader2 size={13} className="spin" /> Verificando Google Agenda…
          </span>
        ) : gcal.connected ? (
          <>
            <div className="row" style={{ gap: 6 }}>
              <span className="g-dot" />
              <span className="grow ellipsis" title={gcal.email || ""}>
                <strong style={{ fontWeight: 500 }}>Google Agenda</strong>
                <br />
                <span className="muted" style={{ fontSize: 12 }}>
                  {gcal.email}
                </span>
              </span>
              <button className="icon-btn" title="Atualizar agendas" aria-label="Atualizar agendas" onClick={() => loadCalendars().catch((e) => ui.toast(e.message))}>
                <RefreshCw size={14} />
              </button>
              <button className="icon-btn" title="Desconectar" aria-label="Desconectar Google Agenda" onClick={disconnect}>
                <LogOut size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            <strong style={{ fontSize: 13.5 }}>Conecte seu Google Agenda</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Veja, crie e edite seus eventos do Google aqui mesmo, com convidados, Meet e lembretes.
            </span>
            <button className="btn g-btn" onClick={connect} disabled={connecting || !gcal.configured}>
              {connecting ? <Loader2 size={15} className="spin" /> : <Link2 size={15} />} Conectar Google Agenda
            </button>
            {!gcal.configured && (
              <span className="red" style={{ fontSize: 12 }}>
                A integração ainda não foi configurada no servidor.
              </span>
            )}
            {gcal.error && (
              <span className="red" style={{ fontSize: 12 }}>
                {gcal.error}
              </span>
            )}
          </>
        )}
      </div>

      {gcal.connected && gcal.calendars.length > 0 && (
        <div className="cal-list">
          <div className="side-group">Minhas agendas</div>
          {gcal.calendars.map((c) => (
            <div key={c.id} className="cal-layer">
              <Checkbox checked={!prefs.hidden.includes(c.id)} onChange={() => toggleHidden(c.id)} label={`Mostrar ${c.summary}`} />
              <i className="cal-color" style={{ background: c.backgroundColor }} />
              <span className="grow ellipsis" title={c.summary}>
                {c.summary}
              </span>
              {(c.accessRole === "owner" || c.accessRole === "writer") && (
                <button
                  className={cx("icon-btn cal-star", defaultCalendar === c.id && "on")}
                  title={defaultCalendar === c.id ? "Agenda padrão para novos eventos" : "Usar como padrão para novos eventos"}
                  aria-label="Agenda padrão"
                  onClick={() => setPrefs({ defaultCalendarId: c.id })}
                >
                  <Star size={13} fill={defaultCalendar === c.id ? "currentColor" : "none"} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="cal-list">
        <div className="side-group">Organizador</div>
        {APP_LAYERS.map((l) => (
          <div key={l.id} className="cal-layer">
            <Checkbox checked={!prefs.hidden.includes(l.id)} onChange={() => toggleHidden(l.id)} label={`Mostrar ${l.label}`} />
            <i className="cal-color" style={{ background: l.color }} />
            <span className="grow ellipsis">{l.label}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: "8px 4px 0" }}>
        Atalhos: C criar · T hoje · D/W/M/A visualização · ←/→ navegar
      </p>
    </aside>
  );

  return (
    <div className="cal-page">
      {side}
      {sideOpen && <div className="cal-side-backdrop" onClick={() => setSideOpen(false)} />}
      <section className="cal-main">
        <header className="cal-toolbar">
          <button className="icon-btn cal-menu" aria-label="Mostrar agendas" onClick={() => setSideOpen(true)}>
            <Menu size={18} />
          </button>
          <button className="btn" onClick={() => (setAnchor(new Date()), setQuery(""))}>
            Hoje
          </button>
          {!searching && (
            <span className="row" style={{ gap: 0 }}>
              <button className="icon-btn" aria-label="Anterior" onClick={() => setAnchor((a) => shift(view, a, -1))}>
                <ChevronLeft size={18} />
              </button>
              <button className="icon-btn" aria-label="Próximo" onClick={() => setAnchor((a) => shift(view, a, 1))}>
                <ChevronRight size={18} />
              </button>
            </span>
          )}
          <h1 className="cal-title">{capitalize(range.label)}</h1>
          {loading && <Loader2 size={16} className="spin muted" />}
          <span className="grow" />
          <div className="cal-search">
            <Search size={14} className="muted" />
            <input id="cal-search" placeholder="Pesquisar eventos" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  e.currentTarget.blur();
                }
              }}
              aria-label="Pesquisar eventos"
            />
            {query && (
              <button className="icon-btn" aria-label="Limpar pesquisa" onClick={() => setQuery("")}>
                <X size={13} />
              </button>
            )}
          </div>
          {!searching && (
            <div className="seg" role="tablist" aria-label="Visualização">
              {VIEWS.map((v) => (
                <button key={v.value} role="tab" aria-selected={view === v.value} className={cx(view === v.value && "on")} onClick={() => setView(v.value)} title={`${v.label} (${v.key.toUpperCase()})`}>
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </header>
        {error && <div className="ai-error" style={{ margin: "0 16px 8px" }}>{error}</div>}

        <div className="cal-body">
          {searching ? (
            <AgendaView events={events} from={range.from} days={range.days} handlers={handlers} emptyText="Nenhum evento encontrado." />
          ) : view === "month" ? (
            <MonthView anchor={anchor} events={events} handlers={handlers} />
          ) : view === "agenda" ? (
            <AgendaView events={events} from={range.from} days={range.days} handlers={handlers} emptyText="Nenhum evento nos próximos 30 dias." />
          ) : (
            <TimeGridView days={days} events={events} handlers={handlers} />
          )}
        </div>
        <button className="cal-fab" aria-label="Criar evento" onClick={() => openCreate()}>
          <Plus size={22} />
        </button>
      </section>

      {selected && (
        <EventDetails
          ev={selected.ev}
          anchor={selected.rect}
          calendars={gcal.calendars}
          onClose={() => setSelected(null)}
          onEdit={() => {
            const ev = selected.ev;
            setSelected(null);
            setEditor({ draft: draftFromEvent(ev), original: ev });
          }}
          onDelete={() => removeEvent(selected.ev)}
          onDuplicate={() => duplicate(selected.ev)}
          onRespond={(s) => respond(selected.ev, s)}
          onOpenApp={() => {
            const ev = selected.ev;
            setSelected(null);
            if (ev.source === "task") ui.openTask(ev.id);
            else if (ev.path) navigate(ev.path);
          }}
          onToggleTask={() => {
            toggleTask(selected.ev.id);
            setSelected(null);
          }}
        />
      )}

      {editor && (
        <EventEditor
          key={editor.original?.key || "novo"}
          initial={editor.draft}
          editing={!!editor.original}
          calendars={gcal.calendars}
          connected={gcal.connected}
          isInstance={!!editor.original?.google?.recurringEventId}
          onSave={saveEditor}
          onDelete={editor.original ? () => removeEvent(editor.original!) : undefined}
          onClose={() => setEditor(null)}
          onConnect={connect}
        />
      )}

      {scopeAsk && (
        <ScopeDialog
          action={scopeAsk.action}
          onChoose={(s) => scopeAsk.resolve(s)}
          onCancel={() => {
            scopeAsk.resolve(null);
            setScopeAsk(null);
          }}
        />
      )}
    </div>
  );
}
