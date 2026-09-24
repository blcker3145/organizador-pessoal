# Configurar o Supabase

O app usa o Supabase para três coisas: login, dados de cada conta na nuvem e a IA pelo servidor, onde a chave da OpenAI fica guardada.

Leva uns 15 minutos. Faça na ordem.

## 1. Criar o projeto

1. Abra https://supabase.com/dashboard e clique em **New project**.
2. **Name:** `organizador`. **Database password:** clique em *Generate a password* e guarde num lugar seguro.
3. **Region:** *South America (São Paulo)*.
4. Clique em **Create new project** e espere uns 2 minutos até terminar.

## 2. Criar as tabelas

1. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/migrations/0001_organizador.sql` deste projeto, copie **tudo** e cole no editor.
3. Clique em **Run**. Deve aparecer *Success. No rows returned*.

Isso cria a tabela de dados de cada conta, as regras para cada pessoa ver só os próprios dados e o limite diário da IA.

## 3. Configurar o login

1. Abra **Authentication → URL Configuration**.
2. Em **Site URL**, coloque:
   `https://blcker3145.github.io/organizador-pessoal/`
3. Em **Redirect URLs**, clique em **Add URL** e adicione as duas:
   - `https://blcker3145.github.io/organizador-pessoal/`
   - `http://localhost:5173/`
4. Clique em **Save**.

Em **Authentication → Sign In / Providers → Email**, o login por e-mail já vem ligado.

- **Confirm email** ligado: a pessoa precisa clicar no link do e-mail antes de entrar. O Supabase gratuito envia poucos e-mails por hora. Para testar agora, você pode desligar e religar depois.
- Para ninguém mais criar conta, desligue **Allow new users to sign up**.

## 4. Publicar a função de IA

1. Abra **Edge Functions** e clique em **Deploy a new function → Via Editor**.
2. **Nome da função:** `ai` (exatamente assim, minúsculo).
3. Apague o código de exemplo, abra `supabase/functions/ai/index.ts` deste projeto, copie tudo e cole.
4. Clique em **Deploy function**.
5. Deixe ligada a opção **Verify JWT** (ou *Enforce JWT verification*). É ela que exige login.

## 5. Guardar a chave da IA (segredo)

Escolha **um** provedor:

| Provedor | Custo | Onde criar a chave | Nome do segredo |
|---|---|---|---|
| Google Gemini | cota gratuita diária (com limites) | https://aistudio.google.com/apikey → Create API key (começa com `AQ.` ou `AIza`) | `GEMINI_API_KEY` |
| OpenAI (ChatGPT) | pago por uso, precisa de crédito | https://platform.openai.com/api-keys (começa com `sk-`) | `OPENAI_API_KEY` |

1. Crie a chave no site do provedor. **Nunca mande a chave por chat ou e-mail**; se isso acontecer, apague e crie outra.
2. No Supabase, abra **Edge Functions → Secrets** e adicione o segredo com o nome da tabela e a chave como valor.
3. Opcionais:

| Name | Value |
|---|---|
| `AI_DAILY_LIMIT` | pedidos por pessoa por dia (padrão `50`) |
| `GEMINI_MODEL` / `OPENAI_MODEL` | força um modelo; sem isso a função escolhe sozinha |
| `AI_PROVIDER` | `gemini` ou `openai`, se os dois segredos existirem |

4. Clique em **Save**. Não precisa publicar a função de novo.

A chave fica só aqui. Ela nunca vai para o navegador, o código ou o GitHub.

No plano gratuito do Gemini, o Google pode usar o conteúdo enviado para melhorar os produtos dele. Evite mandar dados sensíveis para a IA, ou ative o faturamento no Google AI Studio.

## 6. Conectar o app ao projeto

1. Abra **Project Settings → API Keys** (ou **Data API**).
2. Copie:
   - a **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - a chave **anon public** (ou **Publishable key**)
3. Na pasta do projeto, crie o arquivo `.env.local` com:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=cole-a-chave-anon-aqui
```

Essas duas informações são públicas por natureza e podem aparecer no site. Quem protege os dados são as regras do passo 2. **Nunca** coloque a chave `service_role`, a *secret key* ou a chave da OpenAI nesse arquivo.

## 7. Testar e publicar

1. Rode `npm run dev` e abra http://localhost:5173 no Chrome.
2. Clique em **Criar conta**. No primeiro acesso, escolha **Trazer os dados deste navegador** para levar o que você já tinha.
3. Teste a IA: **Ctrl J** → "o que eu tenho para fazer hoje?".
4. Para publicar o site com login: `npm run deploy`.

## 8. Agenda com Google Agenda (opcional)

A Agenda do Organizador funciona sozinha. Para ver e editar o Google Agenda dentro dele, cada pessoa clica em **Conectar Google Agenda** uma vez. Para isso funcionar, o servidor precisa de um "cliente OAuth" do Google.

### 8.1 Banco e função

1. **SQL Editor** → cole o conteúdo de `supabase/migrations/0002_google_calendar.sql` → **Run**.
2. **Edge Functions** → **Deploy a new function** → **Via Editor**. Nome: `google-calendar`. Cole o conteúdo de `supabase/functions/google-calendar/index.ts` e publique.
3. Abra a função → **Details** → desligue **Verify JWT with legacy secret** (ou "Enforce JWT") → **Save**. O Google volta para essa função sem o login do Supabase; a própria função confere o login nos outros pedidos.
4. Se o painel criou outro nome, coloque `VITE_SUPABASE_GCAL_FUNCTION=<nome>` no `.env.local`.

### 8.2 Google Cloud

1. Abra https://console.cloud.google.com e crie um projeto (ex.: **Organizador**).
2. **APIs e serviços → Biblioteca** → procure **Google Calendar API** → **Ativar**.
3. **APIs e serviços → Tela de consentimento OAuth** (Google Auth Platform):
   - Tipo de usuário: **Externo**. Nome do app, e-mail de suporte e e-mail de contato.
   - Em **Público-alvo**, adicione como **usuários de teste** os e-mails Google que vão conectar (até 100).
4. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - **URIs de redirecionamento autorizados**: `https://SEU-PROJETO.supabase.co/functions/v1/google-calendar` (troque pelo endereço do seu projeto e pelo nome da função).
   - Crie e copie o **ID do cliente** e a **Chave secreta do cliente**.

### 8.3 Segredos

Em **Edge Functions → Secrets** adicione (cole direto no painel, nunca no chat ou no código):

| Nome | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | ID do cliente OAuth |
| `GOOGLE_CLIENT_SECRET` | chave secreta do cliente |
| `APP_ORIGINS` (opcional) | sites que podem receber a volta do login, separados por vírgula. Padrão: `https://blcker3145.github.io,http://localhost:5173` |

Pronto: no app, **Agenda → Conectar Google Agenda**.

### 8.4 Sobre o modo de teste do Google

- Enquanto o app estiver em **Teste** no Google Cloud, só os usuários de teste conseguem conectar, e o Google **expira a conexão a cada 7 dias**. O Organizador avisa e basta clicar em **Conectar** de novo.
- Para liberar para qualquer pessoa sem expirar, publique o app na tela de consentimento. Como a agenda é um acesso "sensível", o Google pede verificação (política de privacidade, domínio, vídeo). Sem verificar, aparece o aviso "O Google não verificou este app" (dá para continuar em **Avançado**).

## 9. Compartilhar o quadro de Criativos (opcional)

Gera um link só de leitura do quadro para clientes e parceiros. Quem abre não entra em conta nenhuma, vê apenas os Criativos e não consegue editar. Se quiser, a pessoa pede permissão para comentar e você libera dentro do app.

1. **SQL Editor → New query**, cole tudo de `supabase/migrations/0003_compartilhar.sql` e clique em **Run**.
2. **Edge Functions → Deploy a new function → Via Editor**. Nome: `share` (exatamente assim).
3. Apague o exemplo, cole tudo de `supabase/functions/share/index.ts` e clique em **Deploy function**.
4. **Desligue** a opção **Verify JWT** dessa função: quem recebe o link não tem login.

Pronto. No app, abra **Criativos → Compartilhar**, crie o link e mande para quem quiser.

- Para tirar o acesso de todos, use **Desativar este link**.
- Os comentários chegam no mesmo painel, com o nome de quem escreveu.
- Nenhum outro módulo (tarefas, finanças, agenda, notas) sai no link.

## 10. Botão de feedback (opcional)

Coloca um botão "Feedback" no canto superior direito de todas as telas, com nota de 1 a 5 estrelas e um recado.

1. **SQL Editor → New query**, cole tudo de `supabase/migrations/0004_feedback.sql` e clique em **Run**.
2. Pronto. Cada pessoa vê só o que enviou; quem administra vê tudo em **Configurações → Feedback recebido**.

O e-mail de quem administra está no próprio SQL (função `is_app_admin`) e em `src/lib/feedback.ts`. Se mudar de conta, troque nos dois lugares.

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| "Falta conectar o Supabase" | Confira o `.env.local` e rode `npm run dev` de novo |
| "Não foi possível carregar seus dados" | O SQL do passo 2 não foi aplicado |
| "A função ai ainda não foi publicada" | Refaça o passo 4 com o nome `ai`. Se o painel criou outro endereço (ex.: `smart-task`), coloque `VITE_SUPABASE_AI_FUNCTION=smart-task` no `.env.local` |
| "adicione o segredo GEMINI_API_KEY ou OPENAI_API_KEY" | Refaça o passo 5 |
| "A cota gratuita do Gemini acabou" | Espere um minuto; se continuar, a cota diária renova no dia seguinte |
| "A conta da OpenAI está sem créditos" | Adicione saldo em platform.openai.com → Billing |
| Link do e-mail volta para a página errada | Confira as URLs do passo 3 |
| "Esse link expirou ou já foi usado" | Peça um novo e abra no mesmo navegador em que pediu |
| "A integração ainda não foi configurada no servidor" (Agenda) | Faltam os segredos do passo 8.3 |
| "A função do Google Agenda ainda não foi publicada" | Refaça o passo 8.1 |
| Google mostra "redirect_uri_mismatch" | O endereço do passo 8.2.4 precisa ser idêntico ao da função |
| "Não foi possível salvar a conexão" | O SQL do passo 8.1 não foi aplicado |
| Google mostra "Acesso bloqueado" / "app em teste" | Adicione o e-mail em usuários de teste (8.2.3) |
| "A Google Calendar API não está ativada" | Refaça o passo 8.2.2 |
| "Falta rodar o SQL do compartilhamento" | Refaça o passo 9.1 |
| Link compartilhado diz "Não foi possível falar com o servidor" | Publique a função `share` (passo 9.2) com Verify JWT desligado |
| "Falta rodar o SQL do feedback" | Refaça o passo 10.1 |
