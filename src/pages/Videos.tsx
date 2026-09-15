import { Plus } from "lucide-react";
import { useState } from "react";
import { STAGES, Tabs, PLATFORMS, stageInfo } from "../components/common";
import { MonthCalendar } from "../components/MonthCalendar";
import { relativeDate, shortDate, today } from "../lib/dates";
import { createVideo, patchVideo, templateBlocks, useApp } from "../lib/store";
import type { Video, VideoStage } from "../lib/types";
import { navigate, usePersistedView } from "../lib/ui";
import { blocksToText, countWords, cx } from "../lib/util";

type View = "pipeline" | "calendario" | "tabela";

export function scriptWords(v: Video) {
  return countWords(blocksToText(v.script.filter((b) => !b.type.startsWith("h"))));
}

export function VideosPage() {
  const state = useApp();
  const [view, setView] = usePersistedView<View>("videos", "pipeline");
  const [platform, setPlatform] = useState("");
  const [format, setFormat] = useState("");
  const [sort, setSort] = useState<"publishDate" | "title" | "stage" | "updatedAt">("publishDate");

  const videos = state.videos.filter((v) => (!platform || v.platforms.includes(platform)) && (!format || v.format === format));

  const newVideo = (stage: VideoStage = "ideia") => {
    const tpl = state.scriptTemplates[0];
    const v = createVideo({ stage, script: tpl ? templateBlocks(tpl.sections) : undefined });
    navigate(`/videos/${v.id}`);
  };

  return (
    <div className="page wide" style={{ maxWidth: 1500 }}>
      <div className="page-head">
        <h1 className="page-title">Vídeos</h1>
        <button className="btn primary" onClick={() => newVideo()}>
          <Plus size={15} /> Novo vídeo
        </button>
      </div>
      <Tabs
        value={view}
        onChange={setView}
        items={[
          { value: "pipeline", label: "Pipeline" },
          { value: "calendario", label: "Calendário de publicação" },
          { value: "tabela", label: "Tabela" },
        ]}
      />
      <div className="filters">
        <select id="v-platform" className="select" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Plataforma">
          <option value="">Todas as plataformas</option>
          {PLATFORMS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select id="v-format" className="select" value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Formato">
          <option value="">Todos os formatos</option>
          <option value="longo">Longo</option>
          <option value="curto">Curto</option>
        </select>
      </div>

      {view === "pipeline" && <Pipeline videos={videos} onNew={newVideo} />}
      {view === "calendario" && (
        <MonthCalendar
          items={videos
            .filter((v) => v.publishDate)
            .map((v) => ({
              id: v.id,
              date: v.publishDate!,
              label: (
                <>
                  <span className={cx("pill", stageInfo(v.stage).color)} style={{ height: 16, fontSize: 10, padding: "0 4px", marginRight: 4 }}>
                    {stageInfo(v.stage).label}
                  </span>
                  {v.title || "Sem título"}
                </>
              ),
              done: v.stage === "publicado",
              onClick: () => navigate(`/videos/${v.id}`),
            }))}
          onDrop={(id, date) => patchVideo(id, { publishDate: date })}
        />
      )}
      {view === "tabela" && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {[
                  ["title", "Título"],
                  ["stage", "Etapa"],
                  ["", "Plataformas"],
                  ["", "Formato"],
                  ["publishDate", "Publicação"],
                  ["", "Roteiro"],
                  ["updatedAt", "Editado"],
                ].map(([k, label]) => (
                  <th key={label}>
                    {k ? (
                      <button className="link-btn" onClick={() => setSort(k as typeof sort)} style={{ fontWeight: sort === k ? 600 : 400 }}>
                        {label} {sort === k ? "↓" : ""}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {videos
                .slice()
                .sort((a, b) => {
                  if (sort === "title") return a.title.localeCompare(b.title);
                  if (sort === "stage") return STAGES.findIndex((s) => s.value === a.stage) - STAGES.findIndex((s) => s.value === b.stage);
                  if (sort === "updatedAt") return b.updatedAt - a.updatedAt;
                  return (a.publishDate || "9999").localeCompare(b.publishDate || "9999");
                })
                .map((v) => (
                  <tr key={v.id} className="click" onClick={() => navigate(`/videos/${v.id}`)}>
                    <td style={{ fontWeight: 500 }}>{v.title || "Sem título"}</td>
                    <td>
                      <span className={cx("pill", stageInfo(v.stage).color)}>{stageInfo(v.stage).label}</span>
                    </td>
                    <td>
                      <span className="row wrap" style={{ gap: 4 }}>
                        {v.platforms.map((p) => (
                          <span key={p} className="pill">
                            {p}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td>{v.format === "longo" ? "Longo" : "Curto"}</td>
                    <td className="num">{v.publishDate ? shortDate(v.publishDate) : <span className="muted">—</span>}</td>
                    <td className="num muted">{scriptWords(v)} palavras</td>
                    <td className="muted">{new Date(v.updatedAt).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Pipeline({ videos, onNew }: { videos: Video[]; onNew: (stage: VideoStage) => void }) {
  const state = useApp();
  const [over, setOver] = useState<VideoStage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [showAllPublished, setShowAllPublished] = useState(false);
  const d0 = today();

  return (
    <div className="board" style={{ gridAutoColumns: "minmax(180px, 1fr)" }}>
      {STAGES.map((stage) => {
        let items = videos
          .filter((v) => v.stage === stage.value)
          .sort((a, b) => (a.publishDate || "9999").localeCompare(b.publishDate || "9999"));
        const total = items.length;
        if (stage.value === "publicado") {
          items = items.sort((a, b) => (b.publishDate || "").localeCompare(a.publishDate || ""));
          if (!showAllPublished) items = items.slice(0, 3);
        }
        return (
          <div
            key={stage.value}
            className={cx("board-col", over === stage.value && "drop")}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(stage.value);
            }}
            onDragLeave={() => setOver((o) => (o === stage.value ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (!id) return;
              const v = state.videos.find((x) => x.id === id);
              patchVideo(id, { stage: stage.value, publishDate: stage.value === "publicado" && v && !v.publishDate ? d0 : v?.publishDate ?? null });
            }}
          >
            <div className="board-col-head">
              <span className={cx("pill", stage.color)}>{stage.label}</span>
              <span className="muted">{total}</span>
            </div>
            {items.map((v) => {
              const tasks = state.tasks.filter((t) => t.videoId === v.id);
              const done = tasks.filter((t) => t.status === "done").length;
              const words = scriptWords(v);
              return (
                <div
                  key={v.id}
                  className={cx("board-card", dragging === v.id && "dragging")}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", v.id);
                    setDragging(v.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => navigate(`/videos/${v.id}`)}
                >
                  <span className="c-title">{v.title || "Sem título"}</span>
                  <div className="row wrap" style={{ gap: 4 }}>
                    {v.platforms.map((p) => (
                      <span key={p} className="pill">
                        {p}
                      </span>
                    ))}
                    <span className="pill outline">{v.format === "longo" ? "Longo" : "Curto"}</span>
                  </div>
                  {(v.publishDate || tasks.length > 0 || words > 0) && (
                    <div className="row wrap muted" style={{ fontSize: 12, gap: 8 }}>
                      {v.publishDate && <span className={cx(v.publishDate < d0 && v.stage !== "publicado" && "red")}>{relativeDate(v.publishDate)}</span>}
                      {tasks.length > 0 && (
                        <span className="num">
                          Tarefas {done}/{tasks.length}
                        </span>
                      )}
                      {words > 0 && v.stage !== "publicado" && <span className="num">{words} palavras</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {stage.value === "publicado" && total > 3 && (
              <button className="link-btn" style={{ padding: "4px 6px" }} onClick={() => setShowAllPublished(!showAllPublished)}>
                {showAllPublished ? "Mostrar menos" : `Ver os ${total}`}
              </button>
            )}
            {stage.value !== "publicado" && (
              <button className="link-btn" style={{ padding: "4px 6px" }} onClick={() => onNew(stage.value)}>
                <Plus size={14} /> Novo
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
