import { useState } from "react";
import Icone from "./Icone.jsx";
import SeletorColunas from "./SeletorColunas.jsx";
import { motivoLabel } from "../api.js";
import {
  acaoDoPedido,
  contractDateDe,
  detalheEtapa,
  nomeEtapa,
  podeNegarProducao,
  registroPendente,
  situacaoPedido,
} from "../lib/etapas.js";
import {
  fmtDataCurta,
  fmtDataHoraCurta,
  fmtInteiro,
  formatarNotaFiscal,
} from "../lib/format.js";
import { usePreferencia } from "../hooks/usePreferencia.js";

// Colunas na ordem em que aparecem. `sort` é a chave aceita pelo backend
// (null = não ordenável). `fixa` identifica o pedido e diz onde ele está.
export const COLUNAS = [
  { key: "situacao", sort: "status", label: "Situação", fixa: true },
  { key: "prazo", sort: "prazo", label: "Contract Date", padrao: true },
  { key: "pedido", sort: "pedido", label: "Pedido", fixa: true },
  { key: "cliente", sort: "cliente", label: "Cliente", fixa: true },
  { key: "etapa", sort: "etapa", label: "Etapa", fixa: true },
  { key: "qtd", sort: "qtd", label: "Faturado / pedido", num: true, padrao: true },
  { key: "itens", sort: "itens", label: "Itens", num: true },
  { key: "solicitada", sort: "solicitada", label: "Digitação" },
  { key: "faturamento", sort: "faturamento", label: "Faturamento" },
  { key: "nota_fiscal", sort: "nota_fiscal", label: "Nota fiscal" },
  { key: "embarque", sort: "embarque", label: "Embarque" },
  { key: "entrega", sort: "entrega", label: "Entrega" },
  { key: "atraso", sort: "atraso", label: "Atraso", num: true },
  { key: "motivo", sort: "motivo", label: "Motivo da falha" },
  { key: "interno", sort: null, label: "Nº interno / ID ERP" },
];

const COLUNAS_PADRAO = COLUNAS.filter((c) => c.padrao).map((c) => c.key);

function Situacao({ it }) {
  const s = situacaoPedido(it);
  return <span className={`tom-${s.tom} peso-500`}>{s.texto}</span>;
}

// Trilha do fluxo: uma célula por etapa, sempre na mesma posição, para que a
// coluna inteira funcione como um mapa de onde os pedidos estão. A informação
// textual está ao lado; a trilha é um reforço visual.
function Trilha({ processo }) {
  const etapas = (processo?.etapas || []).filter((e) => e.chave !== "pedido");
  if (etapas.length === 0) return null;
  const bloqueado =
    processo.etapa_atual === "pcp" &&
    processo.negativas_producao?.some((n) => !n.resolvida_em);
  return (
    <span className="trilha" aria-hidden="true">
      {etapas.map((etapa) => {
        const atual = etapa.chave === processo.etapa_atual;
        const classe = atual
          ? bloqueado
            ? "atual bloqueada"
            : "atual"
          : etapa.concluida
            ? "feita"
            : "";
        return <i key={etapa.chave} className={classe} />;
      })}
    </span>
  );
}

function Etapa({ it }) {
  const processo = it.processo;
  if (!processo) return <span className="txt-sec">—</span>;
  const detalhe = registroPendente(it)
    ? { texto: "Já faturado · falta registrar", tom: "atencao" }
    : detalheEtapa(processo);
  return (
    <span className="etapa-celula">
      <Trilha processo={processo} />
      <span className="etapa-texto">
        <span className={processo.concluido ? "tom-ok" : ""}>{nomeEtapa(processo.etapa_atual)}</span>
        {detalhe && (
          <span className={`etapa-detalhe tom-${detalhe.tom}`}>{detalhe.texto}</span>
        )}
      </span>
    </span>
  );
}

function Quantidade({ it }) {
  const pedida = Number(it.qtd_pedida_total) || 0;
  const faturada = Number(it.qtd_faturada_total) || 0;
  const parcial = faturada > 0 && faturada < pedida;
  return (
    <span className={faturada === 0 ? "txt-sec" : ""}>
      {fmtInteiro(faturada)} / {fmtInteiro(pedida)}
      {parcial && <span className="tom-atencao peso-500"> parcial</span>}
    </span>
  );
}

const CELULA = {
  situacao: (it) => <Situacao it={it} />,
  prazo: (it) => {
    const cd = contractDateDe(it);
    return cd ? fmtDataCurta(cd) : <span className="tom-atencao">não informado</span>;
  },
  pedido: (it, ctx) => (
    <button
      type="button"
      className="link-pedido"
      aria-label={`Ver detalhes do pedido ${it.numero}, cliente ${it.cliente}`}
      aria-haspopup="dialog"
      aria-expanded={ctx.selecionado}
      aria-controls="pedido-drawer"
      onClick={(event) => {
        event.stopPropagation();
        ctx.onDetalhe?.(it);
      }}
    >
      {it.numero}
    </button>
  ),
  cliente: (it) => <span title={it.cliente}>{it.cliente}</span>,
  etapa: (it) => <Etapa it={it} />,
  qtd: (it) => <Quantidade it={it} />,
  itens: (it) => it.qtd_itens,
  solicitada: (it) => fmtDataCurta(it.data_solicitada),
  faturamento: (it) => fmtDataHoraCurta(it.faturamento_em || it.processo?.faturamento_em),
  nota_fiscal: (it) => formatarNotaFiscal(it.nota_fiscal_numero, it.nota_fiscal_serie),
  embarque: (it) => fmtDataHoraCurta(it.embarque_em || it.processo?.embarque_em),
  entrega: (it) => fmtDataCurta(it.data_entrega_real),
  atraso: (it) =>
    it.dias_atraso == null ? (
      "—"
    ) : it.dias_atraso > 0 ? (
      <span className="tom-erro">+{it.dias_atraso}d</span>
    ) : (
      "0d"
    ),
  motivo: (it) => (it.motivo_falha ? motivoLabel(it.motivo_falha) : "—"),
  interno: (it) =>
    [it.numero_interno, it.erp_id != null ? `ERP ${it.erp_id}` : null]
      .filter(Boolean)
      .join(" · ") || "—",
};

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

// O CSV exporta o conjunto completo de campos, independente das colunas
// visíveis: a grade é para triagem, o arquivo é para rastreabilidade.
function exportarCsv(linhas) {
  const cabecalho = [
    "Status",
    "Situação",
    "ID ERP",
    "Pedido (cliente)",
    "Nº interno",
    "Cliente",
    "Itens",
    "Etapa atual",
    "Dias na etapa atual",
    "Comercial concluído em",
    "Inspeção agendada",
    "LEM concluído em",
    "Faturamento ERP (data/hora)",
    "Nota fiscal",
    "Série da nota",
    "Embarque ERP (data/hora)",
    "Gargalo",
    "Data de digitação",
    "Contract Date",
    "Dias restantes",
    "Faturamento (data)",
    "Entrega",
    "Qtd pedida",
    "Qtd faturada",
    "Dias atraso",
    "Origem atraso",
    "Motivo",
  ];
  const corpo = linhas.map((it) =>
    [
      it.status,
      situacaoPedido(it).texto,
      it.erp_id,
      it.numero,
      it.numero_interno,
      it.cliente,
      it.qtd_itens,
      it.processo?.etapa_atual_nome || "",
      it.processo?.dias_na_etapa_atual ?? "",
      it.processo?.comercial_data || "",
      it.processo?.inspecao_agendada_data || "",
      it.processo?.lem_data || "",
      it.faturamento_em || it.processo?.faturamento_em || "",
      it.nota_fiscal_numero || "",
      it.nota_fiscal_serie || "",
      it.embarque_em || it.processo?.embarque_em || "",
      it.processo?.gargalo || "",
      it.data_solicitada,
      contractDateDe(it),
      it.dias_restantes,
      it.data_faturamento,
      it.data_entrega_real,
      it.qtd_pedida_total,
      it.qtd_faturada_total,
      it.dias_atraso,
      it.origem_atraso,
      it.motivo_falha ? motivoLabel(it.motivo_falha) : "",
    ]
      .map(csvEscape)
      .join(";")
  );
  const conteudo = "\uFEFF" + [cabecalho.map(csvEscape).join(";"), ...corpo].join("\r\n");
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `otif-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Acao({ it, onConfirmar, onConfirmarEtapa, onNegarProducao }) {
  const acao = acaoDoPedido(it);
  if (!acao.tipo) {
    return acao.espera ? <span className="txt-sec">{acao.espera}</span> : null;
  }
  const handler = acao.tipo === "entrega" ? onConfirmar : onConfirmarEtapa;
  return (
    <span className="acoes-linha">
      <button type="button" className="btn btn-sec btn-p" onClick={() => handler?.(it)}>
        {acao.label}
      </button>
      {podeNegarProducao(it) && onNegarProducao && (
        <button
          type="button"
          className="btn btn-texto btn-p tom-erro"
          onClick={() => onNegarProducao(it)}
          aria-label={`Negar produção do pedido ${it.numero}`}
        >
          Negar
        </button>
      )}
    </span>
  );
}

export default function ItensTable({
  itens,
  carregando = false,
  ordenacao = { sort: "prazo", order: "asc" },
  onOrdenar,
  onDefinirOrdenacao,
  page = 1,
  pageSize = 25,
  totalItens = 0,
  totalPaginas = 1,
  onPage,
  onPageSize,
  onExportCsv,
  onConfirmar,
  onConfirmarEtapa,
  onNegarProducao,
  pedidoSelecionadoId,
  onDetalhe,
  temFiltros = false,
  onLimparFiltros,
  selecaoAtiva = false,
  selecionados,
  onAlternarSelecao,
  onSelecionarPagina,
  lote = null,
}) {
  // Densidade compacta é o padrão: a tarefa é varrer muitas linhas.
  const [densidade, setDensidade] = usePreferencia("otif.tabela.densidade", "compacta");
  // Chave nova: o conjunto de colunas mudou e o padrão antigo não se aplica.
  const [colunasVisiveis, setColunasVisiveis] = usePreferencia(
    "otif.tabela.colunas.v2",
    COLUNAS_PADRAO
  );
  const [exportando, setExportando] = useState(false);
  const [erroExportacao, setErroExportacao] = useState("");

  const colunas = COLUNAS.filter(
    (coluna) => coluna.fixa || colunasVisiveis.includes(coluna.key)
  );
  const totalColunas = colunas.length + 1 + (selecaoAtiva ? 1 : 0);
  const vazio = !carregando && itens.length === 0;
  const inicio = totalItens === 0 ? 0 : (page - 1) * pageSize;
  const idsPagina = itens.map((it) => it.pedido_id);
  const todosMarcados =
    selecaoAtiva && idsPagina.length > 0 && idsPagina.every((id) => selecionados?.has(id));
  const algunsMarcados = selecaoAtiva && idsPagina.some((id) => selecionados?.has(id));

  async function exportar() {
    if (!onExportCsv) return;
    setExportando(true);
    setErroExportacao("");
    try {
      exportarCsv(await onExportCsv());
    } catch (erro) {
      setErroExportacao(erro.message || "Não foi possível exportar os pedidos.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <section className="tabela-secao" aria-busy={carregando} aria-labelledby="pedidos-tabela-titulo">
      <div className="tabela-toolbar">
        <h2 id="pedidos-tabela-titulo" className="tabela-contagem" aria-live="polite">
          {carregando && itens.length === 0
            ? "Carregando pedidos…"
            : `${fmtInteiro(totalItens)} ${totalItens === 1 ? "pedido" : "pedidos"}`}
        </h2>
        <div className="toolbar-direita">
          {/* Em telas estreitas o cabeçalho some; a ordenação vira um seletor. */}
          <label className="campo-inline ordenar-mobile">
            <span className="campo-rotulo">Ordenar</span>
            <select
              value={`${ordenacao.sort}:${ordenacao.order}`}
              onChange={(e) => {
                const [sort, order] = e.target.value.split(":");
                onDefinirOrdenacao?.({ sort, order });
              }}
            >
              {COLUNAS.filter((c) => c.sort).flatMap((c) => [
                <option key={`${c.sort}:asc`} value={`${c.sort}:asc`}>
                  {c.label} ↑
                </option>,
                <option key={`${c.sort}:desc`} value={`${c.sort}:desc`}>
                  {c.label} ↓
                </option>,
              ])}
            </select>
          </label>
          <div className="seg-grupo densidade" role="group" aria-label="Densidade da tabela">
            <button
              type="button"
              className={`seg ${densidade === "compacta" ? "ativo" : ""}`}
              aria-pressed={densidade === "compacta"}
              onClick={() => setDensidade("compacta")}
            >
              Compacta
            </button>
            <button
              type="button"
              className={`seg ${densidade === "confortavel" ? "ativo" : ""}`}
              aria-pressed={densidade === "confortavel"}
              onClick={() => setDensidade("confortavel")}
            >
              Confortável
            </button>
          </div>
          <SeletorColunas
            colunas={COLUNAS}
            visiveis={colunasVisiveis}
            onChange={setColunasVisiveis}
            onRestaurar={() => setColunasVisiveis(COLUNAS_PADRAO)}
          />
          <button
            type="button"
            className="btn btn-sec"
            onClick={exportar}
            disabled={totalItens === 0 || exportando}
          >
            {exportando ? "Exportando…" : "Exportar CSV"}
          </button>
        </div>
      </div>

      {erroExportacao && (
        <p className="msg-erro" role="alert">
          {erroExportacao}
        </p>
      )}

      {lote}

      <div className="tabela-wrap">
        <table className={`tabela tabela-pedidos ${densidade === "compacta" ? "compacta" : ""}`}>
          <thead>
            <tr>
              {selecaoAtiva && (
                <th className="col-check">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os pedidos desta página"
                    checked={todosMarcados}
                    ref={(el) => {
                      if (el) el.indeterminate = algunsMarcados && !todosMarcados;
                    }}
                    onChange={(event) => onSelecionarPagina?.(idsPagina, event.target.checked)}
                  />
                </th>
              )}
              {colunas.map((c) => {
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
                        onClick={() => onOrdenar?.(c.sort)}
                        aria-label={`Ordenar por ${c.label}${
                          ativo
                            ? ordenacao.order === "asc"
                              ? ", ordem crescente"
                              : ", ordem decrescente"
                            : ""
                        }`}
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
              <th className="col-acoes">
                <span className="th-estatico">Ação manual</span>
              </th>
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
                  {temFiltros && onLimparFiltros && (
                    <button type="button" className="btn btn-texto" onClick={onLimparFiltros}>
                      Limpar todos os filtros
                    </button>
                  )}
                </td>
              </tr>
            )}

            {itens.map((it) => {
              const selecionado = it.pedido_id === pedidoSelecionadoId;
              const marcado = selecaoAtiva && selecionados?.has(it.pedido_id);
              return (
                <tr
                  key={it.pedido_id}
                  className={`clicavel ${selecionado || marcado ? "selecionada" : ""}`}
                  onClick={() => onDetalhe?.(it)}
                >
                  {selecaoAtiva && (
                    <td className="col-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar pedido ${it.numero}`}
                        checked={Boolean(marcado)}
                        onChange={(event) =>
                          onAlternarSelecao?.(it.pedido_id, event.target.checked)
                        }
                      />
                    </td>
                  )}
                  {colunas.map((c) => (
                    <td
                      key={c.key}
                      className={`col-${c.key} ${c.num ? "num" : ""}`}
                      data-rotulo={c.fixa ? undefined : c.label}
                    >
                      {CELULA[c.key](it, { selecionado, onDetalhe })}
                    </td>
                  ))}
                  <td className="col-acoes" onClick={(e) => e.stopPropagation()}>
                    <Acao
                      it={it}
                      onConfirmar={onConfirmar}
                      onConfirmarEtapa={onConfirmarEtapa}
                      onNegarProducao={onNegarProducao}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalItens > 0 && (
        <div className="pager">
          <label className="campo-inline">
            <span className="campo-rotulo">Linhas por página</span>
            <select value={pageSize} onChange={(e) => onPageSize?.(Number(e.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
          <span className="pager-info">
            {fmtInteiro(inicio + 1)}–{fmtInteiro(Math.min(inicio + pageSize, totalItens))} de{" "}
            {fmtInteiro(totalItens)}
          </span>
          <div className="pager-btns">
            <button
              type="button"
              className="btn btn-sec"
              onClick={() => onPage?.(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              <Icone nome="esquerda" tamanho={14} />
              Anterior
            </button>
            <button
              type="button"
              className="btn btn-sec"
              onClick={() => onPage?.(Math.min(totalPaginas, page + 1))}
              disabled={page >= totalPaginas}
            >
              Próxima
              <Icone nome="direita" tamanho={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
