import { addDays, monthKey, startOfWeek, today, weekday } from "./dates";
import { boardFieldDefaults, defaultCreativeBoard, normalizeBoardState } from "./board";
import { BRIEFING_SECTIONS } from "./creatives";
import type { AppState, Block, Creative, Habit, Routine, Task, Transaction, Video } from "./types";
import { uid } from "./util";

export function emptyState(): AppState {
  return {
    version: 1,
    profile: { name: "" },
    settings: { theme: "system" },
    tasks: [],
    projects: [],
    notes: [],
    videos: [],
    creatives: [],
    creativeBoard: defaultCreativeBoard(),
    scriptTemplates: [
      { id: "tpl-longo", name: "YouTube longo", sections: ["Gancho (0–5 s)", "Contexto", "Desenvolvimento", "Chamada para ação"] },
      { id: "tpl-curto", name: "Vídeo curto", sections: ["Gancho (0–3 s)", "Conteúdo", "Final / CTA"] },
    ],
    habits: [],
    habitLogs: {},
    routines: [],
    routineLogs: {},
    categories: [],
    transactions: [],
    bills: [],
    goals: [],
    budgets: {},
    favorites: [],
    events: [],
    calendarPrefs: { hidden: [], defaultCalendarId: "primary", view: "week" },
  };
}

const b = (type: Block["type"], text = "", checked?: boolean): Block => ({ id: uid(), type, text, checked });

export function createSeed(): AppState {
  const s = emptyState();
  const d0 = today();
  const d = (n: number) => addDays(d0, n);
  const now = Date.now();
  const ago = (days: number) => now - days * 86400000;

  s.profile.name = "";

  /* Projetos */
  const pTrab = { id: uid(), name: "Trabalho" };
  const pPes = { id: uid(), name: "Pessoal" };
  const pVid = { id: uid(), name: "Vídeos" };
  const pDesign = { id: uid(), name: "Design" };
  s.projects = [pTrab, pPes, pVid, pDesign];

  /* Notas */
  const noteTrello = {
    id: uid(),
    title: "Vídeo: por que larguei o Trello",
    kind: "video" as const,
    tags: ["produtividade", "ferramentas"],
    pinned: false,
    body: [
      b("p", "Contar a história de quando tentei usar 4 apps ao mesmo tempo. Mostrar o antes e depois da minha semana."),
      b("todo", "Buscar print antigo do quadro"),
      b("todo", "Listar os 4 apps que eu usava"),
    ],
    createdAt: ago(0),
    updatedAt: ago(0),
    converted: [],
  };
  s.notes = [
    noteTrello,
    {
      id: uid(),
      title: "Frases para ganchos",
      kind: "nota",
      tags: ["roteiro"],
      pinned: true,
      body: [
        b("bullet", "Eu perdia 2 horas toda segunda só tentando lembrar o que tinha pra fazer."),
        b("bullet", "Ninguém te conta isso sobre rotina matinal."),
        b("bullet", "Testei por 30 dias e o resultado foi estranho."),
      ],
      createdAt: ago(3),
      updatedAt: ago(3),
      converted: [],
    },
    {
      id: uid(),
      title: "Presente de aniversário da mãe",
      kind: "ideia",
      tags: ["família"],
      pinned: false,
      body: [b("p", "Ela comentou que queria uma cafeteira nova. Ver modelos até o fim do mês.")],
      createdAt: ago(1),
      updatedAt: ago(1),
      converted: [],
    },
    {
      id: uid(),
      title: "Resumo: Hábitos Atômicos",
      kind: "nota",
      tags: ["livros"],
      pinned: false,
      body: [
        b("h2", "Ideias principais"),
        b("number", "Hábitos são juros compostos do autoaperfeiçoamento."),
        b("number", "Foque no sistema, não na meta."),
        b("number", "Torne óbvio, atraente, fácil e satisfatório."),
        b("quote", "Você não sobe ao nível das suas metas, você cai ao nível dos seus sistemas."),
      ],
      createdAt: ago(5),
      updatedAt: ago(5),
      converted: [],
    },
    {
      id: uid(),
      title: "Mudar a mesa de lugar",
      kind: "ideia",
      tags: ["casa"],
      pinned: false,
      body: [b("p", "Luz da janela ficaria de lado, melhor para gravar.")],
      createdAt: ago(8),
      updatedAt: ago(8),
      converted: [],
    },
  ];

  /* Vídeos */
  const vSemana: Video = {
    id: uid(),
    title: "Como organizo minha semana",
    stage: "roteiro",
    platforms: ["YouTube", "Shorts"],
    format: "longo",
    publishDate: d(3),
    publishTime: "18:00",
    script: [
      b("h2", "Gancho (0–5 s)"),
      b("p", "Eu perdia 2 horas toda segunda só tentando lembrar o que tinha pra fazer."),
      b("h2", "Contexto"),
      b("p", "Durante muito tempo eu anotava tudo em lugares diferentes: bloco de notas, agenda de papel, lembrete no celular. No domingo à noite parecia que a semana já começava atrasada."),
      b("h2", "Desenvolvimento"),
      b("number", "Domingo: revisão de 15 minutos olhando a semana que passou."),
      b("number", "Escolho os 3 focos da semana, nunca mais que isso."),
      b("number", "Bloqueio horários no calendário para o que é importante."),
      b("h2", "Chamada para ação"),
      b("p", "Deixa nos comentários qual app você usa para se organizar."),
    ],
    references: [{ id: uid(), label: "Vídeo de inspiração", url: "https://youtube.com" }],
    caption: "Meu sistema simples para organizar a semana em 15 minutos.\n\n#produtividade #organização #rotina",
    publishedUrl: "",
    noteId: null,
    createdAt: ago(6),
    updatedAt: ago(1),
  };
  const vRotina: Video = {
    id: uid(),
    title: "Rotina matinal real",
    stage: "gravacao",
    platforms: ["YouTube"],
    format: "longo",
    publishDate: d(9),
    publishTime: "18:00",
    script: [b("h2", "Gancho (0–5 s)"), b("p", "Essa é a minha rotina de verdade, sem filtro."), b("h2", "Desenvolvimento"), b("bullet", "Acordar 6:30"), b("bullet", "Café sem celular"), b("bullet", "Leitura")],
    references: [],
    caption: "",
    publishedUrl: "",
    noteId: null,
    createdAt: ago(12),
    updatedAt: ago(2),
  };
  const mk = (title: string, stage: Video["stage"], platforms: string[], format: Video["format"], publishDate: string | null, extra: Partial<Video> = {}): Video => ({
    id: uid(),
    title,
    stage,
    platforms,
    format,
    publishDate,
    publishTime: "18:00",
    script: [b("p")],
    references: [],
    caption: "",
    publishedUrl: "",
    noteId: null,
    createdAt: ago(10),
    updatedAt: ago(4),
    ...extra,
  });
  s.videos = [
    mk("3 erros ao montar uma rotina", "ideia", ["Reels"], "curto", null),
    mk("Quanto custa meu setup de gravação", "ideia", ["YouTube"], "longo", null),
    vSemana,
    mk("Tour pela mesa de trabalho", "roteiro", ["TikTok", "Reels"], "curto", null),
    vRotina,
    mk("Planner digital grátis", "edicao", ["Shorts"], "curto", d(5)),
    mk("5 apps que uso todo dia", "agendado", ["YouTube"], "longo", d(2)),
    mk("Minha agenda de papel", "publicado", ["YouTube"], "longo", d(-12), { publishedUrl: "https://youtube.com" }),
    mk("Como leio 20 livros por ano", "publicado", ["YouTube", "Shorts"], "longo", d(-26), { publishedUrl: "https://youtube.com" }),
  ];

  /* Criativos */
  const briefing = (answers: string[]): Block[] =>
    BRIEFING_SECTIONS.flatMap((section, i) => [b("h2", section), b("p", answers[i] || "")]);
  const cr = (title: string, extra: Partial<Creative>): Creative => ({
    ...boardFieldDefaults(),
    id: uid(),
    title,
    stage: "ideia",
    format: "Post feed",
    size: "1080×1350",
    channels: ["Instagram"],
    client: "",
    dueDate: null,
    briefing: briefing([]),
    headline: "",
    bodyText: "",
    cta: "",
    slides: [],
    palette: [],
    fonts: "",
    moodboard: [],
    references: [],
    fileUrl: "",
    noteId: null,
    createdAt: ago(7),
    updatedAt: ago(2),
    ...extra,
  });
  const cCarrossel = cr("Carrossel: 5 erros de identidade visual", {
    stage: "criacao",
    format: "Carrossel",
    client: "Perfil próprio",
    dueDate: d(2),
    briefing: briefing([
      "Gerar salvamentos e mostrar autoridade em identidade visual.",
      "Pequenos negócios que fizeram o logo sozinhos.",
      "Uma marca consistente vende mais do que um logo bonito.",
      "Minimalista, fundo claro, uma cor de destaque, tipografia grande.",
      "Último slide com chamada para o direct.",
    ]),
    headline: "5 erros que deixam sua marca amadora",
    cta: "Me chama no direct para uma análise da sua marca",
    slides: [
      { id: uid(), text: "5 erros que deixam sua marca amadora" },
      { id: uid(), text: "1. Usar 4 fontes diferentes" },
      { id: uid(), text: "2. Cores que mudam a cada post" },
      { id: uid(), text: "3. Logo sem versão para fundo escuro" },
      { id: uid(), text: "4 e 5. Fotos sem padrão e excesso de efeitos" },
      { id: uid(), text: "Quer uma análise? Me chama no direct" },
    ],
    palette: ["#1F1F1F", "#F5F2EC", "#E4572E"],
    fonts: "Títulos: Archivo Black · Texto: Inter",
    fileUrl: "https://www.figma.com",
  });
  const cBanner = cr("Banner da promoção de outubro", {
    stage: "revisao",
    format: "Banner site",
    size: "1920×600",
    channels: ["Site"],
    client: "Loja Aurora",
    dueDate: d(4),
    headline: "Outubro com 20% off",
    bodyText: "Em toda a coleção de outono",
    cta: "Comprar agora",
    palette: ["#2B3A55", "#F2E5D5", "#CE7777"],
  });
  s.creatives = [
    cr("Story de bastidores do estúdio", { format: "Story / Reels", size: "1080×1920" }),
    cr("Anúncio: pacote de identidade visual", { stage: "briefing", format: "Anúncio", size: "1080×1080", client: "Perfil próprio", dueDate: d(8) }),
    cCarrossel,
    cBanner,
    cr("Thumbnail: Como organizo minha semana", { stage: "aprovado", format: "Thumbnail YouTube", size: "1280×720", channels: ["YouTube"], dueDate: d(3) }),
    cr("Post de lançamento do portfólio", { stage: "entregue", dueDate: d(-6), client: "Perfil próprio" }),
  ];

  /* Tarefas */
  const t = (title: string, extra: Partial<Task> = {}): Task => ({
    id: uid(),
    title,
    status: "todo",
    priority: null,
    date: null,
    projectId: null,
    videoId: null,
    creativeId: null,
    noteId: null,
    tags: [],
    subtasks: [],
    body: [b("p")],
    repeat: "none",
    focusDate: null,
    createdAt: ago(3),
    completedAt: null,
    ...extra,
  });
  s.tasks = [
    t("Terminar roteiro \"Como organizo minha semana\"", { date: d0, priority: "alta", projectId: pVid.id, videoId: vSemana.id, focusDate: d0 }),
    t("Pagar fatura do cartão", { date: d0, priority: "alta", projectId: pPes.id, focusDate: d0 }),
    t("Responder orçamento do cliente", { date: d0, priority: "media", projectId: pTrab.id, focusDate: d0, status: "done", completedAt: now }),
    t("Enviar nota fiscal", { date: d(-1), priority: "alta", projectId: pTrab.id }),
    t("Gravar: Rotina matinal real", {
      date: d0,
      priority: "media",
      projectId: pVid.id,
      videoId: vRotina.id,
      subtasks: [
        { id: uid(), title: "Carregar bateria", done: true },
        { id: uid(), title: "Limpar o cenário", done: false },
        { id: uid(), title: "Gravar B-roll do café", done: false },
      ],
    }),
    t("Comprar cartão SD", { date: d0, priority: "baixa", projectId: pPes.id }),
    t("Ligar para o contador", { date: d0, priority: "media", projectId: pTrab.id, status: "doing" }),
    t("Editar: Rotina matinal real", { date: d(2), priority: "media", projectId: pVid.id, videoId: vRotina.id }),
    t("Renovar CNH", { date: d(4), priority: "alta", projectId: pPes.id }),
    t("Reunião de alinhamento", { date: d(1), priority: "media", projectId: pTrab.id }),
    t("Revisão semanal", { date: addDays(startOfWeek(d0), 6), repeat: "weekly", projectId: pPes.id }),
    t("Organizar pasta de referências", { projectId: pVid.id, priority: "baixa" }),
    t("Criar: Carrossel 5 erros de identidade visual", { date: d0, priority: "alta", projectId: pDesign.id, creativeId: cCarrossel.id }),
    t("Aplicar ajustes do cliente no banner", { date: d(1), priority: "media", projectId: pDesign.id, creativeId: cBanner.id }),
    t("Trocar senha do banco", { projectId: pPes.id }),
    t("Escrever roteiro: Como organizo minha semana", { date: d(-2), projectId: pVid.id, videoId: vSemana.id, status: "done", completedAt: ago(2) }),
    t("Separar referências: Como organizo minha semana", { date: d(-3), projectId: pVid.id, videoId: vSemana.id, status: "done", completedAt: ago(3) }),
  ];

  /* Hábitos */
  const hLeitura: Habit = { id: uid(), name: "Leitura 20 min", type: "bool", target: 1, unit: "", freq: { kind: "daily" }, archived: false, createdAt: ago(60) };
  const hAgua: Habit = { id: uid(), name: "Água", type: "qty", target: 2, unit: "L", freq: { kind: "daily" }, archived: false, createdAt: ago(60) };
  const hTreino: Habit = { id: uid(), name: "Treino", type: "bool", target: 1, unit: "", freq: { kind: "weekly", times: 3 }, archived: false, createdAt: ago(60) };
  const hIngles: Habit = { id: uid(), name: "Inglês 15 min", type: "bool", target: 1, unit: "", freq: { kind: "days", days: [1, 2, 3, 4, 5] }, archived: false, createdAt: ago(60) };
  const hTela: Habit = { id: uid(), name: "Sem tela após 23h", type: "bool", target: 1, unit: "", freq: { kind: "daily" }, archived: false, createdAt: ago(60) };
  s.habits = [hLeitura, hAgua, hTreino, hIngles, hTela];
  // histórico determinístico dos últimos 45 dias
  const rand = mulberry(7);
  for (let i = 45; i >= 1; i--) {
    const day = d(-i);
    const wd = weekday(day);
    const set = (h: Habit, v: number) => {
      s.habitLogs[h.id] = s.habitLogs[h.id] || {};
      s.habitLogs[h.id][day] = v;
    };
    if (i <= 12 || rand() < 0.75) set(hLeitura, 1);
    const water = Math.round((1 + rand() * 1.3) * 10) / 10;
    set(hAgua, water >= 1.9 ? 2 : water);
    if ([1, 3, 5].includes(wd) && rand() < 0.85) set(hTreino, 1);
    if (wd >= 1 && wd <= 5 && rand() < 0.45) set(hIngles, 1);
    if (i <= 5 || rand() < 0.6) set(hTela, 1);
  }
  s.habitLogs[hLeitura.id][d0] = 1;
  s.habitLogs[hAgua.id][d0] = 1.2;

  /* Rotinas */
  const weekdays = [1, 2, 3, 4, 5];
  const manha: Routine = {
    id: uid(),
    name: "Manhã",
    days: [0, 1, 2, 3, 4, 5, 6],
    start: "06:30",
    steps: [
      { id: uid(), title: "Água + alongamento", minutes: 10, habitId: null },
      { id: uid(), title: "Café sem celular", minutes: 20, habitId: null },
      { id: uid(), title: "Leitura", minutes: 20, habitId: hLeitura.id },
      { id: uid(), title: "Revisar o dia", minutes: 10, habitId: null },
      { id: uid(), title: "Treino", minutes: 40, habitId: hTreino.id },
    ],
  };
  const trabalho: Routine = {
    id: uid(),
    name: "Trabalho focado",
    days: weekdays,
    start: "09:00",
    steps: [
      { id: uid(), title: "Bloco 1: tarefa mais difícil", minutes: 90, habitId: null },
      { id: uid(), title: "Pausa", minutes: 15, habitId: null },
      { id: uid(), title: "Bloco 2: e-mails e mensagens", minutes: 45, habitId: null },
      { id: uid(), title: "Inglês", minutes: 15, habitId: hIngles.id },
    ],
  };
  const noite: Routine = {
    id: uid(),
    name: "Noite",
    days: [0, 1, 2, 3, 4, 5, 6],
    start: "21:30",
    steps: [
      { id: uid(), title: "Revisar tarefas não feitas", minutes: 10, habitId: null },
      { id: uid(), title: "Separar roupa de amanhã", minutes: 5, habitId: null },
      { id: uid(), title: "Desligar telas", minutes: 5, habitId: hTela.id },
      { id: uid(), title: "Ler antes de dormir", minutes: 20, habitId: null },
    ],
  };
  const revisao: Routine = {
    id: uid(),
    name: "Revisão de domingo",
    days: [0],
    start: "18:00",
    steps: [
      { id: uid(), title: "Olhar hábitos da semana", minutes: 5, habitId: null },
      { id: uid(), title: "Conferir orçamento do mês", minutes: 5, habitId: null },
      { id: uid(), title: "Escolher 3 focos da semana", minutes: 5, habitId: null },
    ],
  };
  s.routines = [manha, trabalho, noite, revisao];
  s.routineLogs[d0] = { [manha.steps[0].id]: true, [manha.steps[1].id]: true, [manha.steps[2].id]: true };

  /* Finanças */
  const cat = (name: string, kind: "entrada" | "saida", limit: number) => ({ id: uid(), name, kind, limit: limit * 100 });
  const cMoradia = cat("Moradia", "saida", 1800);
  const cMercado = cat("Mercado", "saida", 900);
  const cAlim = cat("Alimentação", "saida", 450);
  const cTransp = cat("Transporte", "saida", 350);
  const cLazer = cat("Lazer", "saida", 400);
  const cAssin = cat("Assinaturas", "saida", 150);
  const cSaude = cat("Saúde", "saida", 250);
  const cEquip = cat("Equipamento de vídeo", "saida", 500);
  const cMetas = cat("Metas e reserva", "saida", 0);
  const cReceita = cat("Receita", "entrada", 0);
  const cFreela = cat("Freela", "entrada", 0);
  s.categories = [cMoradia, cMercado, cAlim, cTransp, cLazer, cAssin, cSaude, cEquip, cMetas, cReceita, cFreela];

  const gReserva = { id: uid(), name: "Reserva de emergência", target: 1000000, initial: 380000, deadline: addDays(d0, 180) };
  const gCamera = { id: uid(), name: "Câmera nova", target: 350000, initial: 90000, deadline: addDays(d0, 120) };
  s.goals = [gReserva, gCamera];

  const bInternet = { id: uid(), name: "Internet", amount: 11990, day: 20, categoryId: cMoradia.id, active: true };
  const bAluguel = { id: uid(), name: "Aluguel", amount: 150000, day: 5, categoryId: cMoradia.id, active: true };
  const bCondo = { id: uid(), name: "Condomínio", amount: 30000, day: 10, categoryId: cMoradia.id, active: true };
  const bAcad = { id: uid(), name: "Academia", amount: 9900, day: 5, categoryId: cSaude.id, active: true };
  const bSpotify = { id: uid(), name: "Spotify", amount: 2190, day: 12, categoryId: cAssin.id, active: true };
  const bYT = { id: uid(), name: "YouTube Premium", amount: 2490, day: 25, categoryId: cAssin.id, active: true };
  s.bills = [bAluguel, bAcad, bCondo, bSpotify, bInternet, bYT];

  const txs: Transaction[] = [];
  const tx = (daysAgo: number, kind: "entrada" | "saida", reais: number, description: string, categoryId: string, account: string, extra: Partial<Transaction> = {}) => {
    const date = d(-daysAgo);
    txs.push({ id: uid(), kind, amount: Math.round(reais * 100), date, description, categoryId, account, billId: null, goalId: null, ...extra });
  };
  const key = monthKey(d0);
  const dayOfMonth = Number(d0.slice(8));
  const inMonth = (daysAgo: number) => daysAgo < dayOfMonth;
  const add = (...args: Parameters<typeof tx>) => {
    if (inMonth(args[0])) tx(...args);
  };
  const byDay = (day: number) => dayOfMonth - day; // dias atrás para um dia do mês
  add(0, "saida", 32.5, "Almoço", cAlim.id, "Nubank");
  add(0, "saida", 10.4, "Café", cAlim.id, "Nubank");
  add(1, "saida", 187.3, "Mercado da semana", cMercado.id, "Débito");
  add(2, "saida", 24.9, "Uber", cTransp.id, "Nubank");
  add(3, "saida", 89.9, "Cinema e pipoca", cLazer.id, "Nubank");
  add(4, "saida", 64.0, "Farmácia", cSaude.id, "Débito");
  add(5, "entrada", 2500, "Pagamento cliente", cFreela.id, "Itaú");
  add(6, "saida", 210.0, "Mercado do mês", cMercado.id, "Débito");
  add(7, "saida", 120.0, "Gasolina", cTransp.id, "Nubank");
  add(8, "saida", 145.0, "Show", cLazer.id, "Nubank");
  add(9, "saida", 58.7, "iFood", cAlim.id, "Nubank");
  add(10, "saida", 242.7, "Mercado", cMercado.id, "Débito");
  add(11, "saida", 145.0, "Bar com amigos", cLazer.id, "Nubank");
  add(12, "saida", 65.0, "Uber", cTransp.id, "Nubank");
  if (dayOfMonth >= 5) {
    add(byDay(5), "entrada", 4000, "Salário", cReceita.id, "Itaú");
    add(byDay(5), "saida", 1500, "Aluguel", cMoradia.id, "Itaú", { billId: bAluguel.id });
    add(byDay(5), "saida", 99, "Academia", cSaude.id, "Nubank", { billId: bAcad.id });
    add(byDay(5), "saida", 400, "Aporte reserva", cMetas.id, "Itaú", { goalId: gReserva.id });
  }
  if (dayOfMonth >= 10) add(byDay(10), "saida", 300, "Condomínio", cMoradia.id, "Itaú", { billId: bCondo.id });
  if (dayOfMonth >= 12) {
    add(byDay(12), "saida", 21.9, "Spotify", cAssin.id, "Nubank", { billId: bSpotify.id });
    add(byDay(12), "saida", 200, "Aporte câmera", cMetas.id, "Itaú", { goalId: gCamera.id });
  }
  s.transactions = txs.sort((a, bb) => (a.date < bb.date ? 1 : -1));
  s.budgets[key] = { income: 650000, limits: {} };

  s.favorites = [{ kind: "video", id: vSemana.id }];
  return normalizeBoardState(s);
}

/** Gerador pseudoaleatório com semente, para o histórico de exemplo ser sempre igual. */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
