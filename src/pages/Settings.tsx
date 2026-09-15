import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { CommitInput } from "../components/common";
import { MODULES } from "../components/Sidebar";
import { clearAll, deleteCategory, deleteProject, insert, patch, remove, replaceState, resetToSeed, setState, STATE_VERSION, useApp } from "../lib/store";
import type { AppState, TxKind } from "../lib/types";
import { ui } from "../lib/ui";
import { cx, moneyPlain, parseMoney, uid } from "../lib/util";

export function SettingsPage() {
  const state = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newProject, setNewProject] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newCatKind, setNewCatKind] = useState<TxKind>("saida");

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `organizador-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.toast("Backup exportado");
  };

  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as AppState;
      if (!data || data.version !== STATE_VERSION || !Array.isArray(data.tasks)) throw new Error("formato");
      const ok = await ui.confirm({ title: "Importar backup?", message: "Os dados atuais serão substituídos pelos do arquivo.", confirmLabel: "Importar", danger: true });
      if (!ok) return;
      replaceState(data);
      ui.toast("Backup importado");
    } catch {
      ui.toast("Esse arquivo não é um backup válido do organizador");
    }
  };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1 className="page-title">Configurações</h1>
      </div>

      <section className="settings-section">
        <h2>Perfil</h2>
        <p>Seu nome aparece na saudação do Hoje.</p>
        <CommitInput value={state.profile.name} placeholder="Seu nome" ariaLabel="Seu nome" onCommit={(name) => setState((s) => ({ ...s, profile: { ...s.profile, name: name.trim() } }))} />
      </section>

      <section className="settings-section">
        <h2>Aparência</h2>
        <p>"Sistema" segue o tema do computador ou celular.</p>
        <div className="row">
          {(
            [
              ["system", "Sistema"],
              ["light", "Claro"],
              ["dark", "Escuro"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={cx("chip-toggle", state.settings.theme === v && "on")} onClick={() => setState((s) => ({ ...s, settings: { ...s.settings, theme: v } }))}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Projetos</h2>
        <p>Agrupam tarefas. Excluir um projeto não apaga as tarefas.</p>
        <div className="list-edit">
          {state.projects.map((p) => (
            <div key={p.id}>
              <CommitInput className="input bare" value={p.name} ariaLabel="Nome do projeto" onCommit={(name) => name.trim() && patch("projects", p.id, { name: name.trim() })} />
              <span className="muted num" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                {state.tasks.filter((t) => t.projectId === p.id && t.status !== "done").length} abertas
              </span>
              <button className="icon-btn" aria-label={`Excluir projeto ${p.name}`} onClick={() => deleteProject(p.id)}>
                <X size={14} />
              </button>
            </div>
          ))}
          <div>
            <input
              id="new-project"
              className="input bare"
              placeholder="+ Novo projeto"
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newProject.trim()) {
                  insert("projects", { id: uid(), name: newProject.trim() });
                  setNewProject("");
                }
              }}
            />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>Categorias financeiras</h2>
        <p>O limite mensal é o padrão de cada mês. Dá para ajustar mês a mês na aba Orçamento.</p>
        <div className="list-edit">
          {state.categories.map((c) => (
            <div key={c.id}>
              <CommitInput className="input bare" value={c.name} ariaLabel="Nome da categoria" onCommit={(name) => name.trim() && patch("categories", c.id, { name: name.trim() })} />
              <span className={cx("pill", c.kind === "entrada" && "green")}>{c.kind === "entrada" ? "Entrada" : "Saída"}</span>
              {c.kind === "saida" && (
                <span className="row" style={{ gap: 2, width: 140 }}>
                  <span className="muted">R$</span>
                  <CommitInput
                    className="input bare num"
                    value={c.limit ? moneyPlain(c.limit) : ""}
                    placeholder="sem limite"
                    ariaLabel={`Limite mensal de ${c.name}`}
                    onCommit={(v) => patch("categories", c.id, { limit: parseMoney(v) || 0 })}
                  />
                </span>
              )}
              <button
                className="icon-btn"
                aria-label={`Excluir categoria ${c.name}`}
                onClick={async () => {
                  const ok = await ui.confirm({ title: `Excluir "${c.name}"?`, message: "Os lançamentos dessa categoria ficam sem categoria.", confirmLabel: "Excluir", danger: true });
                  if (ok) deleteCategory(c.id);
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div>
            <input id="new-category" className="input bare" placeholder="+ Nova categoria" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <select id="new-category-kind" className="select bare" style={{ width: 110 }} value={newCatKind} onChange={(e) => setNewCatKind(e.target.value as TxKind)} aria-label="Tipo da categoria">
              <option value="saida">Saída</option>
              <option value="entrada">Entrada</option>
            </select>
            <button
              className="btn sm"
              disabled={!newCat.trim()}
              onClick={() => {
                insert("categories", { id: uid(), name: newCat.trim(), kind: newCatKind, limit: 0 });
                setNewCat("");
              }}
            >
              <Plus size={14} /> Adicionar
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>Modelos de roteiro</h2>
        <p>Seções criadas ao aplicar o modelo num vídeo. Uma seção por linha.</p>
        <div className="stack" style={{ gap: 12 }}>
          {state.scriptTemplates.map((t) => (
            <div key={t.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ marginBottom: 6 }}>
                <CommitInput className="input bare" value={t.name} ariaLabel="Nome do modelo" onCommit={(name) => name.trim() && patch("scriptTemplates", t.id, { name: name.trim() })} />
                <button className="icon-btn" aria-label={`Excluir modelo ${t.name}`} onClick={() => remove("scriptTemplates", t.id)}>
                  <X size={14} />
                </button>
              </div>
              <textarea
                className="textarea"
                rows={Math.max(3, t.sections.length)}
                aria-label={`Seções do modelo ${t.name}`}
                defaultValue={t.sections.join("\n")}
                onBlur={(e) => patch("scriptTemplates", t.id, { sections: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
              />
            </div>
          ))}
          <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => insert("scriptTemplates", { id: uid(), name: "Novo modelo", sections: ["Gancho", "Conteúdo", "Chamada para ação"] })}>
            <Plus size={14} /> Novo modelo
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Dados</h2>
        <p>Por enquanto tudo fica salvo neste navegador. Exporte um backup de vez em quando.</p>
        <div className="row wrap">
          <button className="btn" onClick={exportData}>
            Exportar backup (.json)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Importar backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0]).finally(() => (e.target.value = ""))} />
          <button
            className="btn"
            onClick={async () => {
              const ok = await ui.confirm({ title: "Restaurar dados de exemplo?", message: "Tudo o que você cadastrou será substituído pelos exemplos.", confirmLabel: "Restaurar", danger: true });
              if (ok) {
                resetToSeed();
                ui.toast("Dados de exemplo restaurados");
              }
            }}
          >
            Restaurar exemplos
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              const ok = await ui.confirm({ title: "Apagar tudo?", message: "Tarefas, notas, vídeos, hábitos, rotinas e finanças serão apagados deste navegador. Não dá para desfazer.", confirmLabel: "Apagar tudo", danger: true });
              if (ok) {
                clearAll();
                ui.toast("Tudo apagado. Comece do zero.");
              }
            }}
          >
            Apagar tudo
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Atalhos</h2>
        <div className="list-edit">
          <div>
            <span className="grow">Buscar em tudo</span>
            <span className="pill">Ctrl K</span>
          </div>
          <div>
            <span className="grow">Captura rápida (fora de campos de texto)</span>
            <span className="pill">N</span>
          </div>
          <div>
            <span className="grow">Comandos do editor (títulos, listas, checklist)</span>
            <span className="pill">/</span>
          </div>
          <div>
            <span className="grow">Fechar janela ou painel</span>
            <span className="pill">Esc</span>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          Módulos: {MODULES.map((m) => m.label).join(" · ")}
        </p>
      </section>
    </div>
  );
}
