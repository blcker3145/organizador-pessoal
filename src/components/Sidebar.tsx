import {
  CalendarCheck,
  CheckSquare,
  Clapperboard,
  FileText,
  Home,
  Lightbulb,
  Palette,
  MoreHorizontal,
  Plus,
  Repeat2,
  Search,
  Settings,
  Sun,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "../lib/store";
import { navigate, ui, useRoute } from "../lib/ui";
import { cx } from "../lib/util";

export const MODULES: { path: string; label: string; icon: ReactNode }[] = [
  { path: "/hoje", label: "Hoje", icon: <Sun size={16} /> },
  { path: "/tarefas", label: "Tarefas", icon: <CheckSquare size={16} /> },
  { path: "/ideias", label: "Ideias & Notas", icon: <Lightbulb size={16} /> },
  { path: "/videos", label: "Vídeos", icon: <Clapperboard size={16} /> },
  { path: "/criativos", label: "Criativos", icon: <Palette size={16} /> },
  { path: "/habitos", label: "Hábitos", icon: <CalendarCheck size={16} /> },
  { path: "/rotina", label: "Rotina", icon: <Repeat2 size={16} /> },
  { path: "/financas", label: "Finanças", icon: <Wallet size={16} /> },
];

function isActive(current: string, path: string) {
  return current === path || current.startsWith(path + "/");
}

export function Sidebar() {
  const { path } = useRoute();
  const state = useApp();
  const favorites = state.favorites
    .map((f) => {
      if (f.kind === "note") {
        const n = state.notes.find((x) => x.id === f.id);
        return n && { key: `n${n.id}`, label: n.title || "Sem título", path: `/ideias/${n.id}`, icon: <FileText size={15} /> };
      }
      if (f.kind === "creative") {
        const c = state.creatives.find((x) => x.id === f.id);
        return c && { key: `c${c.id}`, label: c.title || "Sem título", path: `/criativos/${c.id}`, icon: <Palette size={15} /> };
      }
      const v = state.videos.find((x) => x.id === f.id);
      return v && { key: `v${v.id}`, label: v.title || "Sem título", path: `/videos/${v.id}`, icon: <Clapperboard size={15} /> };
    })
    .filter(Boolean) as { key: string; label: string; path: string; icon: ReactNode }[];

  return (
    <nav className="sidebar" aria-label="Navegação principal">
      <div className="side-ws">
        <span className="logo">{(state.profile.name || "M")[0].toUpperCase()}</span>
        <span className="ellipsis">{state.profile.name ? `Espaço de ${state.profile.name}` : "Meu espaço"}</span>
      </div>
      <button className="side-item" onClick={ui.openPalette}>
        <Search size={16} /> Buscar <kbd>Ctrl K</kbd>
      </button>
      <button className="side-item" onClick={() => ui.openCapture()}>
        <Plus size={16} /> Captura rápida <kbd>N</kbd>
      </button>
      <div className="side-group">Módulos</div>
      {MODULES.map((m) => (
        <a key={m.path} href={`#${m.path}`} className={cx("side-item", isActive(path, m.path) && "active")}>
          {m.icon}
          {m.label}
        </a>
      ))}
      {favorites.length > 0 && (
        <>
          <div className="side-group">Favoritos</div>
          {favorites.map((f) => (
            <a key={f.key} href={`#${f.path}`} className={cx("side-item", path === f.path && "active")}>
              {f.icon}
              <span className="ellipsis">{f.label}</span>
            </a>
          ))}
        </>
      )}
      <div className="side-spacer" />
      <a href="#/config" className={cx("side-item", isActive(path, "/config") && "active")}>
        <Settings size={16} /> Configurações
      </a>
    </nav>
  );
}

export function MobileNav() {
  const { path } = useRoute();
  const items = [
    { path: "/hoje", label: "Hoje", icon: <Home size={20} /> },
    { path: "/tarefas", label: "Tarefas", icon: <CheckSquare size={20} /> },
  ];
  const inMore = ["/videos", "/criativos", "/habitos", "/rotina", "/financas", "/config", "/mais"].some((p) => isActive(path, p));
  return (
    <nav className="mobile-nav" aria-label="Navegação">
      {items.map((it) => (
        <a key={it.path} href={`#${it.path}`} className={cx(isActive(path, it.path) && "on")}>
          {it.icon}
          {it.label}
        </a>
      ))}
      <button className="plus" onClick={() => ui.openCapture()} aria-label="Captura rápida">
        <span>
          <Plus size={20} />
        </span>
      </button>
      <a href="#/ideias" className={cx(isActive(path, "/ideias") && "on")}>
        <Lightbulb size={20} />
        Ideias
      </a>
      <button className={cx(inMore && "on")} onClick={() => navigate("/mais")}>
        <MoreHorizontal size={20} />
        Mais
      </button>
    </nav>
  );
}
