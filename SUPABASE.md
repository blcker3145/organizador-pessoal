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
