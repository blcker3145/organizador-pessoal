/*
 * Botão de feedback fixo no canto superior direito, em todas as telas:
 * a pessoa dá uma nota em estrelas e escreve um recado.
 */
import { MessageSquarePlus, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteFeedback, FeedbackError, listFeedback, sendFeedback, type Feedback } from "../lib/feedback";
import { ui, useRoute } from "../lib/ui";
import { cx } from "../lib/util";
import { Modal } from "./common";

const NOTA = ["", "Ruim", "Fraco", "Ok", "Bom", "Ótimo"];

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="fb-btn" onClick={() => setOpen(true)} aria-label="Enviar feedback" title="Enviar feedback">
        <MessageSquarePlus size={16} />
        <span>Feedback</span>
      </button>
      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const { path } = useRoute();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = hover || rating;

  const send = async () => {
    if (!rating || busy) return;
    setBusy(true);
    try {
      await sendFeedback(rating, message, path);
      ui.toast("Feedback enviado. Obrigado!");
      onClose();
    } catch (e) {
      ui.toast(e instanceof FeedbackError ? e.message : "Não foi possível enviar agora.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Como está sendo usar o app?"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={send} disabled={!rating || busy}>
            {busy ? "Enviando…" : "Enviar"}
          </button>
        </>
      }
    >
      <div className="fb-stars" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Nota de 1 a 5 estrelas">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
            className={cx("fb-star", n <= shown && "on")}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
          >
            <Star size={30} fill={n <= shown ? "currentColor" : "none"} />
          </button>
        ))}
        <span className="fb-nota">{NOTA[shown]}</span>
      </div>
      <textarea
        className="textarea"
        rows={5}
        autoFocus
        placeholder="O que funcionou bem? O que atrapalhou? Alguma ideia?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && send()}
      />
      <span className="muted" style={{ fontSize: 12 }}>
        Enviado junto: a tela em que você está ({path}) e o e-mail da sua conta.
      </span>
    </Modal>
  );
}

/** Lista para quem administra (aparece em Configurações). */
export function FeedbackList() {
  const [list, setList] = useState<Feedback[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listFeedback()
      .then(setList)
      .catch((e) => setError(e instanceof FeedbackError ? e.message : "Não foi possível carregar."));
  }, []);

  if (error) return <div className="sd-warn">{error}</div>;
  if (!list) return <div className="muted">Carregando…</div>;
  if (!list.length) return <div className="muted">Nenhum feedback ainda.</div>;

  return (
    <div className="fb-list">
      {list.map((f) => (
        <div key={f.id} className="fb-item">
          <div className="fb-item-top">
            <span className="fb-item-stars">
              {"★".repeat(f.rating)}
              <span className="muted">{"★".repeat(5 - f.rating)}</span>
            </span>
            <span className="muted">{f.email}</span>
            <span className="grow" />
            <span className="muted num">{new Date(f.created_at).toLocaleDateString("pt-BR")}</span>
            <button
              className="icon-btn"
              aria-label="Apagar feedback"
              onClick={async () => {
                await deleteFeedback(f.id);
                setList((l) => (l || []).filter((x) => x.id !== f.id));
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {f.message && <p>{f.message}</p>}
          {f.page && <small className="muted">em {f.page}</small>}
        </div>
      ))}
    </div>
  );
}
