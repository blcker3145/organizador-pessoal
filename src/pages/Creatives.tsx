import { ImageIcon, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Empty, Tabs } from "../components/common";
import { CreativeBoardView, LabelChip } from "../components/creatives/Board";
import { BoardToolbar } from "../components/creatives/BoardTools";
import { MonthCalendar } from "../components/MonthCalendar";
import { CREATIVE_CHANNELS, CREATIVE_FORMATS, creativeStageInfo } from "../lib/creatives";
import { relativeDate, shortDate, today } from "../lib/dates";
import { createCreative, patchCreative, useApp } from "../lib/store";
import type { Creative, CreativeStage } from "../lib/types";
import { navigate, usePersistedView } from "../lib/ui";
import { cx } from "../lib/util";

type View = "pipeline" | "galeria" | "calendario" | "tabela";

export function CreativesPage() {
  const state = useApp();
  const [view, setView] = usePersistedView<View>("creatives", "pipeline");
  const [format, setFormat] = useState("");
  const [client, setClient] = useState("");
  const [channel, setChannel] = useState("");
  const [labelFilter, setLabelFilter] = useState<string[]>([]);

  const clients = useMemo(() => [...new Set(state.creatives.map((c) => c.client).filter(Boolean))].sort(), [state.creatives]);
  const creatives = state.creatives.filter(
    (c) =>
      (!format || c.format === format) &&
      (!client || c.client === client) &&
      (!channel || c.channels.includes(channel)) &&
      (!labelFilter.length || labelFilter.some((id) => c.labelIds.includes(id))),
  );

  const newCreative = (stage: CreativeStage = "ideia") => {
    const c = createCreative({ stage, client: client || "" });
    navigate(`/criativos/${c.id}`);
  };

  return (
    <div className={cx("page wide", view === "pipeline" && "page-board")} style={view === "pipeline" ? undefined : { maxWidth: 1500 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Criativos</h1>
          <div className="page-sub">Planejamento de peças de design: briefing, textos, moodboard e entrega.</div>
        </div>
        <button className="btn primary" onClick={() => newCreative()}>
          <Plus size={15} /> Novo criativo
        </button>
      </div>
      <Tabs
        value={view}
        onChange={setView}
        items={[
          { value: "pipeline", label: "Quadro" },
          { value: "galeria", label: "Galeria" },
          { value: "calendario", label: "Calendário de entregas" },
          { value: "tabela", label: "Tabela" },
        ]}
      />
      <div className="filters">
        <select id="c-format" className="select" value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Formato">
          <option value="">Todos os formatos</option>
          {CREATIVE_FORMATS.map((f) => (
            <option key={f.value}>{f.value}</option>
          ))}
        </select>
        <select id="c-channel" className="select" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Canal">
          <option value="">Todos os canais</option>
          {CREATIVE_CHANNELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {clients.length > 0 && (
          <select id="c-client" className="select" value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente ou marca">
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        {(format || client || channel) && (
          <button className="link-btn" onClick={() => (setFormat(""), setClient(""), setChannel(""))}>
            Limpar filtros
          </button>
        )}
      </div>

      {view === "pipeline" && (
        <>
          <BoardToolbar labelFilter={labelFilter} setLabelFilter={setLabelFilter} />
          <CreativeBoardView creatives={creatives} />
        </>
      )}
      {view === "galeria" && <Gallery creatives={creatives} />}
      {view === "calendario" && (
        <MonthCalendar
          items={creatives
            .filter((c) => c.dueDate)
            .map((c) => ({
              id: c.id,
              date: c.dueDate!,
              label: (
                <>
                  <span className={cx("pill", creativeStageInfo(c.stage).color)} style={{ height: 16, fontSize: 10, padding: "0 4px", marginRight: 4 }}>
                    {creativeStageInfo(c.stage).label}
                  </span>
                  {c.title || "Sem título"}
                </>
              ),
              done: c.stage === "entregue",
              onClick: () => navigate(`/criativos/${c.id}`),
            }))}
          onDrop={(id, date) => patchCreative(id, { dueDate: date })}
        />
      )}
      {view === "tabela" && <CreativeTable creatives={creatives} />}
    </div>
  );
}

export function Swatches({ colors, size = 14 }: { colors: string[]; size?: number }) {
  if (!colors.length) return null;
  return (
    <span className="row" style={{ gap: 3 }}>
      {colors.slice(0, 6).map((c, i) => (
        <span key={`${c}${i}`} title={c} style={{ width: size, height: size, borderRadius: 3, background: c, boxShadow: "inset 0 0 0 1px var(--line-strong)", display: "inline-block" }} />
      ))}
    </span>
  );
}

function CardMeta({ c }: { c: Creative }) {
  const state = useApp();
  const d0 = today();
  const tasks = state.tasks.filter((t) => t.creativeId === c.id);
  const done = tasks.filter((t) => t.status === "done").length;
  return (
    <>
      <div className="row wrap" style={{ gap: 4 }}>
        <span className="pill">{c.format}</span>
        {c.size && <span className="pill outline num">{c.size}</span>}
      </div>
      {(c.client || c.dueDate || tasks.length > 0 || c.palette.length > 0) && (
        <div className="row wrap muted" style={{ fontSize: 12, gap: 8 }}>
          {c.client && <span className="ellipsis" style={{ maxWidth: 120 }}>{c.client}</span>}
          {c.dueDate && <span className={cx(c.dueDate < d0 && c.stage !== "entregue" && "red")}>{relativeDate(c.dueDate)}</span>}
          {tasks.length > 0 && (
            <span className="num">
              Tarefas {done}/{tasks.length}
            </span>
          )}
          <Swatches colors={c.palette} size={11} />
        </div>
      )}
    </>
  );
}

function Gallery({ creatives }: { creatives: Creative[] }) {
  if (!creatives.length) return <Empty>Nenhum criativo encontrado.</Empty>;
  const sorted = [...creatives].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="gallery">
      {sorted.map((c) => {
        const info = creativeStageInfo(c.stage);
        return (
          <div key={c.id} className="gallery-card" onClick={() => navigate(`/criativos/${c.id}`)}>
            <div className="gallery-cover" style={c.palette[0] ? { background: c.palette[0] } : undefined}>
              {c.cover || c.moodboard[0] ? (
                <img src={c.cover || c.moodboard[0].src} alt="" />
              ) : c.headline ? (
                <span style={{ color: c.palette[1] || undefined }}>{c.headline}</span>
              ) : (
                <ImageIcon size={26} className="muted" />
              )}
            </div>
            <div className="stack" style={{ gap: 6, padding: 10 }}>
              <div className="row">
                <span className="c-title grow ellipsis" style={{ fontWeight: 500 }}>
                  {c.title || "Sem título"}
                </span>
                <span className={cx("pill", info.color)}>{info.label}</span>
              </div>
              <CardMeta c={c} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreativeTable({ creatives }: { creatives: Creative[] }) {
  const state = useApp();
  const sorted = [...creatives].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  if (!sorted.length) return <Empty>Nenhum criativo encontrado.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table" style={{ minWidth: 760 }}>
        <thead>
          <tr>
            <th>Título</th>
            <th>Lista</th>
            <th>Etiquetas</th>
            <th>Formato</th>
            <th>Canais</th>
            <th>Cliente</th>
            <th>Entrega</th>
            <th>Tarefas</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const tasks = state.tasks.filter((t) => t.creativeId === c.id);
            return (
              <tr key={c.id} className="click" onClick={() => navigate(`/criativos/${c.id}`)}>
                <td style={{ fontWeight: 500 }}>{c.title || "Sem título"}</td>
                <td className="text-2">{state.creativeBoard.columns.find((col) => col.id === c.columnId)?.title || <span className="muted">—</span>}</td>
                <td>
                  <span className="row wrap" style={{ gap: 4 }}>
                    {c.labelIds.map((id) => {
                      const l = state.creativeBoard.labels.find((x) => x.id === id);
                      return l ? <LabelChip key={id} label={l} /> : null;
                    })}
                  </span>
                </td>
                <td>
                  {c.format} {c.size && <span className="muted num">· {c.size}</span>}
                </td>
                <td>
                  <span className="row wrap" style={{ gap: 4 }}>
                    {c.channels.map((ch) => (
                      <span key={ch} className="pill">
                        {ch}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="text-2">{c.client || <span className="muted">—</span>}</td>
                <td className="num">{c.dueDate ? shortDate(c.dueDate) : <span className="muted">—</span>}</td>
                <td className="num muted">
                  {tasks.length ? `${tasks.filter((t) => t.status === "done").length}/${tasks.length}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
