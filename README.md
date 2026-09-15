# Organizador pessoal

App web de organização pessoal no estilo Notion: Hoje, Tarefas, Ideias & Notas, Vídeos (pipeline + roteiro), Criativos (planejamento de peças de design), Hábitos, Rotina e Finanças.

Front-end em React + TypeScript + Vite. Os dados ficam salvos no navegador (localStorage); na primeira abertura o app carrega dados de exemplo. Em Configurações dá para exportar/importar backup, restaurar os exemplos ou apagar tudo.

## Rodar

```bash
npm install
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
