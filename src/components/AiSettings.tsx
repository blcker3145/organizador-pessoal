import { useEffect } from "react";
import { refreshAiUsage, useAiUsage } from "../lib/ai";
import { ProgressBar } from "./common";

export function AiSettingsSection() {
  const usage = useAiUsage();

  useEffect(() => {
    refreshAiUsage();
  }, []);

  return (
    <section className="settings-section">
      <h2>Inteligência artificial (ChatGPT)</h2>
      <p>
        Já vem incluída na sua conta. Use no assistente (Ctrl J), digitando "/" em um texto ou clicando em ✨. Você não precisa de chave: a conexão com a
        OpenAI fica no servidor. O texto em que você usa a IA é enviado para a OpenAI.
      </p>
      {usage ? (
        <div className="stack" style={{ gap: 6, maxWidth: 420 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Pedidos de hoje</span>
            <strong className="num">
              {usage.used} de {usage.limit}
            </strong>
          </div>
          <ProgressBar pct={(usage.used / usage.limit) * 100} warnAt={80} />
          <span className="muted" style={{ fontSize: 12.5 }}>
            O limite renova todo dia à meia-noite (horário de Brasília).
          </span>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>
          O uso aparece aqui depois do primeiro pedido à IA.
        </p>
      )}
    </section>
  );
}
