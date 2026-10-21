import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icone from "../components/Icone.jsx";
import { usePreferencia } from "../hooks/usePreferencia.js";
import {
  fmtDataCurta,
  fmtDataHoraCurta,
  fmtDias,
  fmtInteiro,
  fmtMoeda,
} from "../lib/format.js";

const TAMANHOS_PAGINA = [25, 50, 100];
const INTERVALO_AUTO_MS = 60000;

const STATUS = [
  { id: "", label: "Todos" },
  { id: "em_programacao", label: "Em programação" },
  { id: "parcial", label: "Parcial" },
  { id: "faturado", label: "Faturado" },
  { id: "entregue", label: "Entregue" },
];

const STATUS_TEXTO = {
  entregue: { texto: "Entregue", classe: "tom-ok peso-500" },
  faturado: { texto: "Faturado", classe: "peso-500" },
  parcial: { texto: "Parcial", classe: "tom-atencao peso-500" },
  em_programacao: { texto: "Em programação", classe: "txt-sec peso-500" },
};

// Colunas do pedido. `sort` é a chave aceita pelo backend (null = fixa).
const COLUNAS = [
  { key: "status", sort: "status", label: "Status" },
  { key: "cliente", sort: "cliente", label: "Cliente" },
  { key: "pedido", sort: "pedido", label: "Pedido" },
  { key: "pedido_jund", sort: null, label: "Pedido JUND" },
  { key: "contrato", sort: null, label: "Contrato" },
  { key: "data_pedido", sort: "data_pedido", label: "Data do pedido" },
  { key: "prazo", sort: "prazo", label: "Prazo de entrega" },
  { key: "faturamento", sort: "faturamento", label: "Faturamento" },
  { key: "prazo_contratado", sort: "prazo_contratado", label: "Prazo contratado", num: true },
  { key: "folga", sort: "folga", label: "Folga p/ entregar", num: true },
  { key: "itens", sort: "itens", label: "Itens", num: true },
  { key: "valor", sort: "valor", label: "Total (BRL)", num: true },
];

// Dias entre a data do pedido no JUND e o Contract Date. Negativo = o pedido foi
// lançado no JUND depois do Contract Date (lançamento tardio).
function PrazoContratado({ p }) {
  if (p.prazo_contratado_dias == null) return <span className="txt-sec">—</span>;
  if (p.prazo_contratado_dias < 0) {
    return (
      <span
        className="tom-atencao"
        title="Pedido lançado no JUND depois do Contract Date"
      >
        {p.prazo_contratado_dias}d
      </span>
    );
  }
  return <span>{p.prazo_contratado_dias}d</span>;
}

// Quanto tempo resta para entregar. Faturado: conta da emissão da NF. Ainda não
// faturado: conta de hoje, em cinza, para não se confundir com a folga real.
function Folga({ p, diasAlerta }) {
  const d = p.folga_dias;
  if (d == null) return <span className="txt-sec">—</span>;
  if (p.folga_tipo === "ate_hoje") {
    const titulo = "Ainda não faturado: dias de hoje até o Contract Date";
    return d >= 0 ? (
      <span className="txt-sec" title={titulo}>
        {d}d até o prazo
      </span>
    ) : (
      <span className="tom-erro" title={titulo}>
        vencido há {Math.abs(d)}d
      </span>
    );
  }
  const tom = d < 0 ? "tom-erro" : d <= diasAlerta ? "tom-atencao" : "";
  return (
    <span
      className={`${tom} peso-500`}
      title="Dias da emissão da nota fiscal até o Contract Date"
    >
      {d}d
    </span>
  );
}

function Kpi({ rotulo, valor, tom = "", detalhe }) {
  return (
    <div className="kpi">
      <dt>{rotulo}</dt>
      <dd className={tom}>{valor}</dd>
      {detalhe && <small>{detalhe}</small>}
    </div>
  );
}

// Indicadores de prazo sobre todos os pedidos do filtro atual (não só a página).
// Pedidos sem Contract Date ficam de fora das médias; aqui só são contados.
function Kpis({ kpis }) {
  if (!kpis) return null;
  const { prazo_contratado: prazo, folga_apos_faturamento: folga } = kpis;
  const medio = (serie) => (serie.media == null ? "—" : fmtDias(serie.media));
  const detalhe = (serie, unidade) =>
    serie.n === 0
      ? "sem pedidos com dados"
      : `mediana ${fmtDias(serie.mediana)} · ${fmtInteiro(serie.n)} ${unidade}`;

  return (
    <section className="kpis-comercial" aria-label="Indicadores de prazo">
      <dl className="kpis">
        <Kpi
          rotulo="Prazo contratado (média)"
          valor={medio(prazo)}
          detalhe={`Pedido no JUND → Contract Date · ${detalhe(prazo, "pedidos")}`}
        />
        <Kpi
          rotulo="Folga após faturar (média)"
          valor={medio(folga)}
          detalhe={`NF → Contract Date · ${detalhe(folga, "faturados")}`}
        />
        <Kpi
          rotulo="Faturados depois do prazo"
          valor={fmtInteiro(kpis.faturados_fora_do_prazo)}
          tom={kpis.faturados_fora_do_prazo > 0 ? "tom-erro" : ""}
          detalhe="folga negativa"
        />
        <Kpi
          rotulo={`Folga de até ${kpis.dias_alerta} dias`}
          valor={fmtInteiro(kpis.folga_curta)}
          tom={kpis.folga_curta > 0 ? "tom-atencao" : ""}
          detalhe="faturados com pouco tempo para entregar"
        />
        <Kpi
          rotulo="Sem Contract Date"
          valor={fmtInteiro(kpis.sem_contract_date)}
          detalhe={`de ${fmtInteiro(kpis.total_pedidos)} · fora destes indicadores`}
        />
      </dl>
      {kpis.contract_date_inconsistente > 0 && (
        <p className="kpis-nota">
          {fmtInteiro(kpis.contract_date_inconsistente)}{" "}
          {kpis.contract_date_inconsistente === 1
            ? "pedido foi lançado no JUND depois do Contract Date e ficou"
            : "pedidos foram lançados no JUND depois do Contract Date e ficaram"}{" "}
          fora da média do prazo contratado (prazo negativo distorceria a média).
        </p>
      )}
    </section>
  );
}

function StatusTexto({ status }) {
  const s = STATUS_TEXTO[status] || { texto: status, classe: "" };
  return <span className={s.classe}>{s.texto}</span>;
}

function Itens({ pedido }) {
  return (
    <div className="comercial-detalhe">
      <div className="comercial-detalhe-topo">
        <h3 className="comercial-detalhe-titulo">
          Itens do pedido {pedido.numero}
          {pedido.numero_interno ? ` · JUND ${pedido.numero_interno}` : ""}
        </h3>
        <span className="comercial-detalhe-resumo">
          {pedido.qtd_itens} {pedido.qtd_itens === 1 ? "item" : "itens"} ·{" "}
          {fmtInteiro(pedido.qtd_pedida_total)} un. · {fmtMoeda(pedido.valor_total)}
        </span>
      </div>
      {pedido.etapa_atual_nome && (
        <dl className="comercial-meta">
          <div>
            <dt>Etapa no processo</dt>
            <dd>{pedido.etapa_atual_nome}</dd>
          </div>
        </dl>
      )}
      <div className="tabela-wrap">
        <table className="tabela compacta tabela-itens-comercial">
          <thead>
            <tr>
              <th>Item</th>
              <th>Cód. cliente</th>
              <th>Descrição</th>
              <th className="num">Qtde</th>
              <th className="num">Preço unit.</th>
              <th className="num">Total (BRL)</th>
              <th>Nº de série</th>
              <th>Nota fiscal</th>
              <th>Emissão</th>
              <th>Entrega/cliente</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pedido.itens.map((item) => (
              <tr key={item.item_numero}>
                <td>{item.item_cliente ?? item.item_numero}</td>
                <td className="nowrap">{item.cod_cliente || "—"}</td>
                <td className="col-descricao" title={item.descricao}>
                  {item.descricao}
                </td>
                <td className="num">{fmtInteiro(item.qtd_pedida)}</td>
                <td className="num">{fmtMoeda(item.valor_unitario)}</td>
                <td className="num">{fmtMoeda(item.valor_total)}</td>
                <td className="nowrap">{item.serial || "—"}</td>
                <td className="nowrap">{item.nf_numero || "—"}</td>
                <td className="nowrap">{fmtDataHoraCurta(item.nf_emissao)}</td>
                <td className="nowrap">{fmtDataCurta(item.entrega_cliente)}</td>
                <td className="nowrap">
                  <StatusTexto status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Visão do Comercial: um pedido por linha, com os itens do pedido ao expandir.
// Tudo vem do JUND/jigadb, somente leitura.
export default function Comercial() {
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [ordenacao, setOrdenacao] = useState({ sort: "prazo", order: "asc" });
  const [page, setPage] = useState(1);
  const [pageSizeSalvo, setPageSize] = usePreferencia("otif.comercial.pageSize", 25);
  const pageSize = TAMANHOS_PAGINA.includes(pageSizeSalvo) ? pageSizeSalvo : 25;

  const [dados, setDados] = useState({ items: [], total: 0, total_pages: 1, kpis: null });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [expandidos, setExpandidos] = useState(() => new Set());
  const geracaoRef = useRef(0);

  // A busca só consulta a API depois de uma pausa na digitação.
  useEffect(() => {
    const espera = window.setTimeout(() => {
      const nova = buscaDigitada.trim();
      setBusca((atual) => {
        if (atual === nova) return atual;
        setPage(1);
        return nova;
      });
    }, 400);
    return () => window.clearTimeout(espera);
  }, [buscaDigitada]);

  const carregar = useCallback(
    async ({ force = false } = {}) => {
      const geracao = ++geracaoRef.current;
      setCarregando(true);
      setErro(null);
      try {
        const resp = await api.comercialPedidos({
          busca,
          status,
          sort: ordenacao.sort,
          order: ordenacao.order,
          page,
          page_size: pageSize,
          force_refresh: force || undefined,
        });
        if (geracao !== geracaoRef.current) return;
        const paginas = Math.max(1, resp.total_pages || 1);
        if (page > paginas) {
          setPage(paginas);
          return;
        }
        setDados(resp);
        setAtualizadoEm(new Date());
      } catch (e) {
        if (geracao === geracaoRef.current) setErro(e.message);
      } finally {
        if (geracao === geracaoRef.current) setCarregando(false);
      }
    },
    [busca, status, ordenacao, page, pageSize]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Recarrega a cada 60 s, menos com a aba oculta.
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") carregar();
    }, INTERVALO_AUTO_MS);
    return () => window.clearInterval(intervalo);
  }, [carregar]);

  function ordenarPor(sort) {
    setOrdenacao((o) =>
      o.sort === sort
        ? { sort, order: o.order === "asc" ? "desc" : "asc" }
        : { sort, order: "asc" }
    );
    setPage(1);
  }

  function alternarExpansao(id) {
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  const itens = dados.items;
  const diasAlerta = dados.kpis?.dias_alerta ?? 7;
  const vazio = !carregando && itens.length === 0;
  const totalColunas = COLUNAS.length + 1;
  const inicio = dados.total === 0 ? 0 : (page - 1) * pageSize;
  const hora = atualizadoEm
    ? atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <>
      <section className="controles" aria-label="Filtros do Comercial">
        <div className="segmentos" role="group" aria-label="Filtrar pedidos por status">
          <div className="seg-grupo">
            {STATUS.map((s) => (
              <button
                type="button"
                key={s.id || "todos"}
                className={`seg ${status === s.id ? "ativo" : ""}`}
                aria-pressed={status === s.id}
                onClick={() => {
                  setStatus(s.id);
                  setPage(1);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filtros-form">
          <label className="campo campo-cliente">
            <span className="campo-rotulo">Buscar</span>
            <input
              type="search"
              value={buscaDigitada}
              placeholder="Pedido, pedido JUND, contrato, cliente, cód. cliente ou NF"
              autoComplete="off"
              onChange={(event) => setBuscaDigitada(event.target.value)}
            />
          </label>
        </div>
      </section>

      {erro && (
        <div className="faixa-erro" role="alert">
          <span>
            {hora ? `Mostrando os dados das ${hora}. ` : ""}A API não respondeu: {erro}
          </span>
          <button type="button" className="btn btn-texto" onClick={() => carregar({ force: true })}>
            Tentar de novo
          </button>
        </div>
      )}

      <Kpis kpis={dados.kpis} />

      <section className="tabela-secao" aria-busy={carregando} aria-labelledby="comercial-titulo">
        <div className="tabela-toolbar">
          <h2 id="comercial-titulo" className="tabela-contagem" aria-live="polite">
            {carregando && itens.length === 0
              ? "Carregando pedidos…"
              : `${fmtInteiro(dados.total)} ${dados.total === 1 ? "pedido" : "pedidos"}`}
          </h2>
          <div className="toolbar-direita">
            {hora && (
              <span className="topo-hora" title="A tela recarrega sozinha a cada 60 segundos">
                {carregando ? "Atualizando…" : `Atualizado às ${hora}`}
              </span>
            )}
            <button
              type="button"
              className="btn btn-sec"
              onClick={() => carregar({ force: true })}
              disabled={carregando}
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="tabela-wrap">
          <table className="tabela compacta tabela-comercial">
            <thead>
              <tr>
                <th className="col-expandir">
                  <span className="sr-only">Itens do pedido</span>
                </th>
                {COLUNAS.map((c) => {
                  const ativo = c.sort && c.sort === ordenacao.sort;
                  return (
                    <th
                      key={c.key}
                      className={c.num ? "num" : ""}
                      aria-sort={
                        ativo ? (ordenacao.order === "asc" ? "ascending" : "descending") : undefined
                      }
                    >
                      {c.sort ? (
                        <button
                          type="button"
                          className="th-ordenar"
                          onClick={() => ordenarPor(c.sort)}
                          aria-label={`Ordenar por ${c.label}`}
                        >
                          {c.label}
                          {ativo && (
                            <Icone nome={ordenacao.order === "asc" ? "cima" : "baixo"} tamanho={12} />
                          )}
                        </button>
                      ) : (
                        <span className="th-estatico">{c.label}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {carregando &&
                itens.length === 0 &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} aria-hidden="true">
                    {Array.from({ length: totalColunas }).map((__, j) => (
                      <td key={j}>
                        <span className="esqueleto" />
                      </td>
                    ))}
                  </tr>
                ))}

              {vazio && (
                <tr>
                  <td className="tabela-vazio" colSpan={totalColunas}>
                    <p>Nenhum pedido com estes filtros.</p>
                  </td>
                </tr>
              )}

              {itens.map((p) => {
                const aberto = expandidos.has(p.pedido_id);
                return (
                  <Fragment key={p.pedido_id}>
                    <tr className={aberto ? "pedido-aberto" : ""}>
                      <td className="col-expandir">
                        <button
                          type="button"
                          className="btn-icone"
                          aria-expanded={aberto}
                          aria-label={`${aberto ? "Ocultar" : "Mostrar"} os ${p.qtd_itens} itens do pedido ${p.numero}`}
                          onClick={() => alternarExpansao(p.pedido_id)}
                        >
                          <Icone nome={aberto ? "abaixo" : "direita"} tamanho={14} />
                        </button>
                      </td>
                      <td className="nowrap">
                        <StatusTexto status={p.status} />
                      </td>
                      <td className="col-cliente" title={p.cliente}>
                        {p.cliente}
                      </td>
                      <td className="nowrap col-pedido-num">{p.numero}</td>
                      <td
                        className="nowrap"
                        title={p.erp_id != null ? `ID interno no JUND: ${p.erp_id}` : undefined}
                      >
                        {p.numero_interno || "—"}
                      </td>
                      <td className="nowrap">{p.contrato || "—"}</td>
                      <td className="nowrap">{fmtDataCurta(p.data_pedido)}</td>
                      <td className="nowrap">
                        {p.contract_date ? (
                          fmtDataCurta(p.contract_date)
                        ) : (
                          <span className="tom-atencao">não informado</span>
                        )}
                      </td>
                      <td className="nowrap">{fmtDataCurta(p.faturamento_em)}</td>
                      <td className="num">
                        <PrazoContratado p={p} />
                      </td>
                      <td className="num">
                        <Folga p={p} diasAlerta={diasAlerta} />
                      </td>
                      <td className="num">{p.qtd_itens}</td>
                      <td className="num">{fmtMoeda(p.valor_total)}</td>
                    </tr>
                    {aberto && (
                      <tr className="linha-itens">
                        <td colSpan={totalColunas}>
                          <Itens pedido={p} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {dados.total > 0 && (
          <div className="pager">
            <label className="campo-inline">
              <span className="campo-rotulo">Linhas por página</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {TAMANHOS_PAGINA.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span className="pager-info">
              {fmtInteiro(inicio + 1)}–{fmtInteiro(Math.min(inicio + pageSize, dados.total))} de{" "}
              {fmtInteiro(dados.total)}
            </span>
            <div className="pager-btns">
              <button
                type="button"
                className="btn btn-sec"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <Icone nome="esquerda" tamanho={14} />
                Anterior
              </button>
              <button
                type="button"
                className="btn btn-sec"
                onClick={() => setPage((p) => Math.min(dados.total_pages, p + 1))}
                disabled={page >= dados.total_pages}
              >
                Próxima
                <Icone nome="direita" tamanho={14} />
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
