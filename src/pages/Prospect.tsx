import { ExternalLink, MapPin, Phone, Radar, Search, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Empty } from "../components/common";
import {
  SITE_LABEL,
  STATUSES,
  deleteLead,
  loadProspect,
  runSearch,
  statusInfo,
  updateLead,
  useProspect,
  type Lead,
  type LeadStatus,
  type SearchSummary,
  type SiteKind,
} from "../lib/prospect";
import { ui } from "../lib/ui";
import { cx } from "../lib/util";

const DAILY_LIMIT = 50;
type Sort = "pontos" | "avaliacoes" | "nota" | "recentes";

/** Antes da qualificação por IA: celular e avaliações pesam mais. */
function prescore(l: Lead) {
  return (l.phone_kind === "celular" ? 1000 : 0) + Math.min(l.reviews, 500) + (l.rating || 0) * 10;
}

function isToday(iso: string | null) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function ProspectPage() {
  const st = useProspect();
  const [command, setCommand] = useState("");
  const [last, setLast] = useState<SearchSummary | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState<"" | SiteKind>("");
  const [statusFilter, setStatusFilter] = useState<"" | LeadStatus | "ativos">("ativos");
  const [onlyMobile, setOnlyMobile] = useState(false);
  const [text, setText] = useState("");
  const [sort, setSort] = useState<Sort>("pontos");

  useEffect(() => {
    if (!st.loaded) loadProspect();
  }, [st.loaded]);

  const queries = useMemo(() => [...new Set(st.leads.map((l) => l.search).filter(Boolean))], [st.leads]);
  const recent = useMemo(() => [...new Set(st.searches.map((s) => s.query))].slice(0, 6), [st.searches]);

  const leads = useMemo(() => {
    const q = text.trim().toLowerCase();
    return st.leads
      .filter((l) => !searchFilter || l.search === searchFilter)
      .filter((l) => !siteFilter || l.site_kind === siteFilter)
      .filter((l) => !onlyMobile || l.phone_kind === "celular")
      .filter((l) => (statusFilter === "ativos" ? !["fechado", "perdido"].includes(l.status) : !statusFilter || l.status === statusFilter))
      .filter((l) => !q || l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q) || l.category.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === "avaliacoes") return b.reviews - a.reviews;
        if (sort === "nota") return (b.rating || 0) - (a.rating || 0);
        if (sort === "recentes") return b.created_at.localeCompare(a.created_at);
        return prescore(b) - prescore(a);
      });
  }, [st.leads, searchFilter, siteFilter, onlyMobile, statusFilter, text, sort]);

  const mobile = st.leads.filter((l) => l.phone_kind === "celular").length;
  const socialOnly = st.leads.filter((l) => l.site_kind !== "nenhum").length;
  const contactedToday = st.leads.filter((l) => isToday(l.contacted_at)).length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (st.searching) return;
    try {
      const summary = await runSearch(command);
      setLast(summary);
      setSearchFilter(summary.query);
      ui.toast(
        summary.inserted === 0
          ? "Nenhuma empresa nova nessa busca"
          : summary.inserted === 1
            ? "1 empresa nova na lista"
            : `${summary.inserted} empresas novas na lista`,
      );
    } catch (err) {
      ui.toast(err instanceof Error ? err.message : String(err));
    }
  };

  const changeStatus = (l: Lead, status: LeadStatus) =>
    updateLead(l.id, { status }).catch((err) => ui.toast(err instanceof Error ? err.message : String(err)));

  const remove = async (l: Lead) => {
    const ok = await ui.confirm({
      title: `Tirar "${l.name}" da lista?`,
      message: "Ela pode voltar numa próxima busca. Para nunca mais aparecer, mude a etapa para Perdido.",
      confirmLabel: "Tirar da lista",
      danger: true,
    });
    if (ok) deleteLead(l.id).catch((err) => ui.toast(err instanceof Error ? err.message : String(err)));
  };

  return (
    <div className="page wide prospect" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Prospecção</h1>
          <div className="page-sub">Empresas sem site, encontradas no Google e prontas para abordar.</div>
        </div>
      </div>

      {st.configured === false && (
        <div className="card prospect-setup">
          <div className="card-title">Falta a chave do Google</div>
          <ol>
            <li>No Google Cloud, crie um projeto, ligue o faturamento e ative a <b>Places API (New)</b>.</li>
            <li>Em Credenciais, crie uma chave de API e restrinja à Places API (New).</li>
            <li>
              No Supabase, abra <b>Edge Functions → Secrets</b> e salve como <code>GOOGLE_PLACES_API_KEY</code>.
            </li>
          </ol>
        </div>
      )}
      {st.error && <div className="card prospect-error">{st.error}</div>}

      <form className="prospect-command" onSubmit={submit}>
        <Radar size={18} className="muted" />
        <input
          className="input bare"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="pesquisar: painel solar em Chapecó"
          aria-label="Comando de busca"
          disabled={st.searching}
        />
        <button className="btn primary" type="submit" disabled={st.searching || !command.trim()}>
          <Search size={15} /> {st.searching ? "Buscando..." : "Buscar"}
        </button>
      </form>
      {recent.length > 0 && (
        <div className="row wrap prospect-recent">
          <span className="muted">Últimas buscas:</span>
          {recent.map((q) => (
            <button key={q} className="chip-toggle" onClick={() => setCommand(`pesquisar: ${q}`)}>
              {q}
            </button>
          ))}
        </div>
      )}
      {last && (
        <div className="prospect-last muted">
          "{last.query}": {last.found} empresas no Google, {last.withoutSite} sem site
          {last.closed > 0 && `, ${last.closed} fechadas ignoradas`}, {last.inserted} novas na lista.
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="k">Empresas na lista</div>
          <div className="v">{st.leads.length}</div>
        </div>
        <div className="kpi">
          <div className="k">Com celular</div>
          <div className="v">{mobile}</div>
        </div>
        <div className="kpi">
          <div className="k">Só rede social ou link</div>
          <div className="v">{socialOnly}</div>
        </div>
        <div className="kpi">
          <div className="k">Mensagens hoje</div>
          <div className="v">
            {contactedToday}/{DAILY_LIMIT}
          </div>
        </div>
      </div>

      <div className="filters">
        <input className="input" style={{ width: 200, minHeight: 28 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Filtrar por nome ou cidade" aria-label="Filtrar" />
        <select className="select" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} aria-label="Busca">
          <option value="">Todas as buscas</option>
          {queries.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
        <select className="select" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value as SiteKind | "")} aria-label="Presença online">
          <option value="">Qualquer presença</option>
          {(Object.keys(SITE_LABEL) as SiteKind[]).map((k) => (
            <option key={k} value={k}>
              {SITE_LABEL[k]}
            </option>
          ))}
        </select>
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Etapa">
          <option value="ativos">Em aberto</option>
          <option value="">Todas as etapas</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordem">
          <option value="pontos">Melhores primeiro</option>
          <option value="avaliacoes">Mais avaliações</option>
          <option value="nota">Maior nota</option>
          <option value="recentes">Mais recentes</option>
        </select>
        <button className={cx("chip-toggle", onlyMobile && "on")} onClick={() => setOnlyMobile(!onlyMobile)}>
          <Phone size={13} /> Só celular
        </button>
        <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
          {leads.length} {leads.length === 1 ? "empresa" : "empresas"}
        </span>
      </div>

      {st.loading && !st.leads.length ? (
        <Empty>Carregando...</Empty>
      ) : !leads.length ? (
        <Empty>{st.leads.length ? "Nenhuma empresa com esses filtros." : 'Faça a primeira busca. Ex.: "pesquisar: painel solar em Chapecó".'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table prospect-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Avaliações</th>
                <th>Telefone</th>
                <th>Presença</th>
                <th>Endereço</th>
                <th>Etapa</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div className="lead-name">{l.name}</div>
                    {l.category && <div className="muted lead-sub">{l.category}</div>}
                  </td>
                  <td className="num">
                    {l.rating ? (
                      <span className="row" style={{ gap: 4 }}>
                        <Star size={13} className="lead-star" /> {l.rating.toFixed(1)}
                        <span className="muted">({l.reviews})</span>
                      </span>
                    ) : (
                      <span className="muted">Sem nota</span>
                    )}
                  </td>
                  <td className="num">
                    {l.phone ? (
                      <span className="row" style={{ gap: 6 }}>
                        {l.phone}
                        {l.phone_kind === "celular" && <span className="pill green">celular</span>}
                      </span>
                    ) : (
                      <span className="muted">Sem telefone</span>
                    )}
                  </td>
                  <td>
                    {l.site_url ? (
                      <a className={cx("pill", l.site_kind === "nenhum" ? "red" : "orange")} href={l.site_url} target="_blank" rel="noreferrer">
                        {SITE_LABEL[l.site_kind]} <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="pill red">{SITE_LABEL[l.site_kind]}</span>
                    )}
                  </td>
                  <td className="muted lead-address" title={l.address}>
                    {l.address}
                  </td>
                  <td>
                    <select
                      className={cx("select bare lead-status", statusInfo(l.status).color)}
                      value={l.status}
                      onChange={(e) => changeStatus(l, e.target.value as LeadStatus)}
                      aria-label={`Etapa de ${l.name}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="row" style={{ gap: 2 }}>
                      {l.maps_url && (
                        <a className="icon-btn" href={l.maps_url} target="_blank" rel="noreferrer" title="Abrir no Google Maps" aria-label={`Abrir ${l.name} no Google Maps`}>
                          <MapPin size={15} />
                        </a>
                      )}
                      <button className="icon-btn" onClick={() => remove(l)} title="Tirar da lista" aria-label={`Tirar ${l.name} da lista`}>
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
