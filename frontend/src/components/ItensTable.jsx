import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowsDownUp,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  DownloadSimple,
  Hourglass,
  MagnifyingGlass,
  Prohibit,
  Rows,
  SquareHalfBottom,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { motivoLabel } from "../api.js";
import { fmtDataHoraCurta, fmtInteiro, formatarNotaFiscal } from "../lib/format.js";
import { usePreferencia } from "../hooks/usePreferencia.js";
import SeletorColunas from "./SeletorColunas.jsx";

// Rótulo da ação conforme a etapa atual (fluxo sequencial).
const ACAO_ETAPA = {
  pcp: "Confirmar PCP",
  producao: "Confirmar produção",
  comercial: "Agendar inspeção",
  lem: "Confirmar inspeção",
  faturamento: "Aguardando faturamento",
  estoque: "Aguardando embarque",
  entrega: "Confirmar entrega",
};

function acaoDaLinha(it) {
  const etapa = it.processo?.etapa_atual;
  if (!etapa || etapa === "concluido") return { label: "Editar", tipo: "entrega" };
  if (etapa === "entrega") return { label: "Confirmar entrega", tipo: "entrega" };
  if (etapa === "faturamento" || etapa === "estoque") {
    return {
      label: etapa === "faturamento" ? "Aguarda faturamento" : "Aguarda embarque",
      tipo: "etapa",
      bloqueada: true,
    };
  }
  if (etapa === "lem" && it.processo?.lem_aguardando_inicio) {
    return {
      label: `Aguarda ${it.processo.inspecao_agendada_data}`,
      tipo: "etapa",
      bloqueada: true,
    };
  }
  return { label: ACAO_ETAPA[etapa] || "Confirmar etapa", tipo: "etapa" };
}

// Colunas possíveis, na ordem em que aparecem. `key` é também a chave de
// ordenação aceita pelo backend. `fixa` = identifica a linha, não some.
// `padrao` = entra na visão inicial. Cada linha é um PEDIDO.
export const COLUNAS = [
  { key: "status", label: "Status", fixa: true },
  { key: "pedido", label: "Pedido", fixa: true },
  { key: "cliente", label: "Cliente", fixa: true },
  { key: "etapa", label: "Etapa", padrao: true },
  { key: "prazo", label: "Contract Date", padrao: true },
  { key: "qtd", label: "Faturado / Pedido", num: true, padrao: true },
  { key: "atraso", label: "Atraso", padrao: true },
  { key: "itens", label: "Itens", num: true },
  { key: "solicitada", label: "Digitação" },
  { key: "faturamento", label: "Faturamento" },
  { key: "nota_fiscal", label: "Nota fiscal" },
  { key: "embarque", label: "Embarque" },
  { key: "entrega", label: "Entrega" },
  { key: "motivo", label: "Motivo" },
];

const COLUNAS_PADRAO = COLUNAS.filter((c) => c.padrao).map((c) => c.key);

// Status com ícone + texto: a cor nunca é o único sinal.
const STATUS = {
  otif: { txt: "OTIF", cls: "badge-ok", Icone: CheckCircle },
  falha: { txt: "Falha", cls: "badge-fail", Icone: XCircle },
  pendente: { txt: "Pendente", cls: "badge-pend", Icone: Hourglass },
  sem_contract_date: { txt: "Sem Contract Date", cls: "badge-missing", Icone: WarningCircle },
};

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pendente;
  const { Icone } = s;
  return (
    <span className={`badge ${s.cls}`}>
      <Icone size={14} weight="fill" aria-hidden="true" />
      {s.txt}
    </span>
  );
}

function PrazoCell({ it }) {
  const contractDate = it.contract_date || it.prazo_entrega;
  if (!contractDate) {
    return (
      <span className="prazo-ausente">
        <WarningCircle size={14} weight="fill" aria-hidden="true" />
        Não informado
      </span>
    );
  }

  let contagem = null;
  let classeContagem = "prazo-neutro";
  if (it.status === "pendente" && it.dias_restantes != null) {
    const dias = it.dias_restantes;
    classeContagem =
      it.situacao_prazo === "vencido"
        ? "prazo-vencido"
        : it.situacao_prazo === "atencao"
          ? "prazo-atencao"
          : "prazo-ok";
    if (dias < 0) contagem = `vencido há ${Math.abs(dias)}d`;
    else if (dias === 0) contagem = "vence hoje";
    else contagem = `faltam ${dias}d`;
  }

  return (
    <span className="prazo-cell" title={`Contract Date: ${contractDate}`}>
      <span className="prazo-data">{contractDate}</span>
      {contagem && <span className={`prazo-contagem ${classeContagem}`}>{contagem}</span>}
    </span>
  );
}

function EtapaCell({ it }) {
  const processo = it.processo;
  if (!processo) return <span className="prazo-neutro">-</span>;

  let detalhe = null;
  const ultimaNegativaAberta = processo.negativas_producao?.find(
    (negativa) => !negativa.resolvida_em
  );
  const bloqueio = processo.etapa_atual === "pcp" && ultimaNegativaAberta;
  const classe = processo.concluido
    ? "etapa-tag etapa-done"
    : bloqueio
      ? "etapa-tag etapa-bloqueio"
      : "etapa-tag";

  // Mini-trilha das etapas: posição no fluxo sem abrir o detalhe.
  const etapas = (processo.etapas || []).filter(
    (etapa) => etapa.chave !== "pedido"
  );
  const progresso = etapas.length > 1 && (
    <span className="etapa-progresso" aria-hidden="true">
      {etapas.map((etapa) => (
        <i
          key={etapa.chave}
          className={
            etapa.concluida ? "feito" : etapa.chave === processo.etapa_atual ? "atual" : ""
          }
        />
      ))}
    </span>
  );
  if (processo.etapa_atual === "pcp" && ultimaNegativaAberta) {
    const quantidade = processo.negativas_abertas || 1;
    detalhe = `${quantidade} ${quantidade === 1 ? "negativa" : "negativas"} · previsão ${
      ultimaNegativaAberta.data_prevista
    }`;
  } else if (processo.etapa_atual === "faturamento") {
    detalhe = "aguardando data/hora do ERP";
  } else if (processo.etapa_atual === "estoque") {
    const dias = processo.dias_na_etapa_atual ?? 0;
    detalhe = dias > 0 ? `${dias}d em estoque · aguarda embarque` : "aguarda embarque ERP";
  } else if (processo.etapa_atual === "lem") {
    if (processo.lem_aguardando_inicio) {
      detalhe = `aguarda ${processo.inicio_lem_data} · ${
        processo.dias_ate_inicio_lem ?? 0
      }d`;
    } else {
      detalhe = `${processo.dias_na_etapa_atual ?? 0}d no LEM`;
    }
  } else if (processo.inspecao_agendada_data) {
    detalhe = `inspeção ${processo.inspecao_agendada_data}`;
  }

  return (
    <span className="etapa-cell-wrap">
      <span className={classe}>
        {processo.concluido && <Check size={12} weight="bold" aria-hidden="true" />}
        {bloqueio && <Prohibit size={12} weight="bold" aria-hidden="true" />}
        {processo.etapa_atual_nome}
      </span>
      {progresso}
      {detalhe && <span className="etapa-agendamento">{detalhe}</span>}
    </span>
  );
}

function QtdCell({ pedida, faturada }) {
  const p = Number(pedida) || 0;
  const f = Number(faturada) || 0;
  const pct = p > 0 ? Math.min(100, (f / p) * 100) : 0;
  const full = p > 0 && f >= p;
  return (
    <>
      <div className="qtd">
        {f} de {p}
      </div>
      <div className={`qtd-bar ${full ? "full" : ""}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

function AtrasoCell({ it }) {
  if (it.dias_atraso == null) return "-";
  if (it.dias_atraso > 0) {
    return (
      <span className="atraso">
        +{it.dias_atraso}d{it.origem_atraso ? ` (${it.origem_atraso})` : ""}
      </span>
    );
  }
  return <span className="prazo-neutro">no prazo</span>;
}

function PedidoCell({ it, selecionado, onDetalhe }) {
  return (
    <>
      <button
        type="button"
        className="ped-num ped-link"
        aria-label={`Ver detalhes do pedido ${it.numero}, cliente ${it.cliente}`}
        aria-haspopup="dialog"
        aria-expanded={selecionado}
        aria-controls="pedido-drawer"
        onClick={(event) => {
          event.stopPropagation();
          onDetalhe?.(it);
        }}
      >
        {it.numero}
      </button>
      {it.erp_id != null && <div className="ped-interno">ID ERP {it.erp_id}</div>}
      {it.numero_interno && <div className="ped-interno">interno {it.numero_interno}</div>}
    </>
  );
}

const CELULA = {
  status: (it) => <StatusBadge status={it.status} />,
  pedido: (it, ctx) => (
    <PedidoCell it={it} selecionado={ctx.selecionado} onDetalhe={ctx.onDetalhe} />
  ),
  // Razão social longa é a regra, não a exceção: trunca na célula e mantém o
  // nome completo acessível no title.
  cliente: (it) => <span title={it.cliente}>{it.cliente}</span>,
  etapa: (it) => <EtapaCell it={it} />,
  prazo: (it) => <PrazoCell it={it} />,
  qtd: (it) => <QtdCell pedida={it.qtd_pedida_total} faturada={it.qtd_faturada_total} />,
  atraso: (it) => <AtrasoCell it={it} />,
  itens: (it) => it.qtd_itens,
  solicitada: (it) => it.data_solicitada,
  faturamento: (it) => fmtDataHoraCurta(it.faturamento_em || it.processo?.faturamento_em),
  nota_fiscal: (it) => formatarNotaFiscal(it.nota_fiscal_numero, it.nota_fiscal_serie),
  embarque: (it) => fmtDataHoraCurta(it.embarque_em || it.processo?.embarque_em),
  entrega: (it) => it.data_entrega_real || "-",
  motivo: (it) => (it.motivo_falha ? motivoLabel(it.motivo_falha) : "-"),
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
    "ID ERP",
    "Pedido (cliente)",
    "Nº interno",
    "Cliente",
    "Itens",
    "Etapa atual",
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
      it.erp_id,
      it.numero,
      it.numero_interno,
      it.cliente,
      it.qtd_itens,
      it.processo?.etapa_atual_nome || "",
      it.processo?.comercial_data || "",
      it.processo?.inspecao_agendada_data || "",
      it.processo?.lem_data || "",
      it.faturamento_em || it.processo?.faturamento_em || "",
      it.nota_fiscal_numero || "",
      it.nota_fiscal_serie || "",
      it.embarque_em || it.processo?.embarque_em || "",
      it.processo?.gargalo || "",
      it.data_solicitada,
      it.contract_date || it.prazo_entrega,
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

export default function ItensTable({
  itens,
  carregando = false,
  ordenacao = { sort: "prazo", order: "asc" },
  onOrdenar,
  page = 1,
  pageSize = 25,
  totalItens = 0,
  totalPaginas = 1,
  onPage,
  onPageSize,
  onExportCsv,
  onConfirmar,
  onConfirmarEtapa,
  pedidoSelecionadoId,
  onDetalhe,
}) {
  // Sistema operacional: densidade compacta é o padrão, porque a tarefa é
  // escanear muitas linhas, não admirar o espaçamento.
  const [densidade, setDensidade] = usePreferencia("otif.tabela.densidade", "compacta");
  const [colunasVisiveis, setColunasVisiveis] = usePreferencia(
    "otif.tabela.colunas",
    COLUNAS_PADRAO
  );
  const [exportando, setExportando] = useState(false);
  const [erroExportacao, setErroExportacao] = useState("");

  const colunas = COLUNAS.filter(
    (coluna) => coluna.fixa || colunasVisiveis.includes(coluna.key)
  );
  const totalColunas = colunas.length + 1; // + coluna de ações
  const vazio = !carregando && itens.length === 0;
  const inicio = totalItens === 0 ? 0 : (page - 1) * pageSize;

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
    <section className="panel panel-tabela" aria-busy={carregando} aria-labelledby="pedidos-tabela-titulo">
      <h3 id="pedidos-tabela-titulo" className="sr-only">
        Lista de pedidos
      </h3>

      <div className="tabela-toolbar">
        <span className="tabela-contagem" aria-live="polite">
          {carregando && itens.length === 0 ? (
            "Carregando pedidos…"
          ) : (
            <>
              <b>{fmtInteiro(totalItens)}</b>
              {totalItens === 1 ? "pedido" : "pedidos"}
            </>
          )}
        </span>

        <div className="toolbar-spacer" />

        <div className="densidade-toggle" role="group" aria-label="Densidade da tabela">
          <button
            type="button"
            className={densidade === "compacta" ? "ativo" : ""}
            aria-pressed={densidade === "compacta"}
            onClick={() => setDensidade("compacta")}
          >
            <Rows size={14} aria-hidden="true" />
            Compacta
          </button>
          <button
            type="button"
            className={densidade === "confortavel" ? "ativo" : ""}
            aria-pressed={densidade === "confortavel"}
            onClick={() => setDensidade("confortavel")}
          >
            <SquareHalfBottom size={14} aria-hidden="true" />
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
          className="btn-sec btn-compacto"
          onClick={exportar}
          disabled={totalItens === 0 || exportando}
        >
          <DownloadSimple className="ico" size={16} weight="bold" aria-hidden="true" />
          {exportando ? "Exportando…" : "Exportar CSV"}
        </button>
      </div>

      {erroExportacao && (
        <div className="exportacao-erro" role="alert">
          {erroExportacao}
        </div>
      )}

      <div className="tabela-wrap">
        <table
          className={`tabela ${densidade === "compacta" ? "compacta" : ""}`}
          aria-labelledby="pedidos-tabela-titulo"
        >
          <thead>
            <tr>
              {colunas.map((c) => {
                const ativo = c.key === ordenacao.sort;
                return (
                  <th
                    key={c.key}
                    className={`sortable ${c.num ? "num" : ""}`}
                    aria-sort={
                      ativo ? (ordenacao.order === "asc" ? "ascending" : "descending") : "none"
                    }
                  >
                    <button
                      type="button"
                      className="th-sort-button"
                      onClick={() => onOrdenar?.(c.key)}
                      aria-label={`Ordenar por ${c.label}${
                        ativo
                          ? ordenacao.order === "asc"
                            ? ", ordem crescente"
                            : ", ordem decrescente"
                          : ""
                      }`}
                    >
                      <span className="th-inner">
                        {c.label}
                        <span className={`sort-ind ${ativo ? "" : "inativo"}`} aria-hidden="true">
                          {!ativo ? (
                            <ArrowsDownUp size={13} />
                          ) : ordenacao.order === "asc" ? (
                            <ArrowUp size={13} weight="bold" />
                          ) : (
                            <ArrowDown size={13} weight="bold" />
                          )}
                        </span>
                      </span>
                    </button>
                  </th>
                );
              })}
              <th className="col-acoes">
                <span className="th-estatico">Ação</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {carregando &&
              itens.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {Array.from({ length: totalColunas }).map((__, j) => (
                    <td key={j} className={j === totalColunas - 1 ? "col-acoes" : ""}>
                      <div className="skeleton sk-line" style={{ marginBottom: 0 }} />
                    </td>
                  ))}
                </tr>
              ))}

            {vazio && (
              <tr>
                <td className="tabela-vazio" colSpan={totalColunas}>
                  <MagnifyingGlass className="ico" size={28} aria-hidden="true" />
                  <strong>Nenhum pedido neste recorte.</strong>
                  <span>
                    Troque a situação na barra acima ou amplie o período de digitação.
                  </span>
                </td>
              </tr>
            )}

            {itens.map((it) => {
              const selecionado = it.pedido_id === pedidoSelecionadoId;
              const acao = acaoDaLinha(it);
              const handler = acao.tipo === "etapa" ? onConfirmarEtapa : onConfirmar;
              const ctx = { selecionado, onDetalhe };
              const pendente = it.status === "pendente";
              const risco =
                pendente && it.situacao_prazo === "vencido"
                  ? "linha-vencida"
                  : pendente && it.situacao_prazo === "atencao"
                    ? "linha-atencao"
                    : "";
              return (
                <tr
                  key={it.pedido_id}
                  className={`clicavel ${risco} ${selecionado ? "selecionada" : ""}`}
                  onClick={() => onDetalhe?.(it)}
                >
                  {colunas.map((c) => (
                    <td key={c.key} className={c.num ? "num" : c.key === "cliente" ? "cliente" : ""}>
                      {CELULA[c.key](it, ctx)}
                    </td>
                  ))}
                  <td className="col-acoes" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-sec btn-acao"
                      onClick={() => handler?.(it)}
                      disabled={acao.bloqueada}
                      title={
                        acao.bloqueada
                          ? it.processo?.etapa_atual === "faturamento"
                            ? "O faturamento virá na próxima atualização direta do JUND."
                            : it.processo?.etapa_atual === "estoque"
                              ? "O embarque virá na próxima atualização direta do JUND."
                              : "O LEM ainda aguarda seus pré-requisitos."
                          : undefined
                      }
                    >
                      {acao.label}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalItens > 0 && (
        <div className="pager">
          <label>
            Linhas por página{" "}
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
              onClick={() => onPage?.(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              <CaretLeft size={14} weight="bold" aria-hidden="true" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => onPage?.(Math.min(totalPaginas, page + 1))}
              disabled={page >= totalPaginas}
            >
              Próxima
              <CaretRight size={14} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
