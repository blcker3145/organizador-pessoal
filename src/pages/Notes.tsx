import { ArrowLeft, CheckSquare, Clapperboard, Palette, Pin, Plus, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { BlockEditor } from "../components/BlockEditor";
import { AutoTextarea, Empty, TagInput } from "../components/common";
import { relativeDate, toISO } from "../lib/dates";
import { createNote, deleteNote, isFavorite, noteToCreative, noteToTask, noteToVideo, patchNote, toggleFavorite, useApp } from "../lib/store";
import type { Note, NoteKind } from "../lib/types";
import { navigate, ui, usePersistedView } from "../lib/ui";
import { blocksToText, cx, normalize } from "../lib/util";

const KIND_LABEL: Record<NoteKind, string> = { ideia: "Ideia", nota: "Nota", video: "Ideia de vídeo", criativo: "Ideia de criativo" };
type Filter = "todas" | NoteKind;

export function NotesPage({ openId }: { openId: string | null }) {
  const state = useApp();
  const [filter, setFilter] = usePersistedView<Filter>("notes", "todas");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");

  const allTags = useMemo(() => [...new Set(state.notes.flatMap((n) => n.tags))].sort(), [state.notes]);
  const list = state.notes
    .filter((n) => filter === "todas" || n.kind === filter)
    .filter((n) => !tag || n.tags.includes(tag))
    .filter((n) => {
      const nq = normalize(q.trim());
      return !nq || normalize(`${n.title} ${blocksToText(n.body)} ${n.tags.join(" ")}`).includes(nq);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const pinned = list.filter((n) => n.pinned);
  const recent = list.filter((n) => !n.pinned);
  const open = openId ? state.notes.find((n) => n.id === openId) : null;

  const newNote = () => {
    const n = createNote({ kind: filter === "todas" ? "ideia" : filter });
    navigate(`/ideias/${n.id}`);
  };

  const item = (n: Note) => (
    <div key={n.id} className={cx("note-item", n.id === openId && "on")} onClick={() => navigate(`/ideias/${n.id}`)}>
      <span className="n-title">{n.title || "Sem título"}</span>
      <span className="n-meta">
        {KIND_LABEL[n.kind]} · {relativeDate(toISO(new Date(n.updatedAt)))}
        {n.tags.length > 0 && ` · ${n.tags.map((t) => `#${t}`).join(" ")}`}
      </span>
    </div>
  );

  return (
    <div className={cx("split", open && "has-open")}>
      <div className="split-list">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="page-title" style={{ fontSize: 22 }}>
            Ideias &amp; Notas
          </h1>
          <button className="btn primary sm" onClick={newNote}>
            <Plus size={14} /> Nova
          </button>
        </div>
        <div className="row" style={{ position: "relative" }}>
          <Search size={14} className="muted" style={{ position: "absolute", left: 9 }} />
          <input id="notes-search" className="input" style={{ paddingLeft: 28 }} placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row wrap" style={{ gap: 4 }}>
          {(["todas", "ideia", "nota", "video", "criativo"] as Filter[]).map((f) => (
            <button key={f} className={cx("pill", filter === f ? "selected" : "outline")} onClick={() => setFilter(f)}>
              {f === "todas" ? "Todas" : f === "video" ? "Vídeo" : f === "criativo" ? "Criativo" : KIND_LABEL[f] + "s"}
            </button>
          ))}
        </div>
        {allTags.length > 0 && (
          <select id="notes-tag" className="select" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filtrar por tag" style={{ minHeight: 28, fontSize: 13 }}>
            <option value="">Todas as tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        )}
        {pinned.length > 0 && (
          <>
            <div className="side-group" style={{ padding: "8px 10px 0" }}>
              Fixadas
            </div>
            {pinned.map(item)}
          </>
        )}
        <div className="side-group" style={{ padding: "8px 10px 0" }}>
          Recentes
        </div>
        {recent.length === 0 && <Empty>{q || tag ? "Nada encontrado." : "Nenhuma nota aqui ainda."}</Empty>}
        {recent.map(item)}
      </div>
      <div className="split-main">
        {open ? (
          <NoteEditor note={open} key={open.id} />
        ) : (
          <div className="page">
            <Empty>{openId ? "Essa nota não existe mais." : "Selecione uma nota ou crie uma nova."}</Empty>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteEditor({ note }: { note: Note }) {
  const state = useApp();
  const fav = isFavorite(state, "note", note.id);
  const set = (c: Partial<Note>) => patchNote(note.id, c);

  const del = async () => {
    const ok = await ui.confirm({ title: "Excluir nota?", message: note.title || "Sem título", confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    deleteNote(note.id);
    navigate("/ideias");
    ui.toast("Nota excluída");
  };

  const toTask = () => {
    const t = noteToTask(note.id);
    if (t) ui.toast("Tarefa criada a partir da nota", { label: "Abrir", run: () => ui.openTask(t.id) });
  };
  const toCreative = () => {
    const c = noteToCreative(note.id);
    if (c) ui.toast("Criativo criado na coluna Ideia", { label: "Abrir", run: () => navigate(`/criativos/${c.id}`) });
  };
  const toVideo = () => {
    const v = noteToVideo(note.id);
    if (v) ui.toast("Vídeo criado na coluna Ideia", { label: "Abrir", run: () => navigate(`/videos/${v.id}`) });
  };

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="row wrap" style={{ marginBottom: 20, gap: 6 }}>
        <button className="back-btn" onClick={() => navigate("/ideias")} aria-label="Voltar para Ideias e Notas">
          <ArrowLeft size={18} />
          <span>Ideias</span>
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          Ideias &amp; Notas / {KIND_LABEL[note.kind]}
        </span>
        <span className="grow" />
        <button className="btn sm" onClick={toTask}>
          <CheckSquare size={14} /> Virar tarefa
        </button>
        <button className={cx("btn sm", note.kind === "video" && "primary")} onClick={toVideo}>
          <Clapperboard size={14} /> Virar vídeo
        </button>
        <button className={cx("btn sm", note.kind === "criativo" && "primary")} onClick={toCreative}>
          <Palette size={14} /> Virar criativo
        </button>
        <button className={cx("icon-btn", note.pinned && "on")} onClick={() => set({ pinned: !note.pinned })} aria-label={note.pinned ? "Desafixar" : "Fixar"} title={note.pinned ? "Desafixar" : "Fixar no topo"}>
          <Pin size={16} fill={note.pinned ? "currentColor" : "none"} />
        </button>
        <button className={cx("icon-btn", fav && "on")} onClick={() => toggleFavorite("note", note.id)} aria-label={fav ? "Tirar dos favoritos" : "Favoritar"} title="Favorito na barra lateral">
          <Star size={16} fill={fav ? "currentColor" : "none"} />
        </button>
        <button className="icon-btn" onClick={del} aria-label="Excluir nota">
          <Trash2 size={16} />
        </button>
      </div>

      <AutoTextarea
        className="title-input"
        value={note.title}
        placeholder="Sem título"
        aria-label="Título da nota"
        autoFocus={!note.title}
        onChange={(e) => set({ title: e.target.value.replace(/\n/g, "") })}
      />
      <div className="props">
        <span className="prop-k">Tipo</span>
        <span className="prop-v">
          <select className="select bare" value={note.kind} onChange={(e) => set({ kind: e.target.value as NoteKind })} aria-label="Tipo">
            <option value="ideia">Ideia</option>
            <option value="nota">Nota</option>
            <option value="video">Ideia de vídeo</option>
            <option value="criativo">Ideia de criativo</option>
          </select>
        </span>
        <span className="prop-k">Tags</span>
        <span className="prop-v">
          <TagInput tags={note.tags} onChange={(tags) => set({ tags })} />
        </span>
        {note.converted.length > 0 && (
          <>
            <span className="prop-k">Virou</span>
            <span className="prop-v">
              {note.converted.map((c) => {
                if (c.kind === "task") {
                  const t = state.tasks.find((x) => x.id === c.id);
                  return t ? (
                    <button key={c.id} className="pill" onClick={() => ui.openTask(t.id)}>
                      <CheckSquare size={12} /> {t.title || "Tarefa"}
                    </button>
                  ) : null;
                }
                if (c.kind === "creative") {
                  const cr = state.creatives.find((x) => x.id === c.id);
                  return cr ? (
                    <button key={c.id} className="pill" onClick={() => navigate(`/criativos/${cr.id}`)}>
                      <Palette size={12} /> {cr.title || "Criativo"}
                    </button>
                  ) : null;
                }
                const v = state.videos.find((x) => x.id === c.id);
                return v ? (
                  <button key={c.id} className="pill" onClick={() => navigate(`/videos/${v.id}`)}>
                    <Clapperboard size={12} /> {v.title || "Vídeo"}
                  </button>
                ) : null;
              })}
            </span>
          </>
        )}
      </div>
      <BlockEditor blocks={note.body} onChange={(body) => set({ body })} aiContext={`${KIND_LABEL[note.kind]} "${note.title || "sem título"}"`} emptyHint="Escreva a ideia… digite '/' para títulos, listas e checklist" />
    </div>
  );
}
