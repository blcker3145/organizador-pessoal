/*
 * Painel de compartilhamento do quadro: cria o link, responde os pedidos de
 * comentário e mostra o que as pessoas escreveram.
 */
import { Check, Copy, Link2, MessageSquare, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createShare,
  deleteShare,
  deleteShareComment,
  listShareComments,
  listShares,
  listViewers,
  setViewerStatus,
  ShareError,
  shareUrl,
  updateShare,
  type ShareComment,
  type ShareLink,
  type ShareViewer,
} from "../../lib/share";
import { useApp } from "../../lib/store";
import { navigate, ui } from "../../lib/ui";
import { cx } from "../../lib/util";
import { Modal, Switch } from "../common";

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const creatives = useApp().creatives;
  const [share, setShare] = useState<ShareLink | null>(null);
  const [viewers, setViewers] = useState<ShareViewer[]>([]);
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const shares = await listShares();
      const live = shares.find((s) => !s.revoked) || null;
      setShare(live);
      if (live) {
        setViewers(await listViewers([live.id]));
        setComments(await listShareComments([live.id]));
      } else {
        setViewers([]);
        setComments([]);
      }
      setError("");
    } catch (e) {
      setError(e instanceof ShareError ? e.message : "Não foi possível carregar o compartilhamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setLoading(true);
    try {
      setShare(await createShare("Criativos"));
      setError("");
    } catch (e) {
      setError(e instanceof ShareError ? e.message : "Não foi possível criar o link.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(shareUrl(share.token));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      ui.toast("Copie o endereço da caixa acima.");
    }
  };

  const stop = async () => {
    if (!share) return;
    const ok = await ui.confirm({
      title: "Desativar o link?",
      message: "Quem já tem o endereço deixa de ver o quadro. Você pode criar um link novo depois.",
      confirmLabel: "Desativar",
      danger: true,
    });
    if (!ok) return;
    await deleteShare(share.id);
    setShare(null);
    setViewers([]);
    setComments([]);
  };

  const answer = async (v: ShareViewer, status: ShareViewer["status"]) => {
    await setViewerStatus(v.id, status);
    setViewers((list) => list.map((x) => (x.id === v.id ? { ...x, status } : x)));
  };

  const pending = viewers.filter((v) => v.status === "pending");
  const approved = viewers.filter((v) => v.status === "approved");
  const cardName = (id: string) => creatives.find((c) => c.id === id)?.title || "Card removido";

  return (
    <Modal title="Compartilhar o quadro" onClose={onClose} width={560}>
      {error && <div className="sd-warn">{error}</div>}

      {!share && !loading && (
        <div className="stack" style={{ gap: 10 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Gere um link para mostrar o andamento dos criativos. Quem abrir vê as listas e os cards, mas não pode mudar nada. Só o quadro de Criativos é
            compartilhado; os outros módulos continuam privados.
          </p>
          <button className="btn primary" onClick={create}>
            <Link2 size={15} /> Criar link de compartilhamento
          </button>
        </div>
      )}

      {share && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="sd-link">
            <input className="input" readOnly value={shareUrl(share.token)} onFocus={(e) => e.currentTarget.select()} aria-label="Link do quadro" />
            <button className="btn sm" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            Qualquer pessoa com este endereço vê o quadro, sem precisar de conta. Ninguém consegue editar.
          </p>

          <Switch
            checked={share.allow_comments}
            onChange={async (v) => {
              setShare({ ...share, allow_comments: v });
              await updateShare(share.id, { allow_comments: v });
            }}
            label="Deixar as pessoas pedirem permissão para comentar"
          />

          {pending.length > 0 && (
            <section>
              <div className="sd-title">Pedidos de permissão {pending.length}</div>
              {pending.map((v) => (
                <div key={v.id} className="sd-row">
                  <span className="grow">
                    <strong>{v.name}</strong>
                    {v.email && <small className="muted"> · {v.email}</small>}
                  </span>
                  <button className="btn sm" onClick={() => answer(v, "approved")}>
                    <Check size={14} /> Liberar
                  </button>
                  <button className="icon-btn" aria-label="Recusar" title="Recusar" onClick={() => answer(v, "denied")}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </section>
          )}

          {approved.length > 0 && (
            <section>
              <div className="sd-title">Podem comentar {approved.length}</div>
              {approved.map((v) => (
                <div key={v.id} className="sd-row">
                  <span className="grow">
                    <strong>{v.name}</strong>
                    {v.email && <small className="muted"> · {v.email}</small>}
                  </span>
                  <button className="btn ghost sm" onClick={() => answer(v, "denied")}>
                    Tirar permissão
                  </button>
                </div>
              ))}
            </section>
          )}

          {comments.length > 0 && (
            <section>
              <div className="sd-title">
                <MessageSquare size={14} /> Comentários recebidos
              </div>
              {comments.slice(0, 8).map((m) => (
                <div key={m.id} className={cx("sd-comment")}>
                  <button className="link" onClick={() => (onClose(), navigate(`/criativos/${m.card_id}`))}>
                    {cardName(m.card_id)}
                  </button>
                  <p>
                    <strong>{m.author}:</strong> {m.body}
                  </p>
                  <button
                    className="icon-btn"
                    aria-label="Apagar comentário"
                    onClick={async () => {
                      await deleteShareComment(m.id);
                      setComments((list) => list.filter((x) => x.id !== m.id));
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </section>
          )}

          <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={stop}>
            <Trash2 size={14} /> Desativar este link
          </button>
        </div>
      )}
    </Modal>
  );
}
