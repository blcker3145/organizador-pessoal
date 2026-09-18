import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckSquare,
  ChevronDown,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  ImagePlus,
  Pin,
  Plus,
  Settings2,
  Star,
  Tag,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { BlockEditor } from "../components/BlockEditor";
import { LabelChip, pickImage, Popover, PopItem } from "../components/creatives/Board";
import { LabelPicker } from "../components/creatives/BoardTools";
import { checklistProgress, dueState, dueText } from "../lib/board";
import { AiFieldButton } from "../components/AiWriter";
import { AutoTextarea, Checkbox, Empty, Modal } from "../components/common";
import { blocksToMarkdown } from "../lib/ai";
import { CREATIVE_CHANNELS, CREATIVE_FORMATS, CREATIVE_STAGES, imageFileToDataUrl } from "../lib/creatives";
import { relativeDate, today } from "../lib/dates";
import {
  appStore,
  createTask,
  moveCreative,
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

  const hasTexts = !!(creative.headline || creative.bodyText || creative.cta || creative.slides.length);
  const hasExtras = !!(creative.channels.length || creative.size || creative.fileUrl || creative.palette.length || creative.fonts || creative.references.length);

  return (
    <div className="page cd-page">
      <div className="cd-top">
        <button className="btn ghost sm" onClick={() => navigate("/criativos")}>
          <ArrowLeft size={14} /> Criativos
        </button>
        <span className="grow" />
        <CoverButton creative={creative} />
        <button
          className={cx("icon-btn", creative.pinned && "on-accent")}
          onClick={() => set({ pinned: !creative.pinned })}
          aria-label={creative.pinned ? "Desafixar do topo" : "Fixar no topo da lista"}
          title={creative.pinned ? "Fixado no topo da lista" : "Fixar no topo da lista"}
        >
          <Pin size={16} fill={creative.pinned ? "currentColor" : "none"} />
        </button>
        {creative.fileUrl && (
          <a className="icon-btn" href={creative.fileUrl} target="_blank" rel="noreferrer" aria-label="Abrir arquivo" title="Abrir arquivo">
            <ExternalLink size={16} />
          </a>
        )}
        <button className={cx("icon-btn", fav && "on")} onClick={() => toggleFavorite("creative", creative.id)} aria-label={fav ? "Tirar dos favoritos" : "Favoritar"} title="Favorito na barra lateral">
          <Star size={16} fill={fav ? "currentColor" : "none"} />
        </button>
        <button className="icon-btn" onClick={del} aria-label="Excluir criativo" title="Excluir">
          <Trash2 size={16} />
        </button>
      </div>

      {creative.cover && (
        <div className="cp-cover">
          <img src={creative.cover} alt="" />
        </div>
      )}

      <AutoTextarea
        className="title-input cd-title"
        value={creative.title}
        placeholder="Nome do criativo"
        aria-label="Nome do criativo"
        autoFocus={!creative.title}
        onChange={(e) => set({ title: e.target.value.replace(/\n/g, "") })}
      />

      {/* o essencial, numa linha só, como no Trello */}
      <div className="cd-meta">
        <div className="cd-meta-item">
          <span className="cd-meta-k">Lista</span>
          <label className="cd-chip select-chip">
            <select value={creative.columnId || ""} onChange={(e) => moveCreative(creative.id, e.target.value, null)} aria-label="Lista do quadro">
              {state.creativeBoard.columns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.title}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
        </div>
        <div className="cd-meta-item">
          <span className="cd-meta-k">Etiquetas</span>
          <div className="row wrap" style={{ gap: 4 }}>
            <CardLabels creative={creative} />
          </div>
        </div>
        <div className="cd-meta-item">
          <span className="cd-meta-k">Datas</span>
          <DatesChip creative={creative} />
        </div>
        <div className="cd-meta-item">
          <span className="cd-meta-k">Etapa</span>
          <label className="cd-chip select-chip">
            <select value={creative.stage} onChange={(e) => set({ stage: e.target.value as CreativeStage })} aria-label="Etapa">
              {CREATIVE_STAGES.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
        </div>
        <div className="cd-meta-item">
          <span className="cd-meta-k">Cliente</span>
          <label className="cd-chip">
            <input className="cd-chip-input" list="creative-clients" placeholder="Perfil próprio" value={creative.client} onChange={(e) => set({ client: e.target.value })} aria-label="Cliente ou marca" />
            <datalist id="creative-clients">
              {clients.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <div className="cd-meta-item">
          <span className="cd-meta-k">Formato</span>
          <label className="cd-chip select-chip">
            <select value={creative.format} onChange={(e) => changeFormat(e.target.value)} aria-label="Formato">
              {CREATIVE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.value}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
        </div>
      </div>

      <div className="cd-main">
        <section className="cd-sec">
          <h2 className="cd-sec-title">
            <AlignLeft size={16} /> Descrição
          </h2>
          <BlockEditor
            blocks={creative.briefing}
            onChange={(briefing) => set({ briefing })}
            emptyHint="Objetivo, público, mensagem, links… digite '/' para títulos e listas"
            aiContext={creativeContext(creative) + ". Este texto é o briefing"}
          />
        </section>

        <CardChecklist creative={creative} />

        <details className="cd-sec cd-fold" open={hasTexts || undefined}>
          <summary className="cd-sec-title">
            <Type size={16} /> Textos da peça
            <ChevronDown size={15} className="cd-fold-ico" />
          </summary>
          <div className="stack" style={{ gap: 10, marginTop: 8 }}>
            <div className="field">
              <span className="row">
                <label htmlFor="creative-headline">Título / headline</label>
                <AiFieldButton label="Headline" value={creative.headline} onChange={(headline) => set({ headline })} context={creativeContext(creative)} />
              </span>
              <input id="creative-headline" className="input" value={creative.headline} placeholder="A frase principal da arte" onChange={(e) => set({ headline: e.target.value })} />
            </div>
            <div className="field">
              <span className="row">
                <label htmlFor="creative-body">Texto de apoio</label>
                <AiFieldButton label="Texto de apoio" value={creative.bodyText} onChange={(bodyText) => set({ bodyText })} context={creativeContext(creative)} />
              </span>
              <textarea id="creative-body" className="textarea" rows={3} value={creative.bodyText} placeholder="Texto secundário, informações, legenda da arte" onChange={(e) => set({ bodyText: e.target.value })} />
            </div>
            <div className="field">
              <span className="row">
                <label htmlFor="creative-cta">Chamada para ação</label>
                <AiFieldButton label="Chamada para ação" value={creative.cta} onChange={(cta) => set({ cta })} context={creativeContext(creative)} />
              </span>
              <input id="creative-cta" className="input" value={creative.cta} placeholder="Ex.: Me chama no direct" onChange={(e) => set({ cta: e.target.value })} />
            </div>
            {showSlides ? (
              <Slides creative={creative} />
            ) : (
              <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => set({ slides: [{ id: uid(), text: creative.headline }] })}>
                <Plus size={14} /> Dividir em slides / telas
              </button>
            )}
          </div>
        </details>

        <Moodboard creative={creative} />

        <details className="cd-sec cd-fold" open={hasExtras || undefined}>
          <summary className="cd-sec-title">
            <Settings2 size={16} /> Produção e referências
            <ChevronDown size={15} className="cd-fold-ico" />
          </summary>
          <div className="cd-extra">
            <section>
              <div className="cd-sec-title sub">Ficha</div>
              <dl className="cd-dl">
                <dt>Tamanho</dt>
                <dd>
                  <input className="input bare num" placeholder="1080×1350" value={creative.size} onChange={(e) => set({ size: e.target.value })} aria-label="Tamanho" />
                </dd>
                <dt>Arquivo</dt>
                <dd>
                  <input className="input bare" placeholder="Link do Figma, Canva…" value={creative.fileUrl} onChange={(e) => set({ fileUrl: e.target.value })} aria-label="Link do arquivo" />
                </dd>
                {note && (
                  <>
                    <dt>Ideia</dt>
                    <dd>
                      <button className="link ellipsis" onClick={() => navigate(`/ideias/${note.id}`)}>
                        {note.title || "Sem título"} ↗
                      </button>
                    </dd>
                  </>
                )}
              </dl>
              <div className="cd-channels">
                {CREATIVE_CHANNELS.map((ch) => {
                  const on = creative.channels.includes(ch);
                  return (
                    <button
                      key={ch}
                      className={cx("cd-channel", on && "on")}
                      aria-pressed={on}
                      onClick={() => set({ channels: on ? creative.channels.filter((x) => x !== ch) : [...creative.channels, ch] })}
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
            </section>
            <VisualIdentity creative={creative} />
            <CreativeTasks creative={creative} />
            <CreativeLinks creative={creative} />
          </div>
        </details>
      </div>
    </div>
  );
}

function DatesChip({ creative }: { creative: Creative }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const set = (c: Partial<Creative>) => patchCreative(creative.id, c);
  const text = dueText(creative);
  const state = dueState(creative);
  return (
    <>
      <button className={cx("cd-chip", creative.dueDate && `due-${state}`)} onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())}>
        <Clock size={13} />
        {text || "Adicionar"}
        {creative.dueDate && creative.dueTime && <span className="muted">· {creative.dueTime}</span>}
        {creative.dueDate && state === "done" && <Check size={13} />}
      </button>
      {rect && (
        <Popover anchor={rect} onClose={() => setRect(null)} width={290}>
          <div className="pop-title">Datas</div>
          <div className="cd-dates">
            <label className="ee-label-stack">
              Início
              <input className="input" type="date" value={creative.startDate || ""} max={creative.dueDate || undefined} onChange={(e) => set({ startDate: e.target.value || null })} />
            </label>
            <div className="cd-dates-row">
              <label className="ee-label-stack grow">
                Entrega
                <input className="input" type="date" value={creative.dueDate || ""} onChange={(e) => set({ dueDate: e.target.value || null })} />
              </label>
              <label className="ee-label-stack">
                Hora
                <input className="input" type="time" value={creative.dueTime} disabled={!creative.dueDate} onChange={(e) => set({ dueTime: e.target.value })} />
              </label>
            </div>
            {creative.dueDate && (
              <label className="row" style={{ gap: 8, cursor: "pointer", fontSize: 13.5 }}>
                <Checkbox checked={creative.dueDone} onChange={(v) => set({ dueDone: v })} label="Concluído" /> Marcar como concluído
                <span className="grow" />
                <span className="muted">{relativeDate(creative.dueDate)}</span>
              </label>
            )}
            {(creative.startDate || creative.dueDate) && (
              <button className="btn sm" onClick={() => (set({ startDate: null, dueDate: null, dueTime: "", dueDone: false }), setRect(null))}>
                Remover datas
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}

function CoverButton({ creative }: { creative: Creative }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [url, setUrl] = useState("");
  const set = (cover: string | null) => patchCreative(creative.id, { cover });
  return (
    <>
      <button className="btn sm" onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())}>
        <ImageIcon size={14} /> Capa
      </button>
      {rect && (
        <Popover anchor={rect} onClose={() => setRect(null)}>
          <div className="pop-title">Capa do cartão</div>
          {creative.cover && (
            <div className="pop-preview">
              <img src={creative.cover} alt="" />
            </div>
          )}
          <PopItem
            icon={<ImageIcon size={15} />}
            onClick={async () => {
              setRect(null);
              const img = await pickImage(1000);
              if (img) set(img);
            }}
          >
            {creative.cover ? "Trocar imagem" : "Enviar imagem"}
          </PopItem>
          {creative.moodboard.length > 0 && (
            <>
              <p className="pop-hint">Ou use uma imagem do moodboard:</p>
              <div className="pop-thumbs">
                {creative.moodboard.slice(0, 8).map((m) => (
                  <button key={m.id} onClick={() => (set(m.src), setRect(null))} title="Usar como capa">
                    <img src={m.src} alt="" />
                  </button>
                ))}
              </div>
            </>
          )}
          <form
            className="pop-url"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^https?:\/\//.test(url.trim())) return ui.toast("Cole um link que comece com https://");
              set(url.trim());
              setUrl("");
              setRect(null);
            }}
          >
            <input className="input" placeholder="…ou cole o link da imagem" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link da imagem" />
          </form>
          {creative.cover && (
            <PopItem icon={<Trash2 size={15} />} danger onClick={() => (set(null), setRect(null))}>
              Remover capa
            </PopItem>
          )}
        </Popover>
      )}
    </>
  );
}

function CardLabels({ creative }: { creative: Creative }) {
  const state = useApp();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const toggle = (id: string) =>
    patchCreative(creative.id, { labelIds: creative.labelIds.includes(id) ? creative.labelIds.filter((x) => x !== id) : [...creative.labelIds, id] });
  return (
    <>
      {creative.labelIds.map((id) => {
        const l = state.creativeBoard.labels.find((x) => x.id === id);
        return l ? <LabelChip key={id} label={l} /> : null;
      })}
      <button className="btn ghost sm" onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())} aria-label="Escolher etiquetas">
        {creative.labelIds.length ? (
          <Plus size={14} />
        ) : (
          <>
            <Tag size={14} /> Adicionar
          </>
        )}
      </button>
      {rect && (
        <Popover anchor={rect} onClose={() => setRect(null)} width={300}>
          <div className="pop-title">Etiquetas</div>
          <LabelPicker selected={creative.labelIds} onToggle={toggle} />
        </Popover>
      )}
    </>
  );
}

function CardChecklist({ creative }: { creative: Creative }) {
  const [text, setText] = useState("");
  const items = creative.checklist;
  const set = (checklist: Creative["checklist"]) => patchCreative(creative.id, { checklist });
  const { done, total } = checklistProgress(items);
  const add = () => {
    const t = text.trim();
    if (!t) return;
    set([...items, { id: uid(), text: t, done: false }]);
    setText("");
  };
  return (
    <section className="cd-sec">
      <h2 className="cd-sec-title">
        <CheckSquare size={16} /> Checklist {total > 0 && <span className="muted num cd-count">{done}/{total}</span>}
      </h2>
      {total > 0 && (
        <div className="cl-bar" aria-hidden>
          <span style={{ width: `${Math.round((done / total) * 100)}%` }} className={cx(done === total && "full")} />
        </div>
      )}
      <div className="stack" style={{ gap: 2 }}>
        {items.map((it) => (
          <div key={it.id} className={cx("cl-item", it.done && "done")}>
            <Checkbox checked={it.done} onChange={(v) => set(items.map((x) => (x.id === it.id ? { ...x, done: v } : x)))} label={it.text} />
            <input className="input bare grow" value={it.text} onChange={(e) => set(items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))} aria-label="Item" />
            <button className="icon-btn" aria-label="Remover item" onClick={() => set(items.filter((x) => x.id !== it.id))}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <input
        className="input"
        style={{ marginTop: 6 }}
        placeholder="Adicionar um item e apertar Enter"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        aria-label="Novo item da checklist"
      />
    </section>
  );
}

function creativeContext(c: Creative): string {
  const brief = blocksToMarkdown(c.briefing).slice(0, 1200);
  return `Peça de design "${c.title || "sem título"}", formato ${c.format}${c.size ? ` (${c.size})` : ""}, canais ${c.channels.join(", ") || "não definidos"}${c.client ? `, cliente ${c.client}` : ""}${c.headline ? `, headline atual "${c.headline}"` : ""}${brief ? `. Briefing: ${brief}` : ""}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="cd-sec-title sub">{children}</div>;
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
      <h2 className="cd-sec-title">
        <ImageIcon size={16} /> Moodboard {creative.moodboard.length > 0 && <span className="muted num cd-count">{creative.moodboard.length}</span>}
      </h2>
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

function VisualIdentity({ creative }: { creative: Creative }) {
  const [color, setColor] = useState("#E4572E");
  const addColor = () => {
    if (creative.palette.includes(color.toUpperCase())) return;
    patchCreative(creative.id, { palette: [...creative.palette, color.toUpperCase()] });
  };
  return (
    <section>
      <div className="cd-sec-title sub">Visual</div>
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
    <section>
      <div className="cd-sec-title sub">Tarefas {tasks.length > 0 && `${done}/${tasks.length}`}</div>
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
    <section>
      <div className="cd-sec-title sub">Links de referência</div>
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
