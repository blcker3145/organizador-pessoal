import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Checkbox, Empty, Modal, MoneyInput, ProgressBar, Tabs } from "../components/common";
import { monthKey, monthLabel, numericDate, relativeDate, shiftMonthKey, today } from "../lib/dates";
import { accountsUsed, billPaid, dueDate, categoryLimit, goalCurrent, monthSummary, monthTransactions } from "../lib/finance";
import { createTransaction, insert, patch, remove, setBudgetIncome, setBudgetLimit, useApp } from "../lib/store";
import type { Bill, Goal, Transaction, TxKind } from "../lib/types";
import { navigate, ui } from "../lib/ui";
import { cx, money, moneyPlain, normalize, parseMoney, uid } from "../lib/util";

const TABS = [
  { value: "mes", label: "Mês" },
  { value: "lancamentos", label: "Lançamentos" },
  { value: "orcamento", label: "Orçamento" },
  { value: "metas", label: "Metas" },
  { value: "contas", label: "Contas fixas" },
];

type TxDraft = Partial<Transaction> | null;

export function FinancePage({ tab }: { tab: string }) {
  const [month, setMonth] = useState(monthKey(today()));
  const [txEdit, setTxEdit] = useState<TxDraft>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const current = TABS.some((t) => t.value === tab) ? tab : "mes";

  return (
    <div className="page" style={{ maxWidth: 1120 }}>
      <div className="page-head">
        <h1 className="page-title">Finanças</h1>
        <div className="row wrap">
          <div className="row" style={{ gap: 2 }}>
            <button className="icon-btn" onClick={() => setMonth(shiftMonthKey(month, -1))} aria-label="Mês anterior">
              <ChevronLeft size={16} />
            </button>
            <strong style={{ minWidth: 130, textAlign: "center" }}>{monthLabel(month)}</strong>
            <button className="icon-btn" onClick={() => setMonth(shiftMonthKey(month, 1))} aria-label="Próximo mês">
              <ChevronRight size={16} />
            </button>
          </div>
          <button className="btn" onClick={() => setCreatingCategory(true)}>
            <Plus size={15} /> Nova categoria
          </button>
          <button className="btn primary" onClick={() => setTxEdit({})}>
            <Plus size={15} /> Lançamento
          </button>
        </div>
      </div>
      <Tabs value={current} onChange={(v) => navigate(`/financas/${v}`)} items={TABS} />
      {current === "mes" && <MonthTab month={month} onEdit={setTxEdit} />}
      {current === "lancamentos" && <TransactionsTab month={month} onEdit={setTxEdit} />}
      {current === "orcamento" && <BudgetTab month={month} />}
      {current === "metas" && <GoalsTab />}
      {current === "contas" && <BillsTab month={month} />}
      {txEdit && <TransactionModal draft={txEdit} month={month} onClose={() => setTxEdit(null)} />}
      {creatingCategory && <CategoryModal onClose={() => setCreatingCategory(false)} />}
    </div>
  );
}

/* ---------------- Mês ---------------- */

function MonthTab({ month, onEdit }: { month: string; onEdit: (t: TxDraft) => void }) {
  const state = useApp();
  const sum = monthSummary(state, month);
  const d0 = today();
  const bills = state.bills
    .filter((b) => b.active)
    .map((b) => ({ bill: b, paid: billPaid(state, b, month) }))
    .sort((a, b) => Number(a.paid) - Number(b.paid) || a.bill.day - b.bill.day);
  const txs = monthTransactions(state, month).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="k">Entradas</div>
          <div className="v money-in">{money(sum.income)}</div>
          {sum.plannedIncome !== null && <div className="muted" style={{ fontSize: 12 }}>previsto {money(sum.plannedIncome)}</div>}
        </div>
        <div className="kpi">
          <div className="k">Saídas</div>
          <div className="v">{money(sum.expenses)}</div>
        </div>
        <div className="kpi">
          <div className="k">Saldo do mês</div>
          <div className={cx("v", sum.balance < 0 && "red")}>{money(sum.balance)}</div>
        </div>
        <div className="kpi">
          <div className="k">Orçamento usado</div>
          <div className={cx("v", sum.budgetUsedPct > 100 && "red")}>{sum.budgetUsedPct}%</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {money(sum.budgetSpent)} de {money(sum.budgetTotal)}
          </div>
        </div>
      </div>

      <div className="fin-grid">
        <section className="card">
          <div className="card-title">
            <span>Orçamento por categoria</span>
            <a className="link-btn" href="#/financas/orcamento">
              Ajustar limites
            </a>
          </div>
          {sum.byCategory.filter((c) => c.limit > 0 || c.spent > 0).length === 0 && <Empty>Defina limites na aba Orçamento.</Empty>}
          {sum.byCategory
            .filter((c) => c.limit > 0 || c.spent > 0)
            .map(({ cat, limit, spent }) => {
              const pct = limit ? (spent / limit) * 100 : 0;
              return (
                <div key={cat.id} className="bud-row">
                  <span className="ellipsis">{cat.name}</span>
                  {limit ? <ProgressBar pct={pct} /> : <span className="muted" style={{ fontSize: 12 }}>sem limite</span>}
                  <span className={cx("v", pct > 100 && "red")}>
                    {moneyPlain(spent)} / {limit ? moneyPlain(limit) : "—"}
                  </span>
                </div>
              );
            })}
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <div className="card-title">
              <span>Contas fixas</span>
              <a className="link-btn" href="#/financas/contas">
                Gerenciar
              </a>
            </div>
            {bills.length === 0 && <Empty>Nenhuma conta fixa.</Empty>}
            {bills.map(({ bill, paid }) => (
              <BillLine key={bill.id} bill={bill} paid={paid} month={month} today={d0} />
            ))}
          </section>
          <section className="card">
            <div className="card-title">
              <span>Metas</span>
              <a className="link-btn" href="#/financas/metas">
                Ver metas
              </a>
            </div>
            {state.goals.length === 0 && <Empty>Nenhuma meta.</Empty>}
            {state.goals.map((g) => {
              const cur = goalCurrent(state, g);
              return (
                <div key={g.id} className="stack" style={{ gap: 4, padding: "4px 0" }}>
                  <div className="row">
                    <span className="grow ellipsis">{g.name}</span>
                    <span className="muted num" style={{ fontSize: 12.5 }}>
                      {money(cur)} / {money(g.target)}
                    </span>
                  </div>
                  <ProgressBar pct={(cur / g.target) * 100} warnAt={999} />
                </div>
              );
            })}
          </section>
        </div>
      </div>

      <section className="card">
        <div className="card-title">
          <span>Últimos lançamentos</span>
          <a className="link-btn" href="#/financas/lancamentos">
            Ver todos
          </a>
        </div>
        <TxTable txs={txs.slice(0, 8)} onEdit={onEdit} />
      </section>
    </>
  );
}

function BillLine({ bill, paid, month, today: d0 }: { bill: Bill; paid: boolean; month: string; today: string }) {
  const state = useApp();
  const due = dueDate(month, bill.day);
  const late = !paid && due < d0;
  const pay = (v: boolean) => {
    if (v) {
      const date = month === monthKey(d0) ? d0 : due;
      createTransaction({ kind: "saida", amount: bill.amount, description: bill.name, categoryId: bill.categoryId, date, billId: bill.id });
      ui.toast(`${bill.name} marcada como paga (${money(bill.amount)})`);
    } else {
      const tx = state.transactions.find((t) => t.billId === bill.id && monthKey(t.date) === month);
      if (tx) remove("transactions", tx.id);
      ui.toast(`Pagamento de ${bill.name} desfeito`);
    }
  };
  return (
    <div className={cx("step-row", paid && "done")}>
      <Checkbox checked={paid} onChange={pay} label={paid ? `Desfazer pagamento de ${bill.name}` : `Marcar ${bill.name} como paga`} />
      <span className="s-title grow ellipsis">{bill.name}</span>
      <span className={cx("muted num", late && "red")} style={{ fontSize: 12.5 }}>
        {paid ? "paga" : late ? `venceu ${numericDate(due)}` : `vence ${numericDate(due)}`}
      </span>
      <strong className="num" style={{ fontWeight: 500, minWidth: 90, textAlign: "right" }}>
        {money(bill.amount)}
      </strong>
    </div>
  );
}

function TxTable({ txs, onEdit }: { txs: Transaction[]; onEdit: (t: TxDraft) => void }) {
  const state = useApp();
  if (txs.length === 0) return <Empty>Nenhum lançamento.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table" style={{ minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ width: 70 }}>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Conta</th>
            <th style={{ textAlign: "right" }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {txs.map((t) => {
            const cat = state.categories.find((c) => c.id === t.categoryId);
            const goal = t.goalId ? state.goals.find((g) => g.id === t.goalId) : null;
            return (
              <tr key={t.id} className="click" onClick={() => onEdit(t)}>
                <td className="muted num">{numericDate(t.date)}</td>
                <td>
                  {t.description}
                  {goal && <span className="pill purple" style={{ marginLeft: 6 }}>meta: {goal.name}</span>}
                  {t.billId && <span className="pill" style={{ marginLeft: 6 }}>conta fixa</span>}
                </td>
                <td>{cat ? <span className={cx("pill", t.kind === "entrada" && "green")}>{cat.name}</span> : <span className="muted">—</span>}</td>
                <td className="muted">{t.account || "—"}</td>
                <td className={cx("num", t.kind === "entrada" && "money-in")} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {t.kind === "entrada" ? "+ " : "− "}
                  {moneyPlain(t.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Lançamentos ---------------- */

function TransactionsTab({ month, onEdit }: { month: string; onEdit: (t: TxDraft) => void }) {
  const state = useApp();
  const [kind, setKind] = useState("");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [allMonths, setAllMonths] = useState(false);
  const txs = (allMonths ? state.transactions : monthTransactions(state, month))
    .filter((t) => (!kind || t.kind === kind) && (!cat || (cat === "__none" ? !t.categoryId : t.categoryId === cat)))
    .filter((t) => !q || normalize(`${t.description} ${t.account}`).includes(normalize(q)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const inSum = txs.filter((t) => t.kind === "entrada").reduce((s, t) => s + t.amount, 0);
  const outSum = txs.filter((t) => t.kind === "saida").reduce((s, t) => s + t.amount, 0);

  return (
    <>
      <div className="filters">
        <input id="tx-search" className="input" style={{ width: 200, minHeight: 28 }} placeholder="Buscar descrição" value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="tx-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
          <option value="">Entradas e saídas</option>
          <option value="entrada">Só entradas</option>
          <option value="saida">Só saídas</option>
        </select>
        <select id="tx-cat" className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {state.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__none">Sem categoria</option>
        </select>
        <label className="row" style={{ gap: 6, fontSize: 13, cursor: "pointer" }}>
          <Checkbox checked={allMonths} onChange={setAllMonths} label="Todos os meses" /> Todos os meses
        </label>
        <span className="grow" />
        <span className="muted num" style={{ fontSize: 13 }}>
          {txs.length} lançamentos · <span className="money-in">+ {moneyPlain(inSum)}</span> · − {moneyPlain(outSum)}
        </span>
      </div>
      <TxTable txs={txs} onEdit={onEdit} />
    </>
  );
}

function TransactionModal({ draft, month, onClose }: { draft: Partial<Transaction>; month: string; onClose: () => void }) {
  const state = useApp();
  const editing = !!draft.id;
  const defaultDate = month === monthKey(today()) ? today() : `${month}-01`;
  const [kind, setKind] = useState<TxKind>(draft.kind || "saida");
  const [amount, setAmount] = useState(draft.amount ? moneyPlain(draft.amount) : "");
  const [description, setDescription] = useState(draft.description || "");
  const [categoryId, setCategoryId] = useState(draft.categoryId || "");
  const [date, setDate] = useState(draft.date || defaultDate);
  const [account, setAccount] = useState(draft.account || "");
  const [goalId, setGoalId] = useState(draft.goalId || "");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const cents = parseMoney(amount);
  const valid = !!cents && cents > 0 && !!date;

  const save = () => {
    if (!valid) return;
    const cat = state.categories.find((c) => c.id === categoryId);
    const data = { kind, amount: cents!, description: description.trim() || cat?.name || (kind === "entrada" ? "Entrada" : "Gasto"), categoryId: categoryId || null, date, account: account.trim(), goalId: kind === "saida" && goalId ? goalId : null };
    if (editing) {
      patch("transactions", draft.id!, data);
      ui.toast("Lançamento atualizado");
    } else {
      createTransaction(data);
      ui.toast(`${kind === "entrada" ? "Entrada" : "Saída"} de ${money(cents!)} registrada`);
    }
    onClose();
  };

  const del = async () => {
    const ok = await ui.confirm({ title: "Excluir lançamento?", message: `${draft.description} · ${money(draft.amount || 0)}`, confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    remove("transactions", draft.id!);
    ui.toast("Lançamento excluído");
    onClose();
  };

  return (
    <>
    <Modal
      title={editing ? "Editar lançamento" : "Novo lançamento"}
      onClose={onClose}
      footer={
        <>
          {editing && (
            <button className="btn danger" onClick={del} style={{ marginRight: "auto" }}>
              <Trash2 size={14} /> Excluir
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={!valid}>
            Salvar
          </button>
        </>
      }
    >
      <div className="row">
        <button className={cx("chip-toggle", kind === "saida" && "on")} onClick={() => (setKind("saida"), setCategoryId(""))}>
          Saída
        </button>
        <button className={cx("chip-toggle", kind === "entrada" && "on")} onClick={() => (setKind("entrada"), setCategoryId(""), setGoalId(""))}>
          Entrada
        </button>
      </div>
      <form
        className="grid-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
            save();
          }
        }}
      >
        <label className="field">
          Valor
          <MoneyInput id="tx-amount" value={amount} onChange={setAmount} autoFocus />
        </label>
        <label className="field">
          Data
          <input id="tx-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          Descrição
          <input id="tx-desc" className="input" value={description} placeholder={kind === "saida" ? "Ex.: Mercado da semana" : "Ex.: Pagamento cliente"} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="field">
          Categoria
          <select
            id="tx-category"
            className="select"
            value={categoryId}
            onChange={(e) => (e.target.value === NEW_CATEGORY ? setCreatingCategory(true) : setCategoryId(e.target.value))}
          >
            <option value="">Sem categoria</option>
            {state.categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            <option value={NEW_CATEGORY}>+ Nova categoria…</option>
          </select>
        </label>
        <label className="field">
          Conta
          <input id="tx-account" className="input" list="tx-accounts" value={account} placeholder="Nubank, Débito, Pix…" onChange={(e) => setAccount(e.target.value)} />
          <datalist id="tx-accounts">
            {accountsUsed(state).map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        {kind === "saida" && state.goals.length > 0 && (
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            É um aporte para uma meta?
            <select id="tx-goal" className="select" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">Não</option>
              {state.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </form>
    </Modal>
    {creatingCategory && <CategoryModal initialKind={kind} onClose={() => setCreatingCategory(false)} onCreated={setCategoryId} />}
    </>
  );
}

/* ---------------- Categorias ---------------- */

const NEW_CATEGORY = "__new_category";

export function CategoryModal({ initialKind = "saida", onClose, onCreated }: { initialKind?: TxKind; onClose: () => void; onCreated?: (id: string) => void }) {
  const state = useApp();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TxKind>(initialKind);
  const [limit, setLimit] = useState("");
  const trimmed = name.trim();
  const duplicate = state.categories.some((c) => c.kind === kind && normalize(c.name) === normalize(trimmed));
  const valid = !!trimmed && !duplicate;

  const save = () => {
    if (!valid) return;
    const id = uid();
    insert("categories", { id, name: trimmed, kind, limit: kind === "saida" ? parseMoney(limit) || 0 : 0 });
    ui.toast(`Categoria "${trimmed}" criada`);
    onCreated?.(id);
    onClose();
  };

  return (
    <Modal
      title="Nova categoria"
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={!valid}>
            Criar categoria
          </button>
        </>
      }
    >
      <div className="row">
        <button className={cx("chip-toggle", kind === "saida" && "on")} onClick={() => setKind("saida")}>
          Saída
        </button>
        <button className={cx("chip-toggle", kind === "entrada" && "on")} onClick={() => setKind("entrada")}>
          Entrada
        </button>
      </div>
      <form
        className="stack"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
            save();
          }
        }}
      >
        <label className="field">
          Nome
          <input id="category-name" className="input" autoFocus value={name} placeholder={kind === "saida" ? "Ex.: Pets, Educação, Presentes" : "Ex.: Aluguel recebido, Vendas"} onChange={(e) => setName(e.target.value)} />
          {duplicate && <span className="red">Já existe uma categoria de {kind === "saida" ? "saída" : "entrada"} com esse nome.</span>}
        </label>
        {kind === "saida" && (
          <label className="field">
            Limite mensal (opcional)
            <MoneyInput id="category-limit" value={limit} onChange={setLimit} />
            <span className="muted">Vira o limite padrão de todo mês no Orçamento. Deixe vazio para não ter limite.</span>
          </label>
        )}
      </form>
    </Modal>
  );
}

/* ---------------- Orçamento ---------------- */

function BudgetTab({ month }: { month: string }) {
  const state = useApp();
  const sum = monthSummary(state, month);
  const planned = sum.plannedIncome;
  const leftover = (planned ?? 0) - sum.budgetTotal;
  const prev = shiftMonthKey(month, -1);
  const copyPrev = () => {
    const prevBudget = state.budgets[prev];
    state.categories
      .filter((c) => c.kind === "saida")
      .forEach((c) => setBudgetLimit(month, c.id, categoryLimit(state, c, prev)));
    if (prevBudget?.income != null) setBudgetIncome(month, prevBudget.income);
    ui.toast(`Limites copiados de ${monthLabel(prev)}`);
  };

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Planeje o mês: quanto espera receber e quanto pode gastar em cada categoria. O limite vale só para {monthLabel(month)}; o padrão de cada categoria fica em Configurações.
      </p>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <div className="kpi">
          <div className="k">Renda prevista</div>
          <BudgetMoney value={planned} onCommit={(v) => setBudgetIncome(month, v)} ariaLabel="Renda prevista" />
        </div>
        <div className="kpi">
          <div className="k">Total planejado em gastos</div>
          <div className="v">{money(sum.budgetTotal)}</div>
        </div>
        <div className="kpi">
          <div className="k">Sobra planejada</div>
          <div className={cx("v", leftover < 0 && "red")}>{planned === null ? "—" : money(leftover)}</div>
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="btn sm" onClick={copyPrev}>
          Copiar limites de {monthLabel(prev)}
        </button>
      </div>
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Categoria</th>
              <th style={{ width: 170 }}>Limite do mês</th>
              <th style={{ width: 130, textAlign: "right" }}>Gasto</th>
              <th style={{ width: 160 }}>Uso</th>
            </tr>
          </thead>
          <tbody>
            {sum.byCategory.map(({ cat, limit, spent }) => {
              const pct = limit ? (spent / limit) * 100 : 0;
              return (
                <tr key={cat.id}>
                  <td>{cat.name}</td>
                  <td>
                    <BudgetMoney value={limit} onCommit={(v) => setBudgetLimit(month, cat.id, v ?? 0)} ariaLabel={`Limite de ${cat.name}`} small />
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {money(spent)}
                  </td>
                  <td>
                    <div className="row">
                      <ProgressBar pct={limit ? pct : 0} />
                      <span className={cx("muted num", pct > 100 && "red")} style={{ fontSize: 12, width: 38, textAlign: "right" }}>
                        {limit ? `${Math.round(pct)}%` : "—"}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BudgetMoney({ value, onCommit, ariaLabel, small }: { value: number | null; onCommit: (v: number | null) => void; ariaLabel: string; small?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : moneyPlain(value));
  return (
    <div className="row" style={{ gap: 4 }}>
      <span className="muted">R$</span>
      <input
        className={cx("input num", small && "bare")}
        style={small ? undefined : { fontSize: 18, fontWeight: 600 }}
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder="0,00"
        value={shown}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={() => {
          if (draft === null) return;
          onCommit(draft.trim() ? parseMoney(draft) ?? 0 : null);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

/* ---------------- Metas ---------------- */

function GoalsTab() {
  const state = useApp();
  const [edit, setEdit] = useState<Goal | "new" | null>(null);
  const [contribute, setContribute] = useState<Goal | null>(null);
  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn" onClick={() => setEdit("new")}>
          <Plus size={14} /> Nova meta
        </button>
      </div>
      {state.goals.length === 0 && <Empty>Nenhuma meta. Crie uma para juntar dinheiro com objetivo.</Empty>}
      <div className="grid-2" style={{ gap: 16 }}>
        {state.goals.map((g) => {
          const cur = goalCurrent(state, g);
          const pct = (cur / g.target) * 100;
          const missing = Math.max(0, g.target - cur);
          const monthsLeft = g.deadline ? Math.max(1, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / (30 * 86400000))) : null;
          const aportes = state.transactions.filter((t) => t.goalId === g.id).sort((a, b) => b.date.localeCompare(a.date));
          return (
            <section key={g.id} className="card">
              <div className="row" style={{ marginBottom: 6 }}>
                <strong className="grow" style={{ fontSize: 16 }}>
                  {g.name}
                </strong>
                <button className="btn ghost sm" onClick={() => setEdit(g)}>
                  Editar
                </button>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>
                  {money(cur)}
                </span>
                <span className="muted num">de {money(g.target)}</span>
              </div>
              <div className="row" style={{ margin: "8px 0" }}>
                <ProgressBar pct={pct} warnAt={999} />
                <span className="muted num" style={{ fontSize: 12.5 }}>
                  {Math.round(pct)}%
                </span>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {missing === 0
                  ? "Meta alcançada."
                  : `Faltam ${money(missing)}${g.deadline ? ` até ${relativeDate(g.deadline)}: cerca de ${money(Math.ceil(missing / monthsLeft!))} por mês` : ""}.`}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary sm" onClick={() => setContribute(g)}>
                  <Plus size={14} /> Aportar
                </button>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {aportes.length} aporte(s)
                </span>
              </div>
            </section>
          );
        })}
      </div>
      {edit && <GoalModal goal={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {contribute && <ContributeModal goal={contribute} onClose={() => setContribute(null)} />}
    </>
  );
}

function GoalModal({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const [name, setName] = useState(goal?.name || "");
  const [target, setTarget] = useState(goal ? moneyPlain(goal.target) : "");
  const [initial, setInitial] = useState(goal ? moneyPlain(goal.initial) : "");
  const [deadline, setDeadline] = useState(goal?.deadline || "");
  const t = parseMoney(target);
  const valid = !!name.trim() && !!t && t > 0;
  const save = () => {
    if (!valid) return;
    const data = { name: name.trim(), target: t!, initial: parseMoney(initial) || 0, deadline: deadline || null };
    if (goal) patch("goals", goal.id, data);
    else insert("goals", { id: uid(), ...data });
    ui.toast(goal ? "Meta atualizada" : "Meta criada");
    onClose();
  };
  const del = async () => {
    if (!goal) return;
    const ok = await ui.confirm({ title: "Excluir meta?", message: "Os aportes continuam em Lançamentos, sem vínculo com a meta.", confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    remove("goals", goal.id);
    onClose();
  };
  return (
    <Modal
      title={goal ? "Editar meta" : "Nova meta"}
      onClose={onClose}
      footer={
        <>
          {goal && (
            <button className="btn danger" style={{ marginRight: "auto" }} onClick={del}>
              Excluir
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!valid} onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <label className="field">
        Nome
        <input id="goal-name" className="input" autoFocus value={name} placeholder="Ex.: Reserva de emergência" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid-2">
        <label className="field">
          Valor alvo
          <MoneyInput id="goal-target" value={target} onChange={setTarget} />
        </label>
        <label className="field">
          Já guardado antes
          <MoneyInput id="goal-initial" value={initial} onChange={setInitial} />
        </label>
        <label className="field">
          Prazo (opcional)
          <input id="goal-deadline" className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function ContributeModal({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const state = useApp();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const cents = parseMoney(amount);
  const save = () => {
    if (!cents || cents <= 0) return;
    const cat = state.categories.find((c) => normalize(c.name).startsWith("metas"));
    createTransaction({ kind: "saida", amount: cents, description: `Aporte: ${goal.name}`, goalId: goal.id, categoryId: cat?.id || null, date });
    ui.toast(`Aporte de ${money(cents)} em ${goal.name}`);
    onClose();
  };
  return (
    <Modal
      title={`Aportar em ${goal.name}`}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!cents} onClick={save}>
            Aportar
          </button>
        </>
      }
    >
      <form
        className="grid-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
            save();
          }
        }}
      >
        <label className="field">
          Valor
          <MoneyInput id="contrib-amount" value={amount} onChange={setAmount} autoFocus />
        </label>
        <label className="field">
          Data
          <input id="contrib-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </form>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        O aporte entra como saída do mês, na categoria de metas.
      </p>
    </Modal>
  );
}

/* ---------------- Contas fixas ---------------- */

function BillsTab({ month }: { month: string }) {
  const state = useApp();
  const [edit, setEdit] = useState<Bill | "new" | null>(null);
  const total = state.bills.filter((b) => b.active).reduce((s, b) => s + b.amount, 0);
  const sorted = [...state.bills].sort((a, b) => Number(b.active) - Number(a.active) || a.day - b.day);
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted grow">
          Contas que se repetem todo mês. Total ativo: <strong className="num" style={{ color: "var(--text)" }}>{money(total)}</strong>
        </span>
        <button className="btn" onClick={() => setEdit("new")}>
          <Plus size={14} /> Nova conta fixa
        </button>
      </div>
      {sorted.length === 0 && <Empty>Nenhuma conta fixa.</Empty>}
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Conta</th>
              <th>Vencimento</th>
              <th>Categoria</th>
              <th style={{ textAlign: "right" }}>Valor</th>
              <th>{monthLabel(month)}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const cat = state.categories.find((c) => c.id === b.categoryId);
              const paid = billPaid(state, b, month);
              return (
                <tr key={b.id} className="click" onClick={() => setEdit(b)} style={{ opacity: b.active ? 1 : 0.5 }}>
                  <td>{b.name}</td>
                  <td className="num">dia {b.day}</td>
                  <td>{cat ? <span className="pill">{cat.name}</span> : <span className="muted">—</span>}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {money(b.amount)}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {b.active ? (
                      <BillLineCompact bill={b} paid={paid} month={month} />
                    ) : (
                      <span className="muted">pausada</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && <BillModal bill={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function BillLineCompact({ bill, paid, month }: { bill: Bill; paid: boolean; month: string }) {
  const state = useApp();
  const d0 = today();
  const toggle = (v: boolean) => {
    if (v) {
      const due = dueDate(month, bill.day);
      createTransaction({ kind: "saida", amount: bill.amount, description: bill.name, categoryId: bill.categoryId, date: month === monthKey(d0) ? d0 : due, billId: bill.id });
    } else {
      const tx = state.transactions.find((t) => t.billId === bill.id && monthKey(t.date) === month);
      if (tx) remove("transactions", tx.id);
    }
  };
  return (
    <label className="row" style={{ gap: 6, cursor: "pointer" }}>
      <Checkbox checked={paid} onChange={toggle} label={`${bill.name} paga`} />
      <span className={cx(paid ? "green" : "muted")}>{paid ? "Paga" : "Em aberto"}</span>
    </label>
  );
}

function BillModal({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const state = useApp();
  const [name, setName] = useState(bill?.name || "");
  const [amount, setAmount] = useState(bill ? moneyPlain(bill.amount) : "");
  const [day, setDay] = useState(bill?.day || 10);
  const [categoryId, setCategoryId] = useState(bill?.categoryId || "");
  const [active, setActive] = useState(bill?.active ?? true);
  const cents = parseMoney(amount);
  const valid = !!name.trim() && !!cents;
  const save = () => {
    if (!valid) return;
    const data = { name: name.trim(), amount: cents!, day, categoryId: categoryId || null, active };
    if (bill) patch("bills", bill.id, data);
    else insert("bills", { id: uid(), ...data });
    ui.toast(bill ? "Conta fixa atualizada" : "Conta fixa criada");
    onClose();
  };
  const del = async () => {
    if (!bill) return;
    const ok = await ui.confirm({ title: "Excluir conta fixa?", message: "Pagamentos já lançados continuam em Lançamentos.", confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    remove("bills", bill.id);
    onClose();
  };
  return (
    <Modal
      title={bill ? "Editar conta fixa" : "Nova conta fixa"}
      onClose={onClose}
      footer={
        <>
          {bill && (
            <button className="btn danger" style={{ marginRight: "auto" }} onClick={del}>
              Excluir
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!valid} onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <label className="field">
        Nome
        <input id="bill-name" className="input" autoFocus value={name} placeholder="Ex.: Internet" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid-2">
        <label className="field">
          Valor
          <MoneyInput id="bill-amount" value={amount} onChange={setAmount} />
        </label>
        <label className="field">
          Dia do vencimento
          <input id="bill-day" className="input" type="number" min={1} max={31} value={day} onChange={(e) => setDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))} />
        </label>
        <label className="field">
          Categoria
          <select id="bill-category" className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem categoria</option>
            {state.categories
              .filter((c) => c.kind === "saida")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className="row" style={{ gap: 8, alignSelf: "end", minHeight: 32, cursor: "pointer" }}>
          <Checkbox checked={active} onChange={setActive} label="Ativa" /> Ativa
        </label>
      </div>
    </Modal>
  );
}
