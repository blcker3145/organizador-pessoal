import { NeuronLogo } from "./Logo";
import { Cloud, CloudOff, Loader2, LogOut } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "../lib/util";
import { finishOnboarding, sendPasswordReset, signIn, signOut, signUp, updatePassword, useSession } from "../lib/sync";

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <NeuronLogo size={28} className="brand-logo" /> Organizador
        </div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

/* ---------------- Entrar / criar conta / esqueci a senha ---------------- */

type Mode = "entrar" | "criar" | "esqueci";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const go = (m: Mode) => {
    setMode(m);
    setError("");
    setInfo("");
  };

  const submit = async () => {
    setError("");
    setInfo("");
    if (!email.trim()) return setError("Digite seu e-mail.");
    if (mode !== "esqueci" && password.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    setBusy(true);
    try {
      if (mode === "entrar") {
        const err = await signIn(email, password);
        if (err) setError(err);
      } else if (mode === "criar") {
        const { error: err, needsConfirmation } = await signUp(name, email, password);
        if (err) setError(err);
        else if (needsConfirmation) {
          setInfo(`Enviamos um link de confirmação para ${email.trim()}. Abra o e-mail neste mesmo navegador para ativar a conta.`);
          setMode("entrar");
        }
      } else {
        const err = await sendPasswordReset(email);
        if (err) setError(err);
        else setInfo(`Se existir uma conta com ${email.trim()}, enviamos um link para criar uma nova senha. Abra neste mesmo navegador.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, string> = { entrar: "Entrar", criar: "Criar conta", esqueci: "Recuperar senha" };

  return (
    <AuthCard
      title={titles[mode]}
      subtitle={mode === "criar" ? "Suas tarefas, ideias, vídeos e criativos salvos na sua conta, em qualquer dispositivo." : mode === "esqueci" ? "Vamos enviar um link para você criar uma nova senha." : undefined}
    >
      <form
        className="stack"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {mode === "criar" && (
          <label className="field">
            Seu nome
            <input id="auth-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como quer ser chamado" />
          </label>
        )}
        <label className="field">
          E-mail
          <input id="auth-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        {mode !== "esqueci" && (
          <label className="field">
            Senha
            <input
              id="auth-password"
              className="input"
              type="password"
              autoComplete={mode === "criar" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "criar" ? "Pelo menos 6 caracteres" : ""}
            />
          </label>
        )}
        {error && <div className="ai-error">{error}</div>}
        {info && <div className="auth-info">{info}</div>}
        <button type="submit" className="btn primary auth-submit" disabled={busy}>
          {busy && <Loader2 size={15} className="spin" />}
          {mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Enviar link"}
        </button>
      </form>
      <div className="auth-links">
        {mode === "entrar" ? (
          <>
            <button className="link" onClick={() => go("criar")}>
              Criar conta
            </button>
            <button className="link" onClick={() => go("esqueci")}>
              Esqueci minha senha
            </button>
          </>
        ) : (
          <button className="link" onClick={() => go("entrar")}>
            Já tenho conta: entrar
          </button>
        )}
      </div>
    </AuthCard>
  );
}

/* ---------------- Nova senha (link do e-mail) ---------------- */

export function NewPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (password.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirm) return setError("As duas senhas não são iguais.");
    setBusy(true);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <AuthCard title="Criar nova senha">
      <form
        className="stack"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          Nova senha
          <input id="new-password" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        <label className="field">
          Repita a nova senha
          <input id="new-password-confirm" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <div className="ai-error">{error}</div>}
        <button type="submit" className="btn primary auth-submit" disabled={busy}>
          {busy && <Loader2 size={15} className="spin" />} Salvar senha e entrar
        </button>
      </form>
    </AuthCard>
  );
}

/* ---------------- Primeiro acesso da conta ---------------- */

export function OnboardingScreen() {
  const { legacyAvailable, user } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const choose = async (choice: "empty" | "seed" | "legacy") => {
    setBusy(choice);
    await finishOnboarding(choice);
  };
  const options: { id: "legacy" | "empty" | "seed"; title: string; text: string; show: boolean }[] = [
    {
      id: "legacy",
      title: "Trazer os dados deste navegador",
      text: "Leva para a sua conta tudo o que você já tinha anotado neste navegador antes do login.",
      show: legacyAvailable,
    },
    { id: "empty", title: "Começar do zero", text: "Conta vazia, pronta para você organizar do seu jeito.", show: true },
    { id: "seed", title: "Começar com exemplos", text: "Tarefas, vídeos, criativos e finanças de exemplo para conhecer o app. Dá para apagar depois.", show: true },
  ];
  return (
    <AuthCard title="Bem-vindo" subtitle={`Conta ${user?.email ?? ""} criada. Como você quer começar?`}>
      <div className="stack" style={{ gap: 8 }}>
        {options
          .filter((o) => o.show)
          .map((o, i) => (
            <button key={o.id} className={cx("auth-option", i === 0 && "recommended")} disabled={!!busy} onClick={() => choose(o.id)}>
              <strong>
                {o.title}
                {busy === o.id && <Loader2 size={14} className="spin" style={{ marginLeft: 6 }} />}
              </strong>
              <span className="muted">{o.text}</span>
            </button>
          ))}
      </div>
    </AuthCard>
  );
}

/* ---------------- Carregando, erro e configuração ---------------- */

export function LoadingScreen() {
  return (
    <div className="auth-page">
      <div className="row muted">
        <Loader2 size={18} className="spin" /> Carregando sua conta…
      </div>
    </div>
  );
}

export function ErrorScreen() {
  const { error } = useSession();
  return (
    <AuthCard title="Não foi possível abrir sua conta" subtitle={error}>
      <div className="row">
        <button className="btn primary" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
        <button className="btn" onClick={() => signOut()}>
          Sair
        </button>
      </div>
    </AuthCard>
  );
}

export function SetupMissingScreen() {
  return (
    <AuthCard title="Falta conectar o Supabase" subtitle="O app precisa do endereço e da chave pública do seu projeto Supabase para ter login.">
      <ol className="setup-steps">
        <li>
          Na pasta do projeto, crie o arquivo <code>.env.local</code> copiando o <code>.env.example</code>.
        </li>
        <li>
          Preencha <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> com os dados de Project Settings → API no Supabase.
        </li>
        <li>
          Pare e rode de novo <code>npm run dev</code>.
        </li>
      </ol>
    </AuthCard>
  );
}

/* ---------------- Conta na barra lateral ---------------- */

export function AccountBox() {
  const { user, saveStatus } = useSession();
  if (!user) return null;
  const statusText = { saved: "Salvo na nuvem", saving: "Salvando…", offline: "Sem internet: salvo neste navegador", error: "Erro ao salvar, tentando de novo" }[saveStatus];
  return (
    <div className="account-box">
      <div className={cx("save-status", saveStatus)} title={statusText}>
        {saveStatus === "saved" ? <Cloud size={13} /> : saveStatus === "saving" ? <Loader2 size={13} className="spin" /> : <CloudOff size={13} />}
        <span className="ellipsis">{statusText}</span>
      </div>
      <div className="row" style={{ gap: 4 }}>
        <span className="ellipsis grow muted" style={{ fontSize: 12.5 }} title={user.email}>
          {user.email}
        </span>
        <button className="icon-btn" onClick={() => signOut()} aria-label="Sair da conta" title="Sair da conta">
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}
