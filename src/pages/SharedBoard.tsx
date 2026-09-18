/*
 * Tela de quem recebe o link: vê o quadro e os cards, sem entrar em conta nenhuma
 * e sem poder mudar nada. Se quiser comentar, pede permissão ao dono.
 */
import { AlignLeft, CheckSquare, Clock, ExternalLink, Image as ImageIcon, Lock, MessageSquare, Paperclip, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NeuronLogo } from "../components/Logo";
import { labelStyle } from "../lib/board";
import { relativeDate } from "../lib/dates";
import { hrefOf, splitLinks } from "../lib/links";
import { fetchSharedBoard, postComment, requestComments, ShareError, type ShareComment, type SharedBoard as Shared, type SharedCreative } from "../lib/share";
import { ui } from "../lib/ui";
import { cx } from "../lib/util";

export function SharedBoardPage({ token }: { token: string }) {
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSharedBoard(token)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof ShareError ? e.message : "Não foi possível abrir este link."));
    return () => {
      alive = false;
    };
  }, [token]);

  const open = data?.creatives.find((c) => c.id === openId) || null;
  const addComment = (comment: ShareComment) =>
    setData((d) => (d && !d.comments.some((c) => c.id === comment.id) ? { ...d, comments: [...d.comments, comment] } : d));
  const setViewer = (viewer: Shared["viewer"]) => setData((d) => (d ? { ...d, viewer } : d));

  if (error) {
    return (
      <div className="sh-page">
        <div className="sh-empty">
          <Lock size={22} />
          <h1>{error}</h1>
          <p>Peça um link novo para quem compartilhou o quadro.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sh-page">
        <div className="sh-empty">
          <NeuronLogo size={40} />
          <p>Abrindo o quadro…</p>
        </div>
      </div>
    );
  }

  const columns = data.board.columns;
  const cards = (colId: string) =>
    data.creatives
      .filter((c) => c.columnId === colId)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);

  return (
    <div className="sh-page">
      <header className="sh-top">
        <NeuronLogo size={26} className="brand-logo" />
        <div className="sh-top-text">
          <strong>{data.title}</strong>
          <small>{data.ownerName ? `Compartilhado por ${data.ownerName}` : "Quadro compartilhado"} · somente leitura</small>
        </div>
        <span className="grow" />
        <span className="sh-tag">
          <Lock size={13} /> Você não pode editar
        </span>
      </header>

      <div className="sh-board">
        {columns.map((col) => (
          <section key={col.id} className="tcol">
            <header className="tcol-head">
              <h2 className="tcol-title">{col.title}</h2>
              <span className="tcol-count">{cards(col.id).length}</span>
            </header>
            <div className="tcol-cards">
              {col.cover && (
                <div className="tcover" aria-hidden>
                  <img src={col.cover} alt="" />
                  {col.coverTitle && <span className="tcover-title">{col.title}</span>}
                </div>
              )}
              {cards(col.id).map((c) => (
                <SharedCard key={c.id} c={c} data={data} onOpen={() => setOpenId(c.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {open && <SharedCardView creative={open} data={data} token={token} onClose={() => setOpenId(null)} onComment={addComment} onViewer={setViewer} />}
    </div>
  );
}

function SharedCard({ c, data, onOpen }: { c: SharedCreative; data: Shared; onOpen: () => void }) {
  const labels = c.labelIds.map((id) => data.board.labels.find((l) => l.id === id)).filter(Boolean);
  const done = c.checklist.filter((i) => i.done).length;
  const comments = data.comments.filter((m) => m.card_id === c.id).length;
  const hasText = c.briefing.some((b) => b.text.trim()) || !!c.bodyText.trim();
  return (
    <div className="tcard" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      {c.cover && <img className="tcard-cover" src={c.cover} alt="" loading="lazy" />}
      <div className="tcard-body">
        {labels.length > 0 && (
          <div className="tcard-labels">
            {labels.map((l) => (
              <span key={l!.id} className="tlabel" style={labelStyle(l!.color)}>
                {l!.name || " "}
              </span>
            ))}
          </div>
        )}
        <span className="tcard-title">{c.title || "Sem título"}</span>
        <div className="tcard-badges">
          {c.dueDate && (
            <span className={cx("tbadge", c.dueDone && "due-done")}>
              <Clock size={13} /> {relativeDate(c.dueDate)}
            </span>
          )}
          {hasText && (
            <span className="tbadge plain">
              <AlignLeft size={14} />
            </span>
          )}
          {c.moodboard.length + c.references.length > 0 && (
            <span className="tbadge plain">
              <Paperclip size={13} /> {c.moodboard.length + c.references.length}
            </span>
          )}
          {c.checklist.length > 0 && (
            <span className={cx("tbadge", done === c.checklist.length ? "due-done" : "plain")}>
              <CheckSquare size={13} /> {done}/{c.checklist.length}
            </span>
          )}
          {comments > 0 && (
            <span className="tbadge plain">
              <MessageSquare size={13} /> {comments}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- card aberto ---------- */

function SharedCardView({
  creative: c,
  data,
  token,
  onClose,
  onComment,
  onViewer,
}: {
  creative: SharedCreative;
  data: Shared;
  token: string;
  onClose: () => void;
  onComment: (c: ShareComment) => void;
  onViewer: (v: Shared["viewer"]) => void;
}) {
  const labels = c.labelIds.map((id) => data.board.labels.find((l) => l.id === id)).filter(Boolean);
  const comments = useMemo(() => data.comments.filter((m) => m.card_id === c.id), [data.comments, c.id]);
  const [zoom, setZoom] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (zoom ? setZoom("") : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoom]);

  return (
    <div className="sh-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <article className="sh-card" role="dialog" aria-label={c.title}>
        <header className="sh-card-top">
          <strong>{c.title || "Sem título"}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        <div className="sh-card-body">
          {c.cover && <img className="sh-cover" src={c.cover} alt="" onClick={() => setZoom(c.cover)} />}

          <div className="sh-meta">
            {labels.length > 0 && (
              <span className="row wrap" style={{ gap: 4 }}>
                {labels.map((l) => (
                  <span key={l!.id} className="tlabel" style={labelStyle(l!.color)}>
                    {l!.name || " "}
                  </span>
                ))}
              </span>
            )}
            {c.dueDate && (
              <span className="sh-chip">
                <Clock size={13} /> {relativeDate(c.dueDate)}
                {c.dueTime && ` · ${c.dueTime}`}
              </span>
            )}
            {c.format && <span className="sh-chip">{c.format}</span>}
            {c.size && <span className="sh-chip">{c.size}</span>}
            {c.client && <span className="sh-chip">{c.client}</span>}
          </div>

          {c.briefing.some((b) => b.text.trim()) && (
            <section>
              <h3 className="sh-h">Descrição</h3>
              <ReadBlocks blocks={c.briefing} />
            </section>
          )}

          {c.checklist.length > 0 && (
            <section>
              <h3 className="sh-h">Checklist</h3>
              <ul className="sh-check">
                {c.checklist.map((i) => (
                  <li key={i.id} className={cx(i.done && "done")}>
                    <span className={cx("sh-box", i.done && "on")}>{i.done && <CheckSquare size={12} />}</span>
                    {i.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(c.headline || c.bodyText || c.cta) && (
            <section>
              <h3 className="sh-h">Textos da peça</h3>
              {c.headline && <p className="sh-text strong">{c.headline}</p>}
              {c.bodyText && <p className="sh-text">{c.bodyText}</p>}
              {c.cta && <p className="sh-text cta">{c.cta}</p>}
            </section>
          )}

          {c.moodboard.length > 0 && (
            <section>
              <h3 className="sh-h">
                <ImageIcon size={14} /> Moodboard
              </h3>
              <div className="sh-mood">
                {c.moodboard.map((m) => (
                  <figure key={m.id}>
                    <img src={m.src} alt={m.caption} onClick={() => setZoom(m.src)} />
                    {m.caption && <figcaption>{m.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </section>
          )}

          {(c.references.length > 0 || c.fileUrl) && (
            <section>
              <h3 className="sh-h">Links</h3>
              <ul className="sh-links">
                {c.fileUrl && (
                  <li>
                    <a href={hrefOf(c.fileUrl)} target="_blank" rel="noreferrer">
                      Arquivo da peça <ExternalLink size={12} />
                    </a>
                  </li>
                )}
                {c.references.map((r) => (
                  <li key={r.id}>
                    <a href={hrefOf(r.url)} target="_blank" rel="noreferrer">
                      {r.label} <ExternalLink size={12} />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Comments data={data} token={token} cardId={c.id} comments={comments} onComment={onComment} onViewer={onViewer} />
        </div>
      </article>

      {zoom && (
        <div className="sh-zoom" onMouseDown={() => setZoom("")}>
          <img src={zoom} alt="" />
        </div>
      )}
    </div>
  );
}

/* ---------- comentários e pedido de permissão ---------- */

function Comments({
  data,
  token,
  cardId,
  comments,
  onComment,
  onViewer,
}: {
  data: Shared;
  token: string;
  cardId: string;
  comments: ShareComment[];
  onComment: (c: ShareComment) => void;
  onViewer: (v: Shared["viewer"]) => void;
}) {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const status = data.viewer?.status;

  const send = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const { comment } = await postComment(token, cardId, body.trim());
      onComment(comment);
      setBody("");
    } catch (e) {
      ui.toast(e instanceof ShareError ? e.message : "Não foi possível comentar.");
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const res = await requestComments(token, name.trim(), email.trim(), "");
      onViewer({ status: res.status, name: res.name });
      ui.toast(res.status === "approved" ? "Acesso liberado, pode comentar." : "Pedido enviado. Você comenta assim que for aprovado.");
    } catch (e) {
      ui.toast(e instanceof ShareError ? e.message : "Não foi possível enviar o pedido.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3 className="sh-h">
        <MessageSquare size={14} /> Comentários {comments.length > 0 && <span className="muted">{comments.length}</span>}
      </h3>
      {comments.length === 0 && <p className="sh-muted">Nenhum comentário neste card.</p>}
      {comments.map((m) => (
        <div key={m.id} className="sh-comment">
          <strong>{m.author}</strong>
          <span className="sh-muted">{new Date(m.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
          <p>{m.body}</p>
        </div>
      ))}

      {!data.allowComments && <p className="sh-muted">Quem compartilhou deixou este quadro apenas para leitura.</p>}

      {data.allowComments && status === "approved" && (
        <div className="sh-write">
          <textarea className="textarea" rows={2} placeholder="Escrever um comentário…" value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="btn primary sm" onClick={send} disabled={!body.trim() || busy}>
            Comentar
          </button>
        </div>
      )}

      {data.allowComments && status === "pending" && <p className="sh-muted">Seu pedido está esperando a aprovação de quem compartilhou.</p>}
      {data.allowComments && status === "denied" && <p className="sh-muted">Seu pedido para comentar não foi aprovado.</p>}

      {data.allowComments && !status && (
        <div className="sh-ask">
          <p className="sh-muted">Quer comentar? Peça permissão a quem compartilhou.</p>
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 200 }} />
            <input className="input" placeholder="Seu e-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ maxWidth: 220 }} />
            <button className="btn sm" onClick={ask} disabled={name.trim().length < 2 || busy}>
              Pedir permissão
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Blocos do briefing sem poder editar, com os links clicáveis. */
function ReadBlocks({ blocks }: { blocks: Shared["creatives"][number]["briefing"] }) {
  return (
    <div className="editor">
      {blocks.map((b, i) =>
        b.type === "divider" ? (
          <div key={b.id} className="blk divider">
            <hr />
          </div>
        ) : (
          <div key={b.id} className={cx("blk", b.type, b.checked && "checked")}>
            {b.type === "bullet" && <span className="marker">•</span>}
            {b.type === "number" && <span className="marker">{blocks.slice(0, i).filter((x) => x.type === "number").length + 1}.</span>}
            {b.type === "todo" && <span className="marker">{b.checked ? "☑" : "☐"}</span>}
            <span className="blk-field">
              <span className="blk-links" style={{ position: "static" }}>
                {splitLinks(b.text).map((part, k) =>
                  part.href ? (
                    <a key={k} href={part.href} target="_blank" rel="noreferrer">
                      {part.text}
                    </a>
                  ) : (
                    <span key={k}>{part.text}</span>
                  ),
                )}
              </span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}
