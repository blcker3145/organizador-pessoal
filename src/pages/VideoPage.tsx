import { ArrowLeft, BookOpen, Copy, ExternalLink, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useState } from "react";
import { BlockEditor } from "../components/BlockEditor";
import { AiFieldButton } from "../components/AiWriter";
import { AutoTextarea, Checkbox, Empty, PLATFORMS, STAGES, stageInfo } from "../components/common";
import { relativeDate, today } from "../lib/dates";
import {
  appStore,
  createTask,
  deleteVideo,
  generateProductionTasks,
  isFavorite,
  patchVideo,
  templateBlocks,
  toggleFavorite,
  toggleTask,
  useApp,
} from "../lib/store";
import type { Video, VideoStage } from "../lib/types";
import { navigate, ui } from "../lib/ui";
import { blocksToText, cx, uid } from "../lib/util";
import { scriptWords } from "./Videos";

const WORDS_PER_MINUTE = 150;

export function VideoPage({ id }: { id: string }) {
  const state = useApp();
  const video = state.videos.find((v) => v.id === id);
  if (!video) {
    return (
      <div className="page">
        <Empty>
          Esse vídeo não existe mais. <a className="link" href="#/videos">Voltar para Vídeos</a>
        </Empty>
      </div>
    );
  }
  return <VideoDetail video={video} key={video.id} />;
}

function VideoDetail({ video }: { video: Video }) {
  const state = useApp();
  const [reading, setReading] = useState(false);
  const set = (c: Partial<Video>) => patchVideo(video.id, c);
  const fav = isFavorite(state, "video", video.id);
  const words = scriptWords(video);
  const minutes = words / WORDS_PER_MINUTE;
  const note = video.noteId ? state.notes.find((n) => n.id === video.noteId) : null;

  const del = async () => {
    const ok = await ui.confirm({
      title: "Excluir vídeo?",
      message: `"${video.title || "Sem título"}" e o roteiro serão apagados. As tarefas vinculadas continuam em Tarefas.`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    deleteVideo(video.id);
    navigate("/videos");
    ui.toast("Vídeo excluído");
  };

  const applyTemplate = async (tplId: string) => {
    const tpl = state.scriptTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    const hasContent = video.script.some((b) => b.text.trim());
    if (hasContent) {
      const ok = await ui.confirm({ title: `Aplicar modelo "${tpl.name}"?`, message: "As seções do modelo serão adicionadas no fim do roteiro atual.", confirmLabel: "Adicionar seções" });
      if (!ok) return;
      set({ script: [...video.script, ...templateBlocks(tpl.sections)] });
    } else {
      set({ script: templateBlocks(tpl.sections) });
    }
  };

  const setStage = (stage: VideoStage) => {
    set({ stage, publishDate: stage === "publicado" && !video.publishDate ? today() : video.publishDate });
  };

  return (
    <div className="page wide" style={{ maxWidth: 1180 }}>
      <div className="row wrap" style={{ marginBottom: 18, gap: 6 }}>
        <button className="back-btn" onClick={() => navigate("/videos")} aria-label="Voltar para Vídeos">
          <ArrowLeft size={18} />
          <span>Vídeos</span>
        </button>
        <span className="grow" />
        <button className="btn sm" onClick={() => setReading(!reading)}>
          {reading ? <Pencil size={14} /> : <BookOpen size={14} />} {reading ? "Editar roteiro" : "Modo leitura"}
        </button>
        <button className={cx("icon-btn", fav && "on")} onClick={() => toggleFavorite("video", video.id)} aria-label={fav ? "Tirar dos favoritos" : "Favoritar"} title="Favorito na barra lateral">
          <Star size={16} fill={fav ? "currentColor" : "none"} />
        </button>
        <button className="icon-btn" onClick={del} aria-label="Excluir vídeo">
          <Trash2 size={16} />
        </button>
      </div>

      {reading ? (
        <ReadingMode video={video} minutes={minutes} />
      ) : (
        <div className="video-layout">
          <div style={{ minWidth: 0 }}>
            <AutoTextarea
              className="title-input"
              value={video.title}
              placeholder="Título do vídeo"
              aria-label="Título do vídeo"
              autoFocus={!video.title}
              onChange={(e) => set({ title: e.target.value.replace(/\n/g, "") })}
            />
            <div className="props">
              <span className="prop-k">Etapa</span>
              <span className="prop-v">
                <select className="select bare" value={video.stage} onChange={(e) => setStage(e.target.value as VideoStage)} aria-label="Etapa">
                  {STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span className={cx("pill", stageInfo(video.stage).color)}>{stageInfo(video.stage).label}</span>
              </span>

              <span className="prop-k">Plataformas</span>
              <span className="prop-v" style={{ gap: 4 }}>
                {PLATFORMS.map((p) => {
                  const on = video.platforms.includes(p);
                  return (
                    <button
                      key={p}
                      className={cx("pill", on ? "selected" : "outline")}
                      aria-pressed={on}
                      onClick={() => set({ platforms: on ? video.platforms.filter((x) => x !== p) : [...video.platforms, p] })}
                    >
                      {p}
                    </button>
                  );
                })}
              </span>

              <span className="prop-k">Formato</span>
              <span className="prop-v">
                <select className="select bare" value={video.format} onChange={(e) => set({ format: e.target.value as Video["format"] })} aria-label="Formato">
                  <option value="longo">Longo</option>
                  <option value="curto">Curto</option>
                </select>
              </span>

              <span className="prop-k">Publicação</span>
              <span className="prop-v">
                <input className="input bare" type="date" value={video.publishDate || ""} onChange={(e) => set({ publishDate: e.target.value || null })} aria-label="Data de publicação" />
                <input className="input bare" type="time" value={video.publishTime} onChange={(e) => set({ publishTime: e.target.value })} aria-label="Horário de publicação" style={{ width: 110 }} />
                {video.publishDate && <span className="muted">{relativeDate(video.publishDate)}</span>}
              </span>

              {video.stage === "publicado" && (
                <>
                  <span className="prop-k">Link publicado</span>
                  <span className="prop-v">
                    <input className="input bare" style={{ width: 280 }} placeholder="https://" value={video.publishedUrl} onChange={(e) => set({ publishedUrl: e.target.value })} aria-label="Link publicado" />
                    {video.publishedUrl && (
                      <a className="link" href={video.publishedUrl} target="_blank" rel="noreferrer">
                        Abrir <ExternalLink size={12} />
                      </a>
                    )}
                  </span>
                </>
              )}

              {note && (
                <>
                  <span className="prop-k">Ideia de origem</span>
                  <span className="prop-v">
                    <button className="link" onClick={() => navigate(`/ideias/${note.id}`)}>
                      {note.title || "Sem título"} ↗
                    </button>
                  </span>
                </>
              )}
            </div>

            <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginBottom: 6 }}>
              <span className="card-title" style={{ margin: 0 }}>
                Roteiro
              </span>
              <span className="grow" />
              <select
                id="apply-template"
                className="select"
                style={{ width: "auto", minHeight: 28, fontSize: 13 }}
                value=""
                onChange={(e) => applyTemplate(e.target.value)}
                aria-label="Aplicar modelo de roteiro"
              >
                <option value="">Aplicar modelo…</option>
                {state.scriptTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <BlockEditor
              blocks={video.script}
              onChange={(script) => set({ script })}
              emptyHint="Escreva o roteiro ou aplique um modelo"
              aiContext={`Roteiro do vídeo "${video.title || "sem título"}", formato ${video.format === "curto" ? "curto (até 60 s)" : "longo"}, para ${video.platforms.join(", ") || "YouTube"}`}
            />
          </div>

          <aside className="stack" style={{ gap: 14 }}>
            <section className="card">
              <div className="card-title">Tamanho</div>
              <strong className="num" style={{ fontSize: 18 }}>
                {words} palavras
              </strong>
              <div className="muted">≈ {minutes < 1 ? `${Math.round(minutes * 60)} s` : `${Math.floor(minutes)} min ${Math.round((minutes % 1) * 60)} s`} de fala</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Contando {WORDS_PER_MINUTE} palavras por minuto, sem os títulos das seções.
              </div>
            </section>
            <ProductionTasks video={video} />
            <References video={video} />
            <section className="card">
              <div className="card-title">
                <span>Legenda e hashtags</span>
                <span className="grow" />
                <AiFieldButton
                  label="Legenda e hashtags"
                  value={video.caption || blocksToText(video.script).slice(0, 1500)}
                  onChange={(caption) => set({ caption })}
                  context={`Legenda para o vídeo "${video.title}" em ${video.platforms.join(", ")}. Se o texto for o roteiro, escreva a legenda a partir dele, com hashtags no final`}
                />
                <button
                  className="link-btn"
                  disabled={!video.caption}
                  onClick={() => {
                    navigator.clipboard?.writeText(video.caption).then(
                      () => ui.toast("Legenda copiada"),
                      () => ui.toast("Não foi possível copiar. Selecione o texto e use Ctrl C."),
                    );
                  }}
                >
                  <Copy size={13} /> Copiar
                </button>
              </div>
              <textarea
                id="video-caption"
                className="textarea"
                rows={5}
                placeholder="Descrição, legenda e #hashtags"
                value={video.caption}
                onChange={(e) => set({ caption: e.target.value })}
              />
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function ProductionTasks({ video }: { video: Video }) {
  const state = useApp();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const tasks = state.tasks.filter((t) => t.videoId === video.id).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const done = tasks.filter((t) => t.status === "done").length;
  const d0 = today();

  const add = () => {
    if (!title.trim()) return;
    const project = appStore.get().projects.find((p) => p.name === "Vídeos");
    createTask({ title: title.trim(), date: date || null, videoId: video.id, projectId: project?.id || null });
    setTitle("");
    setDate("");
  };

  const generate = () => {
    if (!video.publishDate) {
      ui.toast("Defina a data de publicação primeiro");
      return;
    }
    const n = generateProductionTasks(video.id);
    ui.toast(n ? `${n} tarefa(s) de produção criada(s). Elas aparecem no Hoje na data certa.` : "As tarefas de produção já existem");
  };

  return (
    <section className="card">
      <div className="card-title">
        <span>
          Produção {tasks.length > 0 && `${done}/${tasks.length}`}
        </span>
      </div>
      {tasks.length === 0 && <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Nenhuma tarefa ligada a este vídeo.</div>}
      {tasks.map((t) => (
        <div key={t.id} className={cx("task-row", t.status === "done" && "done")} style={{ padding: "4px 4px" }} onClick={() => ui.openTask(t.id)}>
          <Checkbox checked={t.status === "done"} onChange={() => toggleTask(t.id)} />
          <span className="t-title">{t.title}</span>
          {t.date && <span className={cx("muted", t.date < d0 && t.status !== "done" && "red")} style={{ fontSize: 12 }}>{relativeDate(t.date)}</span>}
        </div>
      ))}
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        <input id="prod-task-title" className="input" placeholder="Nova tarefa (ex.: Gravar B-roll)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <div className="row">
          <input id="prod-task-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data da tarefa" />
          <button className="btn sm" onClick={add} disabled={!title.trim()}>
            <Plus size={14} /> Adicionar
          </button>
        </div>
        <button className="btn ghost sm" onClick={generate} title="Cria Gravar, Editar, Thumbnail e Publicar antes da data de publicação">
          Gerar tarefas de produção
        </button>
      </div>
    </section>
  );
}

function References({ video }: { video: Video }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const add = () => {
    if (!url.trim() && !label.trim()) return;
    const u = url.trim() && !/^https?:\/\//.test(url.trim()) ? `https://${url.trim()}` : url.trim();
    patchVideo(video.id, { references: [...video.references, { id: uid(), label: label.trim() || u, url: u }] });
    setLabel("");
    setUrl("");
  };
  return (
    <section className="card">
      <div className="card-title">Referências</div>
      {video.references.map((r) => (
        <div key={r.id} className="row" style={{ padding: "3px 0" }}>
          {r.url ? (
            <a className="link grow ellipsis" href={r.url} target="_blank" rel="noreferrer">
              {r.label} ↗
            </a>
          ) : (
            <span className="grow ellipsis">{r.label}</span>
          )}
          <button className="icon-btn" aria-label="Remover referência" onClick={() => patchVideo(video.id, { references: video.references.filter((x) => x.id !== r.id) })}>
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="stack" style={{ gap: 6, marginTop: 6 }}>
        <input id="ref-label" className="input" placeholder="Nome (ex.: vídeo de inspiração)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="row">
          <input id="ref-url" className="input" placeholder="Link" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn sm" onClick={add}>
            Adicionar
          </button>
        </div>
      </div>
    </section>
  );
}

function ReadingMode({ video, minutes }: { video: Video; minutes: number }) {
  let n = 0;
  return (
    <article className="reading">
      <h1 className="page-title" style={{ fontSize: 34, marginBottom: 6 }}>
        {video.title || "Sem título"}
      </h1>
      <div className="muted" style={{ fontSize: 15 }}>
        ≈ {Math.max(1, Math.round(minutes))} min de fala
      </div>
      {video.script.map((b) => {
        n = b.type === "number" ? n + 1 : 0;
        if (b.type === "divider") return <hr key={b.id} style={{ border: 0, borderTop: "1px solid var(--line)" }} />;
        if (!b.text.trim()) return null;
        if (b.type.startsWith("h")) return <h2 key={b.id}>{b.text}</h2>;
        const prefix = b.type === "bullet" ? "• " : b.type === "number" ? `${n}. ` : b.type === "todo" ? (b.checked ? "☑ " : "☐ ") : "";
        return (
          <p key={b.id} style={b.type === "quote" ? { borderLeft: "3px solid var(--text)", paddingLeft: 16 } : undefined}>
            {prefix}
            {b.text}
          </p>
        );
      })}
    </article>
  );
}
