import { ChevronLeft, ChevronRight, MapPin, Repeat, Video } from "lucide-react";
import { liftDragImage } from "../../lib/motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addDaysDate,
  addMinutes,
  hm,
  isAllDayLike,
  layoutDay,
  meetLink,
  occursOn,
  sameDay,
  startOfDay,
  startOfMonthDate,
  startOfWeekDate,
  ymd,
  type UiEvent,
} from "../../lib/calendar";
import { capitalize, cx } from "../../lib/util";

export const HOUR_H = 48;
const SNAP = 15;
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export interface ViewHandlers {
  onSelect: (ev: UiEvent, rect: DOMRect) => void;
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
  onReschedule: (ev: UiEvent, start: Date, end: Date) => void;
  onOpenDay: (day: Date) => void;
}

const canDrag = (ev: UiEvent) => !ev.readOnly && (ev.source === "google" || ev.source === "local");

function textColor(hex: string) {
  const m = hex.replace("#", "");
  if (m.length !== 6) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 170 ? "#1f1f1f" : "#fff";
}

/* ---------------- Mini calendário ---------------- */

export function MiniMonth({ value, onChange, marked }: { value: Date; onChange: (d: Date) => void; marked?: Set<string> }) {
  const [month, setMonth] = useState(startOfMonthDate(value));
  useEffect(() => setMonth(startOfMonthDate(value)), [value.getFullYear(), value.getMonth()]);
  const start = startOfWeekDate(month);
  const today = new Date();
  return (
    <div className="mini-month">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong style={{ fontSize: 13 }}>{capitalize(month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }))}</strong>
        <span className="row" style={{ gap: 0 }}>
          <button className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft size={15} />
          </button>
          <button className="icon-btn" aria-label="Próximo mês" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight size={15} />
          </button>
        </span>
      </div>
      <div className="mini-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="mini-wd">
            {w[0].toUpperCase()}
          </span>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const d = addDaysDate(start, i);
          return (
            <button
              key={i}
              className={cx("mini-day", d.getMonth() !== month.getMonth() && "out", sameDay(d, today) && "today", sameDay(d, value) && "sel", marked?.has(ymd(d)) && "has")}
              onClick={() => onChange(d)}
              aria-label={d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Dia / Semana ---------------- */

interface DragState {
  key: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  dayDelta: number;
  minuteDelta: number;
  moved: boolean;
}

interface Selection {
  day: number;
  from: number;
  to: number;
}

export function TimeGridView({ days, events, handlers }: { days: Date[]; events: UiEvent[]; handlers: ViewHandlers }) {
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [now, setNow] = useState(new Date());
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const hasToday = days.some((d) => sameDay(d, new Date()));
    const hour = hasToday ? Math.max(0, new Date().getHours() - 2) : 7;
    el.scrollTop = hour * HOUR_H;
  }, [days.length, ymd(days[0])]);

  const allDay = events.filter(isAllDayLike);
  const timed = events.filter((e) => !isAllDayLike(e));
  const firstDay = startOfDay(days[0]);
  const lastDayEnd = addDaysDate(firstDay, days.length);

  // faixa de dia inteiro: barras que atravessam vários dias
  const bars = useMemo(() => {
    const rows: number[][] = [];
    return allDay
      .filter((e) => e.start < lastDayEnd && e.end > firstDay)
      .map((ev) => {
        const startIdx = Math.max(0, Math.floor((startOfDay(ev.start).getTime() - firstDay.getTime()) / 86_400_000));
        const endExclusive = ev.allDay ? ev.end : addDaysDate(startOfDay(ev.end), ev.end.getHours() || ev.end.getMinutes() ? 1 : 0);
        const endIdx = Math.min(days.length, Math.ceil((endExclusive.getTime() - firstDay.getTime()) / 86_400_000));
        let row = 0;
        while ((rows[row] || []).some((c) => c >= startIdx && c < Math.max(endIdx, startIdx + 1))) row++;
        rows[row] = [...(rows[row] || []), ...Array.from({ length: Math.max(1, endIdx - startIdx) }, (_, i) => startIdx + i)];
        return { ev, startIdx, span: Math.max(1, endIdx - startIdx), row };
      });
  }, [allDay, days.length, firstDay.getTime()]);
  const barRows = Math.min(4, Math.max(0, ...bars.map((b) => b.row + 1)));

  const colWidth = () => (cols.current ? cols.current.getBoundingClientRect().width / days.length : 1);
  const minuteFromY = (clientY: number) => {
    const rect = cols.current!.getBoundingClientRect();
    const m = ((clientY - rect.top) / HOUR_H) * 60;
    return Math.max(0, Math.min(24 * 60, Math.round(m / SNAP) * SNAP));
  };

  /* arrastar eventos */
  const startDrag = (e: React.PointerEvent, ev: UiEvent, mode: "move" | "resize") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!canDrag(ev)) {
      // só abre os detalhes
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ key: ev.key, mode, startX: e.clientX, startY: e.clientY, dayDelta: 0, minuteDelta: 0, moved: false });
  };

  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    const dx = e.clientX - d.startX;
    const minuteDelta = Math.round(((dy / HOUR_H) * 60) / SNAP) * SNAP;
    const dayDelta = d.mode === "move" ? Math.round(dx / colWidth()) : 0;
    const moved = d.moved || Math.abs(dy) > 4 || Math.abs(dx) > 4;
    if (minuteDelta !== d.minuteDelta || dayDelta !== d.dayDelta || moved !== d.moved) setDrag({ ...d, minuteDelta, dayDelta, moved });
  };

  const onDragEnd = (e: React.PointerEvent, ev: UiEvent) => {
    e.stopPropagation();
    const d = dragRef.current;
    // evita tratar o mesmo gesto duas vezes (alça de redimensionar + evento)
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved) {
      handlers.onSelect(ev, (e.currentTarget as HTMLElement).getBoundingClientRect());
      return;
    }
    if (d.mode === "move") {
      const start = addMinutes(addDaysDate(ev.start, d.dayDelta), d.minuteDelta);
      const end = addMinutes(addDaysDate(ev.end, d.dayDelta), d.minuteDelta);
      if (start.getTime() !== ev.start.getTime()) handlers.onReschedule(ev, start, end);
    } else {
      const end = addMinutes(ev.end, d.minuteDelta);
      if (end.getTime() - ev.start.getTime() >= SNAP * 60_000 && end.getTime() !== ev.end.getTime()) handlers.onReschedule(ev, ev.start, end);
    }
  };

  /* selecionar horário vazio para criar */
  const startSelect = (e: React.PointerEvent, dayIdx: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".tg-event")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const m = Math.floor(minuteFromY(e.clientY) / 30) * 30;
    setSelection({ day: dayIdx, from: m, to: m + 30 });
  };
  const moveSelect = (e: React.PointerEvent) => {
    if (!selection) return;
    const m = minuteFromY(e.clientY);
    const anchorStart = selection.from;
    setSelection({ ...selection, to: Math.max(anchorStart + 15, m) });
  };
  const endSelect = () => {
    if (!selection) return;
    const day = days[selection.day];
    const start = addMinutes(startOfDay(day), selection.from);
    let end = addMinutes(startOfDay(day), selection.to);
    if (selection.to - selection.from <= 30) end = addMinutes(start, 60);
    setSelection(null);
    handlers.onCreate(start, end, false);
  };

  return (
    <div className={cx("tg", days.length === 1 && "tg-single")}>
      <div className="tg-head">
        <div className="tg-gutter" />
        {days.map((d) => (
          <button key={ymd(d)} className={cx("tg-dayhead", sameDay(d, now) && "today")} onClick={() => handlers.onOpenDay(d)}>
            <span className="tg-wd">{WEEKDAYS[d.getDay()]}</span>
            <span className="tg-num">{d.getDate()}</span>
          </button>
        ))}
      </div>
      <div className="tg-allday" style={{ height: Math.max(26, barRows * 24 + 4) }}>
        <div className="tg-gutter tg-allday-label">dia inteiro</div>
        <div className="tg-allday-cols" onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const idx = Math.floor(((e.clientX - rect.left) / rect.width) * days.length);
          const d = startOfDay(days[Math.max(0, Math.min(days.length - 1, idx))]);
          handlers.onCreate(d, addDaysDate(d, 1), true);
        }}>
          {bars
            .filter((b) => b.row < 4)
            .map((b) => (
              <button
                key={b.ev.key}
                className={cx("tg-bar", b.ev.done && "done")}
                style={{
                  left: `calc(${(b.startIdx / days.length) * 100}% + 2px)`,
                  width: `calc(${(b.span / days.length) * 100}% - 4px)`,
                  top: b.row * 24 + 2,
                  background: b.ev.color,
                  color: textColor(b.ev.color),
                }}
                onClick={(e) => handlers.onSelect(b.ev, e.currentTarget.getBoundingClientRect())}
                title={b.ev.title}
              >
                {b.ev.title}
              </button>
            ))}
        </div>
      </div>
      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body" style={{ height: 24 * HOUR_H }}>
          <div className="tg-gutter tg-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * HOUR_H }}>
                {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          <div className="tg-cols" ref={cols}>
            {days.map((day, dayIdx) => {
              const placed = layoutDay(timed.filter((e) => occursOn(e, day)), day);
              const isToday = sameDay(day, now);
              return (
                <div
                  key={ymd(day)}
                  className="tg-col"
                  onPointerDown={(e) => startSelect(e, dayIdx)}
                  onPointerMove={moveSelect}
                  onPointerUp={endSelect}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="tg-slot" style={{ top: h * HOUR_H }} />
                  ))}
                  {selection && selection.day === dayIdx && (
                    <div className="tg-selection" style={{ top: (selection.from / 60) * HOUR_H, height: ((selection.to - selection.from) / 60) * HOUR_H }}>
                      {hm(addMinutes(startOfDay(day), selection.from))} – {hm(addMinutes(startOfDay(day), selection.to))}
                    </div>
                  )}
                  {placed.map((p) => {
                    const dragging = drag && drag.key === p.ev.key && drag.moved;
                    const top = (p.top / 60) * HOUR_H + (dragging && drag.mode === "move" ? (drag.minuteDelta / 60) * HOUR_H : 0);
                    const height = Math.max(18, (p.height / 60) * HOUR_H + (dragging && drag.mode === "resize" ? (drag.minuteDelta / 60) * HOUR_H : 0));
                    const dayShift = dragging && drag.mode === "move" ? drag.dayDelta : 0;
                    const width = dragging ? 100 : 100 / p.cols;
                    const short = height < 36;
                    return (
                      <div
                        key={p.ev.key + ymd(day)}
                        className={cx("tg-event", dragging && "dragging", p.ev.done && "done", canDrag(p.ev) && "draggable")}
                        style={{
                          top,
                          height: height - 2,
                          left: `calc(${(dragging ? 0 : p.col * width)}% + ${dayShift * 100}% + 1px)`,
                          width: `calc(${width}% - 3px)`,
                          background: p.ev.color,
                          color: textColor(p.ev.color),
                          zIndex: dragging ? 5 : 1 + p.col,
                        }}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => (canDrag(p.ev) ? startDrag(e, p.ev, "move") : e.stopPropagation())}
                        onPointerMove={onDragMove}
                        onPointerUp={(e) => (canDrag(p.ev) ? onDragEnd(e, p.ev) : handlers.onSelect(p.ev, e.currentTarget.getBoundingClientRect()))}
                        onKeyDown={(e) => e.key === "Enter" && handlers.onSelect(p.ev, e.currentTarget.getBoundingClientRect())}
                        title={`${p.ev.title}\n${hm(p.ev.start)} – ${hm(p.ev.end)}`}
                      >
                        <span className={cx("tg-ev-title", short && "inline")}>
                          {p.ev.title}
                          {short && <span className="tg-ev-time">, {hm(p.ev.start)}</span>}
                        </span>
                        {!short && (
                          <span className="tg-ev-time">
                            {hm(p.ev.start)} – {hm(p.ev.end)}
                            {p.ev.recurring && <Repeat size={10} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                            {meetLink(p.ev.google) && <Video size={10} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                          </span>
                        )}
                        {!short && height > 60 && p.ev.location && (
                          <span className="tg-ev-time ellipsis">
                            <MapPin size={10} style={{ verticalAlign: -1 }} /> {p.ev.location}
                          </span>
                        )}
                        {canDrag(p.ev) && (
                          <span
                            className="tg-resize"
                            onPointerDown={(e) => startDrag(e, p.ev, "resize")}
                            onPointerMove={onDragMove}
                            onPointerUp={(e) => onDragEnd(e, p.ev)}
                          />
                        )}
                      </div>
                    );
                  })}
                  {isToday && <div className="tg-now" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H }} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Mês ---------------- */

export function MonthView({ anchor, events, handlers }: { anchor: Date; events: UiEvent[]; handlers: ViewHandlers }) {
  const start = startOfWeekDate(startOfMonthDate(anchor));
  const cells = Array.from({ length: 42 }, (_, i) => addDaysDate(start, i));
  const today = new Date();
  const [over, setOver] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(events.map((e) => [e.key, e])), [events]);

  return (
    <div className="mv">
      <div className="mv-head">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mv-grid">
        {cells.map((day) => {
          const list = events.filter((e) => occursOn(e, day));
          const key = ymd(day);
          return (
            <div
              key={key}
              className={cx("mv-cell", day.getMonth() !== anchor.getMonth() && "out", over === key && "drop")}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest(".mv-chip, .mv-num, .mv-more")) return;
                const d = startOfDay(day);
                handlers.onCreate(d, addDaysDate(d, 1), true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(key);
              }}
              onDragLeave={() => setOver((o) => (o === key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const ev = byKey.get(e.dataTransfer.getData("text/plain"));
                if (!ev) return;
                const shift = startOfDay(day).getTime() - startOfDay(ev.start).getTime();
                if (shift) handlers.onReschedule(ev, new Date(ev.start.getTime() + shift), new Date(ev.end.getTime() + shift));
              }}
            >
              <button className={cx("mv-num", sameDay(day, today) && "today")} onClick={() => handlers.onOpenDay(day)}>
                {day.getDate() === 1 ? day.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }) : day.getDate()}
              </button>
              {list.slice(0, 3).map((ev) => {
                const filled = isAllDayLike(ev);
                return (
                  <button
                    key={ev.key}
                    className={cx("mv-chip", filled && "filled", ev.done && "done")}
                    style={filled ? { background: ev.color, color: textColor(ev.color) } : undefined}
                    draggable={canDrag(ev)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", ev.key);
                      liftDragImage(e);
                    }}
                    onClick={(e) => handlers.onSelect(ev, e.currentTarget.getBoundingClientRect())}
                    title={ev.title}
                  >
                    {!filled && <i style={{ background: ev.color }} />}
                    {!filled && <span className="muted num">{hm(ev.start)}</span>}
                    <span className="ellipsis">{ev.title}</span>
                  </button>
                );
              })}
              {list.length > 3 && (
                <button className="mv-more" onClick={() => handlers.onOpenDay(day)}>
                  +{list.length - 3} mais
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Lista (agenda) ---------------- */

export function AgendaView({ events, from, days, handlers, emptyText }: { events: UiEvent[]; from: Date; days: number; handlers: ViewHandlers; emptyText: string }) {
  const groups: { day: Date; items: UiEvent[] }[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDaysDate(startOfDay(from), i);
    const items = events.filter((e) => occursOn(e, day) && (sameDay(e.start, day) || isAllDayLike(e) || e.start < day));
    if (items.length) groups.push({ day, items });
  }
  const today = new Date();
  if (!groups.length) return <div className="empty" style={{ padding: 24 }}>{emptyText}</div>;
  return (
    <div className="ag">
      {groups.map(({ day, items }) => (
        <div key={ymd(day)} className="ag-day">
          <button className={cx("ag-date", sameDay(day, today) && "today")} onClick={() => handlers.onOpenDay(day)}>
            <span className="tg-num">{day.getDate()}</span>
            <span className="muted">{day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")} · {day.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
          </button>
          <div className="ag-items">
            {items.map((ev) => (
              <button key={ev.key + ymd(day)} className={cx("ag-item", ev.done && "done")} onClick={(e) => handlers.onSelect(ev, e.currentTarget.getBoundingClientRect())}>
                <i style={{ background: ev.color }} />
                <span className="ag-time num">{isAllDayLike(ev) ? "Dia inteiro" : `${hm(ev.start)} – ${hm(ev.end)}`}</span>
                <span className="grow ellipsis">
                  <strong style={{ fontWeight: 500 }}>{ev.title}</strong>
                  {ev.location && <span className="muted"> · {ev.location}</span>}
                </span>
                {meetLink(ev.google) && <Video size={14} className="muted" />}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
