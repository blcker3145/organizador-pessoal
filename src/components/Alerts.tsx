/*
 * Barrinha de avisos: sino com o número de prazos e um painel com o que está
 * atrasado, vence hoje ou está chegando.
 */
import { Bell, CalendarDays, Check, CheckSquare, Clapperboard, Palette, Wallet, X } from "lucide-react";
import { gsap } from "gsap";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { popIn, popOut } from "../lib/anim";
import { prefersReducedMotion } from "../lib/motion";
import { ALERT_KIND_LABEL, checkDesktopAlerts, completeAlert, enableDesktopAlerts, markAlertsRead, setAlertSettings, useAlerts, type Alert, type AlertLevel } from "../lib/alerts";
import { shortDate } from "../lib/dates";
import { useApp } from "../lib/store";
import { navigate, ui, useUI } from "../lib/ui";
import { cx } from "../lib/util";
import { Switch } from "./common";

const KIND_ICON = {
  task: <CheckSquare size={15} />,
  creative: <Palette size={15} />,
  video: <Clapperboard size={15} />,
  bill: <Wallet size={15} />,
  event: <CalendarDays size={15} />,
};

const DONE_LABEL = {
  task: "Concluir tarefa",
  creative: "Marcar entrega como feita",
  video: "Marcar como publicado",
  bill: "Marcar como paga",
  event: "Dispensar lembrete",
};

const GROUPS: { level: AlertLevel; title: string }[] = [
  { level: "late", title: "Atrasados" },
  { level: "today", title: "Para hoje" },
  { level: "soon", title: "Chegando" },
];

/** Sino da barra lateral (e da tela "Mais" no celular). */
export function AlertsBell({ label }: { label?: boolean }) {
  const { unread } = useAlerts();
  const { alertsOpen } = useUI();
  return (
    <button
      className={cx(label ? "side-item" : "alert-bell", alertsOpen && "on")}
      style={label ? { minHeight: 48, color: "var(--text)" } : undefined}
      onClick={() => (alertsOpen ? ui.closeAlerts() : ui.openAlerts())}
      aria-label={unread ? `Avisos: ${unread} novos` : "Avisos"}
      aria-expanded={alertsOpen}
      title="Avisos de prazo"
    >
      <span className="alert-bell-ico">
        <Bell size={16} className={cx(unread > 0 && "alert-ring")} />
        {unread > 0 && <span className="alert-badge">{unread > 9 ? "9+" : unread}</span>}
      </span>
      {label && <span className="grow">Avisos</span>}
    </button>
  );
}

export function AlertsPanel() {
  const { alertsOpen } = useUI();
  if (!alertsOpen) return null;
  return <PanelInner />;
}

function PanelInner() {
  const { list, isRead } = useAlerts();
  const settings = useApp().alerts;
  // o que estava por ler quando o painel abriu continua destacado enquanto ele fica aberto
  const [newIds] = useState(() => new Set(list.filter((a) => !isRead(a)).map((a) => a.id)));

  useEffect(() => {
    const ids = list.map((a) => a.id);
    if (ids.length) markAlertsRead(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const veilRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => popIn(panelRef.current, veilRef.current), []);
  const close = () => popOut(panelRef.current, veilRef.current, ui.closeAlerts);

  // o aviso concluído desliza para fora e a lista fecha o espaço antes de ele sumir
  const done = (a: Alert, row: HTMLElement) => {
    if (prefersReducedMotion()) return completeAlert(a);
    gsap.to(row, { x: 24, opacity: 0, duration: 0.22, ease: "power2.in" });
    gsap.to(row, { height: 0, paddingTop: 0, paddingBottom: 0, duration: 0.22, delay: 0.16, ease: "power2.inOut", onComplete: () => completeAlert(a) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(() => GROUPS.map((g) => ({ ...g, items: list.filter((a) => a.level === g.level) })).filter((g) => g.items.length), [list]);

  const open = (a: Alert) => {
    navigate(a.path);
    ui.closeAlerts();
  };

  return (
    <>
      <div className="alert-veil" ref={veilRef} onClick={close} />
      <aside className="alert-panel" ref={panelRef} role="dialog" aria-label="Avisos de prazo">
        <header className="alert-head">
          <strong>Avisos</strong>
          <span className="grow" />
          <button className="icon-btn" onClick={close} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        <div className="alert-list">
          {groups.length === 0 && (
            <div className="alert-empty">
              <Check size={20} />
              Nenhum prazo apertado por aqui.
            </div>
          )}
          {groups.map((g) => (
            <section key={g.level}>
              <div className={cx("alert-group", g.level)}>{g.title}</div>
              {g.items.map((a) => (
                <div key={a.id} className={cx("alert-row", newIds.has(a.id) && "new")}>
                  <button className="alert-open" onClick={() => open(a)}>
                    <span className={cx("alert-ico", a.level)}>{KIND_ICON[a.kind]}</span>
                    <span className="alert-text">
                      <span className="alert-title ellipsis">{a.title}</span>
                      <small>
                        {ALERT_KIND_LABEL[a.kind]} · {a.detail}
                      </small>
                    </span>
                    <span className="alert-date num">{shortDate(a.date)}</span>
                  </button>
                  <button className="alert-done" onClick={(e) => done(a, e.currentTarget.parentElement as HTMLElement)} aria-label={`Concluir: ${a.title}`} title={DONE_LABEL[a.kind]}>
                    <Check size={15} />
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>

        <footer className="alert-foot">
          <label className="alert-opt">
            Avisar sobre os próximos
            <select className="select bare" value={settings.days} onChange={(e) => setAlertSettings({ days: Number(e.target.value) })} aria-label="Janela dos avisos">
              <option value={0}>hoje</option>
              <option value={1}>1 dia</option>
              <option value={3}>3 dias</option>
              <option value={7}>7 dias</option>
              <option value={15}>15 dias</option>
            </select>
          </label>
          <Switch
            checked={settings.desktop}
            onChange={async (v) => {
              if (!v) return setAlertSettings({ desktop: false });
              const ok = await enableDesktopAlerts();
              if (!ok) ui.toast("O navegador bloqueou os avisos. Libere as notificações do site.");
              else checkDesktopAlerts();
            }}
            label="Avisar também fora do app"
          />
        </footer>
      </aside>
    </>
  );
}
