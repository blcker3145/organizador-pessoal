import { ChevronRight, Search, Settings } from "lucide-react";
import { MODULES } from "../components/Sidebar";
import { ui } from "../lib/ui";

export function MorePage() {
  const extra = MODULES.filter((m) => !["/hoje", "/tarefas", "/ideias"].includes(m.path));
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Mais</h1>
      </div>
      <div className="list-edit">
        {extra.map((m) => (
          <div key={m.path} style={{ padding: 0 }}>
            <a className="side-item" href={`#${m.path}`} style={{ minHeight: 48, color: "var(--text)" }}>
              {m.icon}
              <span className="grow">{m.label}</span>
              <ChevronRight size={16} />
            </a>
          </div>
        ))}
        <div style={{ padding: 0 }}>
          <button className="side-item" style={{ minHeight: 48, color: "var(--text)" }} onClick={ui.openPalette}>
            <Search size={16} />
            <span className="grow">Buscar</span>
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ padding: 0 }}>
          <a className="side-item" href="#/config" style={{ minHeight: 48, color: "var(--text)" }}>
            <Settings size={16} />
            <span className="grow">Configurações</span>
            <ChevronRight size={16} />
          </a>
        </div>
      </div>
    </div>
  );
}
