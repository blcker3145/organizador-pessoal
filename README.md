# Organizador pessoal

App web de organização pessoal no estilo Notion: Hoje, Tarefas, Ideias & Notas, Vídeos (pipeline + roteiro), Criativos (planejamento de peças de design), Hábitos, Rotina e Finanças.

Front-end em React + TypeScript + Vite. Login, dados de cada conta e IA (ChatGPT) pelo Supabase: veja [SUPABASE.md](SUPABASE.md) para configurar.

Site publicado: https://blcker3145.github.io/organizador-pessoal/

## Rodar

```bash
npm install
cp .env.example .env.local   # preencha com os dados do Supabase
npm run dev
```

Abra http://localhost:5173.

## Atalhos

- `Ctrl K`: buscar em tudo
- `N`: captura rápida (fora de campos de texto)
- `/` no editor: títulos, listas, checklist, citação, divisor
- `Esc`: fecha janela ou painel

## Estrutura

- `src/lib/`: tipos, estado e ações (`store.ts`), dados de exemplo (`seed.ts`), regras de hábitos, finanças, datas e leitura da captura rápida
- `src/components/`: barra lateral, editor de blocos, painel de tarefa, captura rápida, busca, calendário
- `src/pages/`: uma tela por módulo

## Publicação

O site é publicado no GitHub Pages a partir da branch `gh-pages`. Para publicar uma nova versão:

```bash
npm run deploy
```

O script compila o app e envia a pasta `dist` para a branch `gh-pages`. Em 1 ou 2 minutos o site atualiza.

Os dados do site publicado ficam no navegador de quem acessa, separados dos dados do `localhost`. Para levar seus dados, use Configurações → Exportar backup em um endereço e Importar backup no outro.
