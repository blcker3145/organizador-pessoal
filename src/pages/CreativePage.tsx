import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, ImagePlus, Plus, Star, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { BlockEditor } from "../components/BlockEditor";
import { AutoTextarea, Checkbox, Empty, Modal } from "../components/common";
import { CREATIVE_CHANNELS, CREATIVE_FORMATS, CREATIVE_STAGES, creativeStageInfo, imageFileToDataUrl } from "../lib/creatives";
import { relativeDate, today } from "../lib/dates";
import {
  appStore,
  createTask,
  deleteCreative,
  generateCreativeTasks,
  isFavorite,
  patchCreative,
  toggleFavorite,
  toggleTask,
  useApp,
} from "../lib/store";
import type { Creative, CreativeImage, CreativeStage } from "../lib/types";
import { navigate, ui } from "../lib/ui";
import { cx, uid } from "../lib/util";

export function CreativePage({ id }: { id: string }) {
  const state = useApp();
  const creative = state.creatives.find((c) => c.id === id);
  if (!creative) {
    return (
      <div className="page">
        <Empty>
          Esse criativo não existe mais. <a className="link" href="#/criativos">Voltar para Criativos</a>
        </Empty>
      </div>
    );
  }
  return <CreativeDetail creative={creative} key={creative.id} />;
}

function CreativeDetail({ creative }: { creative: Creative }) {
  const state = useApp();
  const set = (c: Partial<Creative>) => patchCreative(creative.id, c);
  const fav = isFavorite(state, "creative", creative.id);
  const note = creative.noteId ? state.notes.find((n) => n.id === creative.noteId) : null;
  const clients = useMemo(() => [...new Set(state.creatives.map((c) => c.client).filter(Boolean))], [state.creatives]);
  const showSlides = creative.format === "Carrossel" || creative.slides.length > 0;

  const del = async () => {
    const ok = await ui.confirm({
      title: "Excluir criativo?",
      message: `"${creative.title || "Sem título"}", o briefing e o moodboard serão apagados. As tarefas vinculadas continuam em Tarefas.`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    deleteCreative(creative.id);
    navigate("/criativos");
    ui.toast("Criativo excluído");
  };

  const changeFormat = (format: string) => {
    const previousDefault = CREATIVE_FORMATS.find((f) => f.value === creative.format)?.size || "";
    const nextDefault = CREATIVE_FORMATS.find((f) => f.value === format)?.size || "";
    // só troca o tamanho se ele ainda era o padrão do formato anterior
    const size = !creative.size || creative.size === previousDefault ? nextDefault : creative.size;
    set({ format, size });
  };

  return (
    <div className="page wide" style={{ maxWidth: 1180 }}>
      <div className="row wrap" style={{ marginBottom: 18, gap: 6 }}>
        <button className="btn ghost sm" onClick={() => navigate("/criativos")}>
          <ArrowLeft size={14} /> Criativos
        </button>
        <span className="grow" />
        {creative.fileUrl && (
          <a className="btn sm" href={creative.fileUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Abrir arquivo
          </a>
        )}
        <button className={cx("icon-btn", fav && "on")} onClick={() => toggleFavorite("creative", creative.id)} aria-label={fav ? "Tirar dos favoritos" : "Favoritar"} title="Favorito na barra lateral">
          <Star size={16} fill={fav ? "currentColor" : "none"} />
        </button>
        <button className="icon-btn" onClick={del} aria-label="Excluir criativo">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="video-layout">
        <div style={{ minWidth: 0 }}>
          <AutoTextarea
            className="title-input"
            value={creative.title}
            placeholder="Nome do criativo"
            aria-label="Nome do criativo"
            autoFocus={!creative.title}
            onChange={(e) => set({ title: e.target.value.replace(/\n/g, "") })}
          />
          <div className="props">
            <span className="prop-k">Etapa</span>
            <span className="prop-v">
              <select className="select bare" value={creative.stage} onChange={(e) => set({ stage: e.target.value as CreativeStage })} aria-label="Etapa">
                {CREATIVE_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className={cx("pill", creativeStageInfo(creative.stage).color)}>{creativeStageInfo(creative.stage).label}</span>
            </span>

            <span className="prop-k">Formato</span>
            <span className="prop-v">
              <select className="select bare" value={creative.format} onChange={(e) => changeFormat(e.target.value)} aria-label="Formato">
                {CREATIVE_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.value}
                  </option>
                ))}
              </select>
            </span>

            <span className="prop-k">Tamanho</span>
            <span className="prop-v">
              <input className="input bare num" style={{ width: 160 }} placeholder="Ex.: 1080×1350" value={creative.size} onChange={(e) => set({ size: e.target.value })} aria-label="Tamanho" />
            </span>

            <span className="prop-k">Canais</span>
            <span className="prop-v" style={{ gap: 4 }}>
              {CREATIVE_CHANNELS.map((ch) => {
                const on = creative.channels.includes(ch);
                return (
                  <button
                    key={ch}
                    className={cx("pill", on ? "selected" : "outline")}
                    aria-pressed={on}
                    onClick={() => set({ channels: on ? creative.channels.filter((x) => x !== ch) : [...creative.channels, ch] })}
                  >
                    {ch}
                  </button>
                );
              })}
            </span>

            <span className="prop-k">Cliente / marca</span>
            <span className="prop-v">
              <input className="input bare" style={{ width: 240 }} list="creative-clients" placeholder="Ex.: Perfil próprio" value={creative.client} onChange={(e) => set({ client: e.target.value })} aria-label="Cliente ou marca" />
              <datalist id="creative-clients">
                {clients.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </span>

            <span className="prop-k">Entrega</span>
            <span className="prop-v">
              <input className="input bare" type="date" value={creative.dueDate || ""} onChange={(e) => set({ dueDate: e.target.value || null })} aria-label="Data de entrega" />
              {creative.dueDate && <span className={cx("muted", creative.dueDate < today() && creative.stage !== "entregue" && "red")}>{relativeDate(creative.dueDate)}</span>}
            </span>

            <span className="prop-k">Arquivo</span>
            <span className="prop-v">
              <input className="input bare" style={{ width: 320 }} placeholder="Link do Figma, Canva, Drive…" value={creative.fileUrl} onChange={(e) => set({ fileUrl: e.target.value })} aria-label="Link do arquivo" />
            </span>

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

          <SectionTitle>Briefing</SectionTitle>
          <BlockEditor blocks={creative.briefing} onChange={(briefing) => set({ briefing })} emptyHint="Objetivo, público, mensagem, estilo… digite '/' para títulos e listas" />

          <SectionTitle>Textos da peça</SectionTitle>
          <div className="stack" style={{ gap: 10 }}>
            <label className="field">
              Título / headline
              <input id="creative-headline" className="input" value={creative.headline} placeholder="A frase principal da arte" onChange={(e) => set({ headline: e.target.value })} />
            </label>
            <label className="field">
              Texto de apoio
              <textarea id="creative-body" className="textarea" rows={3} value={creative.bodyText} placeholder="Texto secundário, informações, legenda da arte" onChange={(e) => set({ bodyText: e.target.value })} />
            </label>
            <label className="field">
              Chamada para ação
              <input id="creative-cta" className="input" value={creative.cta} placeholder="Ex.: Me chama no direct" onChange={(e) => set({ cta: e.target.value })} />
            </label>
          </div>

          {showSlides ? (
            <Slides creative={creative} />
          ) : (
            <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => set({ slides: [{ id: uid(), text: creative.headline }] })}>
              <Plus size={14} /> Dividir em slides / telas
            </button>
          )}

          <Moodboard creative={creative} />
        </div>

        <aside className="stack" style={{ gap: 14 }}>
          <FormatPreview creative={creative} />
          <VisualIdentity creative={creative} />
          <CreativeTasks creative={creative} />
          <CreativeLinks creative={creative} />
        </aside>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-title" style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 22 }}>
      {children}
    </div>
  );
}

function Slides({ creative }: { creative: Creative }) {
  const set = (slides: Creative["slides"]) => patchCreative(creative.id, { slides });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= creative.slides.length) return;
    const next = creative.slides.slice();
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  return (
    <>
      <SectionTitle>
        <span>Slides · {creative.slides.length}</span>
      </SectionTitle>
      <div className="stack" style={{ gap: 8 }}>
        {creative.slides.map((s, i) => (
          <div key={s.id} className="row" style={{ alignItems: "flex-start" }}>
            <span className="muted num" style={{ width: 28, paddingTop: 7, fontSize: 13 }}>
              {i + 1}
            </span>
            <AutoTextarea
              className="input"
              style={{ resize: "none", overflow: "hidden" }}
              value={s.text}
              placeholder={i === 0 ? "Capa: frase que prende" : "Texto deste slide"}
              aria-label={`Slide ${i + 1}`}
              onChange={(e) => set(creative.slides.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)))}
            />
            <span className="row" style={{ gap: 0 }}>
              <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir slide">
                <ArrowUp size={14} />
              </button>
              <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === creative.slides.length - 1} aria-label="Descer slide">
                <ArrowDown size={14} />
              </button>
              <button className="icon-btn" onClick={() => set(creative.slides.filter((x) => x.id !== s.id))} aria-label="Remover slide">
                <X size={14} />
              </button>
            </span>
          </div>
        ))}
        <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => set([...creative.slides, { id: uid(), text: "" }])}>
          <Plus size={14} /> Adicionar slide
        </button>
      </div>
    </>
  );
}

function Moodboard({ creative }: { creative: Creative }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [open, setOpen] = useState<CreativeImage | null>(null);

  const addImages = (imgs: CreativeImage[]) => {
    const current = appStore.get().creatives.find((c) => c.id === creative.id);
    if (!current || !imgs.length) return;
    patchCreative(creative.id, { moodboard: [...current.moodboard, ...imgs] });
  };

  const addFiles = async (files: FileList | File[]) => {
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      ui.toast("Solte ou cole arquivos de imagem (JPG, PNG, WEBP)");
      return;
    }
    try {
      const srcs = await Promise.all(images.map((f) => imageFileToDataUrl(f)));
      addImages(srcs.map((src, i) => ({ id: uid(), src, caption: images[i].name.replace(/\.[^.]+$/, "") })));
      ui.toast(`${srcs.length} imagem(ns) adicionada(s) ao moodboard`);
    } catch {
      ui.toast("Não foi possível ler essa imagem");
    }
  };

  const addLink = () => {
    const url = link.trim();
    if (!/^https?:\/\//.test(url)) {
      ui.toast("Cole um link de imagem começando com http:// ou https://");
      return;
    }
    addImages([{ id: uid(), src: url, caption: "" }]);
    setLink("");
  };

  const update = (id: string, changes: Partial<CreativeImage>) =>
    patchCreative(creative.id, { moodboard: creative.moodboard.map((m) => (m.id === id ? { ...m, ...changes } : m)) });

  return (
    <>
      <SectionTitle>
        <span>Moodboard · {creative.moodboard.length}</span>
      </SectionTitle>
      <div
        className={cx("drop-zone", dragOver && "over")}
        tabIndex={0}
        aria-label="Moodboard: solte, cole ou envie imagens"
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes("Files")) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }}
      >
        {creative.moodboard.length > 0 && (
          <div className="mood-grid">
            {creative.moodboard.map((m) => (
              <figure key={m.id} className="mood-item">
                <img src={m.src} alt={m.caption || "Referência"} onClick={() => setOpen(m)} />
                <button className="icon-btn mood-remove" aria-label="Remover imagem" onClick={() => patchCreative(creative.id, { moodboard: creative.moodboard.filter((x) => x.id !== m.id) })}>
                  <X size={14} />
                </button>
                <input className="input bare" value={m.caption} placeholder="Legenda" aria-label="Legenda da imagem" onChange={(e) => update(m.id, { caption: e.target.value })} />
              </figure>
            ))}
          </div>
        )}
        <div className="row wrap" style={{ justifyContent: "center", padding: creative.moodboard.length ? "10px 0 2px" : "22px 0" }}>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={14} /> Enviar imagens
          </button>
          <span className="muted" style={{ fontSize: 13 }}>
            ou arraste para cá, ou clique aqui e cole com Ctrl V
          </span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files).finally(() => (e.target.value = ""))} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input id="mood-link" className="input" placeholder="Ou cole o link de uma imagem" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} />
        <button className="btn sm" onClick={addLink} disabled={!link.trim()}>
          Adicionar
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
        As imagens enviadas são reduzidas e ficam salvas neste navegador, que tem espaço limitado. Para muitas referências, prefira links.
      </p>
      {open && (
        <Modal title={open.caption || "Referência"} onClose={() => setOpen(null)} width={900}>
          <img src={open.src} alt={open.caption || "Referência"} style={{ width: "100%", borderRadius: 6 }} />
        </Modal>
      )}
    </>
  );
}

function parseRatio(size: string): number | null {
  const m = size.match(/(\d+(?:[.,]\d+)?)\s*[×x*]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const w = Number(m[1].replace(",", "."));
  const h = Number(m[2].replace(",", "."));
  return w > 0 && h > 0 ? w / h : null;
}

function FormatPreview({ creative }: { creative: Creative }) {
  const ratio = parseRatio(creative.size);
  if (!ratio) return null;
  const [bg, fg, accent] = creative.palette;
  const width = ratio >= 1 ? 100 : Math.max(38, ratio * 100);
  return (
    <section className="card">
      <div className="card-title">
        <span>Proporção</span>
        <span className="muted num" style={{ textTransform: "none", letterSpacing: 0 }}>
          {creative.size}
        </span>
      </div>
      <div
        className="format-preview"
        style={{ aspectRatio: String(ratio), width: `${width}%`, background: bg || undefined, color: fg || undefined }}
      >
        <strong>{creative.headline || creative.title || "Headline"}</strong>
        {creative.cta && (
          <span className="format-cta" style={accent ? { background: accent, color: bg || "#fff" } : undefined}>
            {creative.cta}
          </span>
        )}
      </div>
    </section>
  );
}

function VisualIdentity({ creative }: { creative: Creative }) {
  const [color, setColor] = useState("#E4572E");
  const addColor = () => {
    if (creative.palette.includes(color.toUpperCase())) return;
    patchCreative(creative.id, { palette: [...creative.palette, color.toUpperCase()] });
  };
  return (
    <section className="card">
      <div className="card-title">Visual</div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Paleta {creative.palette.length > 0 && "· clique para copiar"}
        </span>
        <div className="row wrap" style={{ gap: 6 }}>
          {creative.palette.map((c) => (
            <span key={c} className="swatch">
              <button
                style={{ background: c }}
                aria-label={`Copiar ${c}`}
                title={c}
                onClick={() => navigator.clipboard?.writeText(c).then(() => ui.toast(`${c} copiado`), () => ui.toast(c))}
              />
              <small className="num">{c}</small>
              <button className="link-btn swatch-x" aria-label={`Remover ${c}`} onClick={() => patchCreative(creative.id, { palette: creative.palette.filter((x) => x !== c) })}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <div className="row">
          <input id="palette-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Escolher cor" style={{ width: 36, height: 30, padding: 0, border: 0, background: "none" }} />
          <input className="input num" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Código da cor" style={{ width: 100 }} />
          <button className="btn sm" onClick={addColor} disabled={!/^#[0-9a-f]{6}$/i.test(color)}>
            <Plus size={14} /> Cor
          </button>
        </div>
        <label className="field" style={{ marginTop: 6 }}>
          Tipografia
          <input id="creative-fonts" className="input" placeholder="Ex.: Títulos em Archivo Black, texto em Inter" value={creative.fonts} onChange={(e) => patchCreative(creative.id, { fonts: e.target.value })} />
        </label>
      </div>
    </section>
  );
}

function CreativeTasks({ creative }: { creative: Creative }) {
  const state = useApp();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const tasks = state.tasks.filter((t) => t.creativeId === creative.id).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const done = tasks.filter((t) => t.status === "done").length;
  const d0 = today();

  const add = () => {
    if (!title.trim()) return;
    const project = appStore.get().projects.find((p) => p.name === "Design");
    createTask({ title: title.trim(), date: date || null, creativeId: creative.id, projectId: project?.id || null });
    setTitle("");
    setDate("");
  };

  const generate = () => {
    if (!creative.dueDate) {
      ui.toast("Defina a data de entrega primeiro");
      return;
    }
    const n = generateCreativeTasks(creative.id);
    ui.toast(n ? `${n} tarefa(s) criada(s). Elas aparecem no Hoje na data certa.` : "As tarefas de produção já existem");
  };

  return (
    <section className="card">
      <div className="card-title">Produção {tasks.length > 0 && `${done}/${tasks.length}`}</div>
      {tasks.length === 0 && <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Nenhuma tarefa ligada a este criativo.</div>}
      {tasks.map((t) => (
        <div key={t.id} className={cx("task-row", t.status === "done" && "done")} style={{ padding: "4px 4px" }} onClick={() => ui.openTask(t.id)}>
          <Checkbox checked={t.status === "done"} onChange={() => toggleTask(t.id)} />
          <span className="t-title">{t.title}</span>
          {t.date && <span className={cx("muted", t.date < d0 && t.status !== "done" && "red")} style={{ fontSize: 12 }}>{relativeDate(t.date)}</span>}
        </div>
      ))}
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        <input id="creative-task-title" className="input" placeholder="Nova tarefa (ex.: Exportar em PNG)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <div className="row">
          <input id="creative-task-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data da tarefa" />
          <button className="btn sm" onClick={add} disabled={!title.trim()}>
            <Plus size={14} /> Adicionar
          </button>
        </div>
        <button className="btn ghost sm" onClick={generate} title="Cria Fechar briefing, Criar, Revisar e Entregar antes da data de entrega">
          Gerar tarefas de produção
        </button>
      </div>
    </section>
  );
}

function CreativeLinks({ creative }: { creative: Creative }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const add = () => {
    if (!url.trim() && !label.trim()) return;
    const u = url.trim() && !/^https?:\/\//.test(url.trim()) ? `https://${url.trim()}` : url.trim();
    patchCreative(creative.id, { references: [...creative.references, { id: uid(), label: label.trim() || u, url: u }] });
    setLabel("");
    setUrl("");
  };
  return (
    <section className="card">
      <div className="card-title">Links de referência</div>
      {creative.references.map((r) => (
        <div key={r.id} className="row" style={{ padding: "3px 0" }}>
          {r.url ? (
            <a className="link grow ellipsis" href={r.url} target="_blank" rel="noreferrer">
              {r.label} ↗
            </a>
          ) : (
            <span className="grow ellipsis">{r.label}</span>
          )}
          <button className="icon-btn" aria-label="Remover link" onClick={() => patchCreative(creative.id, { references: creative.references.filter((x) => x.id !== r.id) })}>
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="stack" style={{ gap: 6, marginTop: 6 }}>
        <input id="creative-ref-label" className="input" placeholder="Nome (ex.: Pinterest, Behance)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="row">
          <input id="creative-ref-url" className="input" placeholder="Link" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn sm" onClick={add}>
            Adicionar
          </button>
        </div>
      </div>
    </section>
  );
}
