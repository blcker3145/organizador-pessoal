import { useState } from "react";
import { changePassword, signOut, useSession } from "../lib/sync";
import { ui } from "../lib/ui";

export function AccountSettingsSection() {
  const { user } = useSession();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (password.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    setBusy(true);
    setError("");
    const err = await changePassword(password);
    setBusy(false);
    if (err) setError(err);
    else {
      setPassword("");
      ui.toast("Senha alterada");
    }
  };

  return (
    <section className="settings-section">
      <h2>Conta</h2>
      <p>
        Você está conectado como <strong>{user?.email}</strong>.
      </p>
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          id="account-new-password"
          className="input"
          style={{ maxWidth: 260 }}
          type="password"
          autoComplete="new-password"
          placeholder="Nova senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn" disabled={busy || !password}>
          Alterar senha
        </button>
        <span className="grow" />
        <button type="button" className="btn danger" onClick={() => signOut()}>
          Sair da conta
        </button>
      </form>
      {error && <p className="red" style={{ margin: "8px 0 0", fontSize: 13 }}>{error}</p>}
    </section>
  );
}
