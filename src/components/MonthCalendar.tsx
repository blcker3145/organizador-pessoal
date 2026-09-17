import { ChevronLeft, ChevronRight } from "lucide-react";
import { liftDragImage } from "../lib/motion";
import { useState, type ReactNode } from "react";
import { calendarGrid, fromISO, monthKey, monthLabel, shiftMonthKey, today } from "../lib/dates";
import type { ISODate } from "../lib/types";
import { cx } from "../lib/util";

export interface CalItem {
  id: string;
  date: ISODate;
  label: ReactNode;
  done?: boolean;
  onClick: () => void;
}

const HEAD = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export function MonthCalendar({
  items,
  onDayClick,
  onDrop,
}: {
  items: CalItem[];
  onDayClick?: (date: ISODate) => void;
  onDrop?: (id: string, date: ISODate) => void;
}) {
  const [key, setKey] = useState(monthKey(today()));
  const [over, setOver] = useState<string | null>(null);
  const d0 = today();
  const cells = calendarGrid(key);

  return (
    <div>
      <div className="cal-head">
        <strong style={{ fontSize: 16, minWidth: 150 }}>{monthLabel(key)}</strong>
        <button className="icon-btn" onClick={() => setKey(shiftMonthKey(key, -1))} aria-label="Mês anterior">
          <ChevronLeft size={16} />
        </button>
        <button className="btn sm" onClick={() => setKey(monthKey(d0))}>
          Hoje
        </button>
        <button className="icon-btn" onClick={() => setKey(shiftMonthKey(key, 1))} aria-label="Próximo mês">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="cal">
        {HEAD.map((h) => (
          <div key={h} className="cal-wd">
            {h}
          </div>
        ))}
        {cells.map((date) => {
          const dayItems = items.filter((i) => i.date === date);
          return (
            <div
              key={date}
              className={cx("cal-day", monthKey(date) !== key && "out", date === d0 && "today", over === date && "drop")}
              onClick={() => onDayClick?.(date)}
              onDragOver={(e) => {
                if (!onDrop) return;
                e.preventDefault();
                setOver(date);
              }}
              onDragLeave={() => setOver((o) => (o === date ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id && onDrop) onDrop(id, date);
              }}
            >
              <span className="cal-num num">{fromISO(date).getDate()}</span>
              {dayItems.slice(0, 4).map((it) => (
                <div
                  key={it.id}
                  className={cx("cal-item", it.done && "done")}
                  draggable={!!onDrop}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", it.id);
                    liftDragImage(e);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    it.onClick();
                  }}
                >
                  {it.label}
                </div>
              ))}
              {dayItems.length > 4 && <span className="muted" style={{ fontSize: 11 }}>+{dayItems.length - 4}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
