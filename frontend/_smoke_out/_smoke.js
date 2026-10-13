import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { renderToString } from 'react-dom/server';
import { useState, useLayoutEffect, useRef, useEffect } from 'react';

function MetricCard({
  titulo,
  valor,
  sufixo = "",
  tom = "neutro",
  rodape,
  onClick,
  ativo = false,
  hero = false,
  className = ""
}) {
  const clicavel = typeof onClick === "function";
  const cls = [
    "metric",
    `metric-${tom}`,
    hero ? "metric-hero" : "",
    ativo ? "metric-ativo" : "",
    className
  ].filter(Boolean).join(" ");
  const conteudo = /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "metric-titulo", children: titulo }),
    /* @__PURE__ */ jsxs("div", { className: "metric-valor", children: [
      valor,
      sufixo && /* @__PURE__ */ jsx("span", { className: "metric-sufixo", children: sufixo })
    ] }),
    rodape && /* @__PURE__ */ jsx("div", { className: "metric-rodape", children: rodape })
  ] });
  if (clicavel) {
    return /* @__PURE__ */ jsx("button", { type: "button", className: cls, onClick, "aria-current": ativo || void 0, children: conteudo });
  }
  return /* @__PURE__ */ jsx("div", { className: cls, children: conteudo });
}

// Meta de OTIF (%) padrao, usada como fallback ate o backend responder.
// A meta efetiva vem de GET /config (tela Ajustes).
const META_OTIF_PADRAO = 95;

// Tom (cor) de um percentual conforme a meta. Verde >= meta, amarelo >= 85, senao vermelho.
function tom(pct, meta = META_OTIF_PADRAO) {
  if (pct >= meta) return "bom";
  if (pct >= 85) return "medio";
  return "ruim";
}

function fmtPct(n) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function fmtInteiro(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

function formatarNotaFiscal(numero, serie) {
  if (!numero) return "-";
  return serie ? `NF ${numero} · série ${serie}` : `NF ${numero}`;
}

// Data/hora do ERP em formato de tabela: sem segundos e com ano de 2 dígitos.
// Segundos são ruído numa grade e custam ~25% da largura da célula.
function fmtDataHoraCurta(iso) {
  if (!iso) return "-";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  const dia = data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} ${hora}`;
}

// Data/hora completa, para o drawer e o CSV, onde há espaço e rastreabilidade importa.
function fmtDataHora(iso) {
  if (!iso) return "-";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "2026-09-24" -> "24/09/2026". Trabalha com a string ISO para não introduzir
// deslocamento de fuso ao instanciar Date com data pura.
function fmtDataIso(dataIso) {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

// Data local no formato aceito por <input type="date"> e pela API.
function isoLocal(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function MetaChip({ pct, meta = META_OTIF_PADRAO }) {
  const diff = Math.round((pct - meta) * 10) / 10;
  const ok = diff >= 0;
  return /* @__PURE__ */ jsxs("span", { className: `meta ${ok ? "meta-ok" : "meta-bad"}`, children: [
    "Meta ≥ ",
    fmtPct(meta),
    "% · ",
    ok ? "+" : "",
    fmtPct(diff),
    " p.p."
  ] });
}

// Largura real do elemento, em pixels. Permite desenhar SVG em coordenadas
// reais em vez de usar preserveAspectRatio="none", que distorce traços,
// círculos e texto quando o container muda de largura.
//
// useLayoutEffect (e não useEffect) porque a medição precisa acontecer antes da
// pintura: com useEffect o gráfico aparece vazio por um frame.
function useLarguraElemento(ref) {
  const [largura, setLargura] = useState(0);

  useLayoutEffect(() => {
    const elemento = ref.current;
    if (!elemento) return undefined;

    setLargura(Math.round(elemento.getBoundingClientRect().width));

    const observador = new ResizeObserver((entradas) => {
      const medida = entradas[0]?.contentRect?.width ?? 0;
      setLargura(Math.round(medida));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [ref]);

  return largura;
}

const ALTURA = 168;
const RECUO = 18;
function fmtMes(mes) {
  return `${mes.slice(5, 7)}/${mes.slice(2, 4)}`;
}
function escala(valores, meta) {
  const minimo = Math.min(...valores, meta);
  const base = Math.max(0, Math.floor(minimo - 4));
  const yMin = base >= 98 ? 90 : base;
  return { yMin, yMax: 100 };
}
function OtifTrend({ dados, meta = 95 }) {
  const plotRef = useRef(null);
  const largura = useLarguraElemento(plotRef);
  const pontos = (dados || []).filter((d) => d.total_avaliados > 0);
  const ultimo = pontos[pontos.length - 1];
  const anterior = pontos[pontos.length - 2];
  const delta = ultimo && anterior ? Math.round((ultimo.otif_pct - anterior.otif_pct) * 10) / 10 : null;
  const { yMin, yMax } = pontos.length ? escala(
    pontos.map((d) => d.otif_pct),
    meta
  ) : { yMin: 0, yMax: 100 };
  const razao = (valor) => (valor - yMin) / (yMax - yMin);
  const posY = (valor) => ALTURA - razao(valor) * ALTURA;
  const posX = (indice) => pontos.length === 1 ? largura / 2 : RECUO + indice * (largura - RECUO * 2) / (pontos.length - 1);
  const coordenadas = pontos.map((d, i) => ({ x: posX(i), y: posY(d.otif_pct), d }));
  const linha = coordenadas.map((p) => `${p.x},${p.y}`).join(" ");
  const area = coordenadas.length ? [
    `M${coordenadas[0].x},${ALTURA}`,
    ...coordenadas.map((p) => `L${p.x},${p.y}`),
    `L${coordenadas[coordenadas.length - 1].x},${ALTURA}`,
    "Z"
  ].join(" ") : "";
  return /* @__PURE__ */ jsxs("section", { className: "panel", "aria-labelledby": "otif-mes-titulo", children: [
    /* @__PURE__ */ jsxs("div", { className: "panel-head", children: [
      /* @__PURE__ */ jsx("h3", { id: "otif-mes-titulo", children: "OTIF por mês" }),
      ultimo && /* @__PURE__ */ jsxs("span", { className: "panel-hint", children: [
        fmtMes(ultimo.mes),
        ": ",
        fmtPct(ultimo.otif_pct),
        "%",
        delta != null && /* @__PURE__ */ jsxs("span", { className: delta >= 0 ? "up" : "down", children: [
          " ",
          delta >= 0 ? "↑" : "↓",
          " ",
          fmtPct(Math.abs(delta)),
          " p.p. vs. mês anterior"
        ] })
      ] })
    ] }),
    pontos.length === 0 ? /* @__PURE__ */ jsx("p", { className: "vazio", children: "Sem meses com pedidos avaliados no recorte atual." }) : /* @__PURE__ */ jsxs("div", { className: "grafico", children: [
      /* @__PURE__ */ jsxs("div", { className: "grafico-y", style: { height: ALTURA }, "aria-hidden": "true", children: [
        /* @__PURE__ */ jsxs("span", { style: { top: 0 }, children: [
          yMax,
          "%"
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "grafico-y-meta", style: { top: `${(1 - razao(meta)) * 100}%` }, children: [
          meta,
          "%"
        ] }),
        /* @__PURE__ */ jsxs("span", { style: { top: "100%" }, children: [
          yMin,
          "%"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grafico-plot", ref: plotRef, style: { height: ALTURA }, children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "grafico-meta-linha",
            style: { top: `${(1 - razao(meta)) * 100}%` },
            "aria-hidden": "true"
          }
        ),
        largura > 0 && /* @__PURE__ */ jsxs(
          "svg",
          {
            width: largura,
            height: ALTURA,
            role: "img",
            "aria-label": `Evolução do OTIF por mês. Último mês ${fmtMes(
              ultimo.mes
            )} com ${fmtPct(ultimo.otif_pct)} por cento. Meta ${meta} por cento.`,
            children: [
              /* @__PURE__ */ jsx("path", { className: "grafico-area", d: area }),
              coordenadas.length > 1 && /* @__PURE__ */ jsx("polyline", { className: "grafico-linha", points: linha }),
              coordenadas.map((p, i) => {
                const abaixo = p.d.otif_pct < meta;
                const derradeiro = i === coordenadas.length - 1;
                return /* @__PURE__ */ jsxs("g", { children: [
                  /* @__PURE__ */ jsx(
                    "circle",
                    {
                      className: `grafico-ponto ${abaixo ? "abaixo" : ""} ${derradeiro ? "ultimo" : ""}`,
                      cx: p.x,
                      cy: p.y,
                      r: derradeiro ? 4.5 : 3
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "text",
                    {
                      className: `grafico-valor ${abaixo ? "abaixo" : ""}`,
                      x: p.x,
                      y: p.y < 18 ? p.y + 17 : p.y - 10,
                      textAnchor: "middle",
                      children: Math.round(p.d.otif_pct)
                    }
                  ),
                  /* @__PURE__ */ jsx("title", { children: `${fmtMes(p.d.mes)}: ${fmtPct(p.d.otif_pct)}% OTIF em ${p.d.total_avaliados} pedidos avaliados` })
                ] }, p.d.mes);
              })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grafico-x", "aria-hidden": "true", children: largura > 0 && coordenadas.map((p) => /* @__PURE__ */ jsx("span", { style: { left: p.x }, children: fmtMes(p.d.mes) }, p.d.mes)) })
    ] })
  ] });
}

const MOTIVOS = [
  { value: "falta_estoque", label: "Falta de estoque" },
  { value: "atraso_producao", label: "Atraso de produção" },
  { value: "atraso_faturamento", label: "Atraso de faturamento" },
  { value: "atraso_transporte", label: "Atraso de transporte" },
  { value: "recusa_cliente", label: "Recusa do cliente" },
  { value: "erro_documento", label: "Erro de documento" },
  { value: "avaria", label: "Avaria" },
  { value: "outro", label: "Outro" }
];
const MOTIVO_LABELS = {
  ...Object.fromEntries(MOTIVOS.map((m) => [m.value, m.label])),
  nao_informado: "Não informado"
};
function motivoLabel(value) {
  return MOTIVO_LABELS[value] || value;
}

function MotivosFalha({ motivos }) {
  const lista = motivos || [];
  const total = lista.reduce((s, x) => s + x.quantidade, 0);
  const max = lista.reduce((m, x) => Math.max(m, x.quantidade), 0) || 1;
  return /* @__PURE__ */ jsxs("section", { className: "panel", children: [
    /* @__PURE__ */ jsxs("div", { className: "panel-head", children: [
      /* @__PURE__ */ jsx("h3", { children: "Falhas por motivo" }),
      total > 0 && /* @__PURE__ */ jsxs("span", { className: "panel-hint", children: [
        total,
        " no período"
      ] })
    ] }),
    lista.length === 0 ? /* @__PURE__ */ jsx("p", { className: "vazio", children: "Nenhuma falha registrada no período." }) : /* @__PURE__ */ jsx("ul", { className: "motivos", children: lista.map((m) => /* @__PURE__ */ jsxs("li", { children: [
      /* @__PURE__ */ jsx("span", { className: "motivo-nome", children: motivoLabel(m.motivo) }),
      /* @__PURE__ */ jsx("span", { className: "motivo-barra-wrap", children: /* @__PURE__ */ jsx(
        "span",
        {
          className: "motivo-barra",
          style: { width: `${m.quantidade / max * 100}%` }
        }
      ) }),
      /* @__PURE__ */ jsx("span", { className: "motivo-qtd", children: m.quantidade })
    ] }, m.motivo)) })
  ] });
}

function OtifClientes({ clientes, meta, limite = 8 }) {
  const avaliados = (clientes || []).filter((c) => c.total_avaliados > 0);
  const lista = avaliados.slice(0, limite);
  return /* @__PURE__ */ jsxs("section", { className: "panel", children: [
    /* @__PURE__ */ jsxs("div", { className: "panel-head", children: [
      /* @__PURE__ */ jsx("h3", { children: "OTIF por cliente" }),
      avaliados.length > 0 && /* @__PURE__ */ jsxs("span", { className: "panel-hint", children: [
        "piores ",
        lista.length,
        " de ",
        avaliados.length
      ] })
    ] }),
    lista.length === 0 ? /* @__PURE__ */ jsx("p", { className: "vazio", children: "Sem clientes com pedidos avaliados no período." }) : /* @__PURE__ */ jsx("ul", { className: "motivos", children: lista.map((c) => /* @__PURE__ */ jsxs("li", { title: `${c.otif_ok} OTIF de ${c.total_avaliados} avaliados`, children: [
      /* @__PURE__ */ jsx("span", { className: "motivo-nome", title: c.cliente, children: c.cliente }),
      /* @__PURE__ */ jsx("span", { className: "motivo-barra-wrap", children: /* @__PURE__ */ jsx(
        "span",
        {
          className: `motivo-barra barra-${tom(c.otif_pct, meta)}`,
          style: { width: `${Math.max(2, c.otif_pct)}%` }
        }
      ) }),
      /* @__PURE__ */ jsxs("span", { className: "motivo-qtd", children: [
        fmtPct(c.otif_pct),
        "%"
      ] })
    ] }, c.cliente)) })
  ] });
}

const PRESETS = [
  { id: "tudo", label: "Todo o histórico", dias: null },
  { id: "30", label: "30 dias", dias: 30 },
  { id: "90", label: "90 dias", dias: 90 },
  { id: "365", label: "12 meses", dias: 365 }
];
function intervaloDe(dias) {
  if (dias == null) return { data_ini: "", data_fim: "" };
  const fim = /* @__PURE__ */ new Date();
  const inicio = /* @__PURE__ */ new Date();
  inicio.setDate(inicio.getDate() - (dias - 1));
  return { data_ini: isoLocal(inicio), data_fim: isoLocal(fim) };
}
function presetAtivo(filtros) {
  if (!filtros.data_ini && !filtros.data_fim) return "tudo";
  const encontrado = PRESETS.find((preset) => {
    if (preset.dias == null) return false;
    const intervalo = intervaloDe(preset.dias);
    return intervalo.data_ini === filtros.data_ini && intervalo.data_fim === filtros.data_fim;
  });
  return encontrado?.id || "personalizado";
}
function descreverPeriodo(filtros) {
  if (filtros.data_ini && filtros.data_fim) {
    return `digitação de ${fmtDataIso(filtros.data_ini)} a ${fmtDataIso(filtros.data_fim)}`;
  }
  if (filtros.data_ini) return `digitação desde ${fmtDataIso(filtros.data_ini)}`;
  if (filtros.data_fim) return `digitação até ${fmtDataIso(filtros.data_fim)}`;
  return "todo o histórico de digitação";
}
function PeriodoRapido({ filtros, onPeriodo, onRemoverCliente }) {
  const ativo = presetAtivo(filtros);
  return /* @__PURE__ */ jsxs("div", { className: "recorte", children: [
    /* @__PURE__ */ jsx("span", { className: "recorte-rotulo", children: "Recorte" }),
    /* @__PURE__ */ jsxs("div", { className: "seg-grupo", role: "group", "aria-label": "Período de digitação", children: [
      PRESETS.map((preset) => /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: `seg ${ativo === preset.id ? "ativo" : ""}`,
          "aria-pressed": ativo === preset.id,
          onClick: () => onPeriodo(intervaloDe(preset.dias)),
          children: preset.label
        },
        preset.id
      )),
      ativo === "personalizado" && /* @__PURE__ */ jsx("span", { className: "seg ativo seg-estatico", children: "Personalizado" })
    ] }),
    /* @__PURE__ */ jsx("span", { className: "recorte-info", children: descreverPeriodo(filtros) }),
    filtros.cliente && /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        className: "filtro-chip",
        "aria-label": `Remover filtro de cliente ${filtros.cliente}`,
        onClick: onRemoverCliente,
        children: [
          /* @__PURE__ */ jsxs("span", { children: [
            "Cliente: ",
            filtros.cliente
          ] }),
          /* @__PURE__ */ jsx("span", { className: "filtro-chip-remover", "aria-hidden": "true", children: "×" })
        ]
      }
    )
  ] });
}

function SkeletonStrip() {
  return /* @__PURE__ */ jsx("div", { className: "sk-strip", "aria-hidden": "true", children: Array.from({ length: 4 }).map((_, i) => /* @__PURE__ */ jsxs("div", { className: "sk-seg", children: [
    /* @__PURE__ */ jsx("div", { className: "skeleton sk-line", style: { width: "50%" } }),
    /* @__PURE__ */ jsx("div", { className: "skeleton sk-line big" }),
    /* @__PURE__ */ jsx("div", { className: "skeleton sk-line", style: { width: "70%", marginBottom: 0 } })
  ] }, i)) });
}
function VisaoGeral({
  metricas,
  tendencia,
  clientes,
  carregando,
  filtros,
  meta = META_OTIF_PADRAO,
  diasAlerta = 7,
  onPeriodo,
  onRemoverCliente,
  onDrillSituacao,
  onDrillSemContractDate
}) {
  const semContractDate = metricas?.total_sem_contract_date || 0;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      PeriodoRapido,
      {
        filtros,
        onPeriodo,
        onRemoverCliente
      }
    ),
    !metricas ? carregando ? /* @__PURE__ */ jsx(SkeletonStrip, {}) : null : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("section", { className: "kpi-strip", "aria-label": "Indicadores do recorte", children: [
        /* @__PURE__ */ jsx(
          MetricCard,
          {
            hero: true,
            titulo: "OTIF",
            valor: fmtPct(metricas.otif_pct),
            sufixo: "%",
            tom: tom(metricas.otif_pct, meta),
            rodape: /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(MetaChip, { pct: metricas.otif_pct, meta }),
              /* @__PURE__ */ jsxs("div", { className: "metric-sub", children: [
                fmtInteiro(metricas.otif_ok),
                " de ",
                fmtInteiro(metricas.total_avaliados),
                " ",
                "pedidos avaliados"
              ] })
            ] })
          }
        ),
        /* @__PURE__ */ jsx(
          MetricCard,
          {
            titulo: "On Time",
            valor: fmtPct(metricas.on_time_pct),
            sufixo: "%",
            tom: tom(metricas.on_time_pct, meta),
            rodape: "entregas até o Contract Date"
          }
        ),
        /* @__PURE__ */ jsx(
          MetricCard,
          {
            titulo: "In Full",
            valor: fmtPct(metricas.in_full_pct),
            sufixo: "%",
            tom: tom(metricas.in_full_pct, meta),
            rodape: "entregas completas"
          }
        ),
        /* @__PURE__ */ jsx(
          MetricCard,
          {
            titulo: "Pendentes",
            valor: fmtInteiro(metricas.total_pendentes),
            tom: "neutro",
            rodape: "ainda sem resultado de OTIF"
          }
        )
      ] }),
      semContractDate > 0 && /* @__PURE__ */ jsxs("button", { type: "button", className: "contract-date-alert", onClick: onDrillSemContractDate, children: [
        /* @__PURE__ */ jsx("span", { className: "contract-date-alert-count", children: semContractDate }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("strong", { children: semContractDate === 1 ? "pedido sem Contract Date" : "pedidos sem Contract Date" }),
          /* @__PURE__ */ jsx("small", { children: "Corrija a data de entrega no pedido do JUND. Esses pedidos não entram nas taxas." })
        ] }),
        /* @__PURE__ */ jsx("span", { className: "contract-date-alert-action", children: "Ver pedidos →" })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "risk-block", "aria-label": "Pendentes por Contract Date", children: [
        /* @__PURE__ */ jsxs("div", { className: "risk-head", children: [
          /* @__PURE__ */ jsx("span", { className: "risk-head-titulo", children: "Pendentes por Contract Date" }),
          /* @__PURE__ */ jsxs("span", { className: "risk-sub", children: [
            "prazo oficial do JUND · atenção quando faltam até ",
            diasAlerta,
            " dias · clique para abrir a lista"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "risk-bar", children: [
          /* @__PURE__ */ jsx(
            MetricCard,
            {
              className: "risk-item",
              titulo: "Vencidos",
              valor: fmtInteiro(metricas.pendentes_vencidos),
              tom: "ruim",
              rodape: "Contract Date ultrapassado",
              onClick: () => onDrillSituacao("vencido")
            }
          ),
          /* @__PURE__ */ jsx(
            MetricCard,
            {
              className: "risk-item",
              titulo: "Atenção",
              valor: fmtInteiro(metricas.pendentes_atencao),
              tom: "medio",
              rodape: `faltam até ${diasAlerta} dias`,
              onClick: () => onDrillSituacao("atencao")
            }
          ),
          /* @__PURE__ */ jsx(
            MetricCard,
            {
              className: "risk-item",
              titulo: "No prazo",
              valor: fmtInteiro(metricas.pendentes_no_prazo),
              tom: "bom",
              rodape: "com folga até o Contract Date",
              onClick: () => onDrillSituacao("no_prazo")
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx(OtifTrend, { dados: tendencia, meta }),
      /* @__PURE__ */ jsxs("section", { className: "panels-2", children: [
        /* @__PURE__ */ jsx(MotivosFalha, { motivos: metricas.motivos_falha }),
        /* @__PURE__ */ jsx(OtifClientes, { clientes, meta })
      ] })
    ] })
  ] });
}

const GRUPOS = [
  [{ id: "todos", label: "Todos", status: "", situacao: "" }],
  [
    { id: "pendente", label: "Pendentes", status: "pendente", situacao: "" },
    { id: "vencido", label: "Vencidos", status: "pendente", situacao: "vencido", tom: "ruim" },
    { id: "atencao", label: "Atenção", status: "pendente", situacao: "atencao", tom: "medio" },
    { id: "no_prazo", label: "No prazo", status: "pendente", situacao: "no_prazo", tom: "bom" }
  ],
  [
    { id: "otif", label: "OTIF", status: "otif", situacao: "", tom: "bom" },
    { id: "falha", label: "Falha", status: "falha", situacao: "", tom: "ruim" },
    {
      id: "sem_contract_date",
      label: "Sem Contract Date",
      status: "sem_contract_date",
      situacao: "",
      tom: "medio"
    }
  ]
];
function SegmentosPedidos({ filtros, onSelecionar }) {
  const statusAtual = filtros.status || "";
  const situacaoAtual = filtros.situacao_prazo || "";
  return /* @__PURE__ */ jsx("div", { className: "seg-barra", role: "group", "aria-label": "Filtrar pedidos por situação", children: GRUPOS.map((grupo, indiceGrupo) => /* @__PURE__ */ jsxs("div", { className: "seg-grupo", children: [
    indiceGrupo > 0 && /* @__PURE__ */ jsx("span", { className: "seg-divisor", "aria-hidden": "true" }),
    grupo.map((segmento) => {
      const ativo = segmento.status === statusAtual && segmento.situacao === situacaoAtual;
      return /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: `seg ${segmento.tom ? `seg-${segmento.tom}` : ""} ${ativo ? "ativo" : ""}`,
          "aria-pressed": ativo,
          onClick: () => onSelecionar({
            status: segmento.status,
            situacao_prazo: segmento.situacao
          }),
          children: segmento.label
        },
        segmento.id
      );
    })
  ] }, grupo[0].id)) });
}

const FILTROS_PEDIDOS_VAZIOS = Object.freeze({
  data_ini: "",
  data_fim: "",
  cliente: "",
  status: "",
  situacao_prazo: "",
});

const STATUS_VALIDOS = new Set(["otif", "falha", "pendente", "sem_contract_date"]);
const SITUACOES_VALIDAS = new Set(["no_prazo", "atencao", "vencido"]);

function normalizarFiltrosPedidos(filtros = {}) {
  const status = STATUS_VALIDOS.has(filtros.status) ? filtros.status : "";
  let situacaoPrazo = SITUACOES_VALIDAS.has(filtros.situacao_prazo)
    ? filtros.situacao_prazo
    : "";
  let statusNormalizado = status;

  if (statusNormalizado && statusNormalizado !== "pendente") situacaoPrazo = "";
  else if (situacaoPrazo) statusNormalizado = "pendente";

  return {
    data_ini: String(filtros.data_ini || "").trim(),
    data_fim: String(filtros.data_fim || "").trim(),
    cliente: String(filtros.cliente || "").trim(),
    status: statusNormalizado,
    situacao_prazo: situacaoPrazo,
  };
}

function filtrosPedidosIguais(a, b) {
  return Object.keys(FILTROS_PEDIDOS_VAZIOS).every((chave) => a[chave] === b[chave]);
}

function temFiltrosPedidos(filtros) {
  return Object.keys(FILTROS_PEDIDOS_VAZIOS).some((chave) => Boolean(filtros[chave]));
}

function descreverFiltros(filtros) {
  const ativos = [];
  if (filtros.data_ini || filtros.data_fim) {
    let valor;
    if (filtros.data_ini && filtros.data_fim) {
      valor = `${fmtDataIso(filtros.data_ini)} a ${fmtDataIso(filtros.data_fim)}`;
    } else if (filtros.data_ini) {
      valor = `desde ${fmtDataIso(filtros.data_ini)}`;
    } else {
      valor = `até ${fmtDataIso(filtros.data_fim)}`;
    }
    ativos.push({ chave: "periodo", rotulo: `Digitação: ${valor}` });
  }
  if (filtros.cliente) {
    ativos.push({ chave: "cliente", rotulo: `Cliente: ${filtros.cliente}` });
  }
  return ativos;
}
function FiltrosPedidos({
  filtros,
  rascunho,
  carregando = false,
  onRascunhoChange,
  onAplicar,
  onLimparTodos,
  onRemoverFiltro
}) {
  const normalizado = normalizarFiltrosPedidos(rascunho);
  const alterado = !filtrosPedidosIguais(rascunho, filtros);
  const erroPeriodo = rascunho.data_ini && rascunho.data_fim && rascunho.data_ini > rascunho.data_fim ? "A data inicial não pode ser posterior à data final." : "";
  const filtrosAtivos = descreverFiltros(filtros);
  const haAlgoParaLimpar = temFiltrosPedidos(filtros) || temFiltrosPedidos(rascunho);
  function alterar(campo, valor) {
    onRascunhoChange({ ...rascunho, [campo]: valor });
  }
  function aplicar(event) {
    event.preventDefault();
    if (erroPeriodo || !alterado) return;
    onAplicar(normalizado);
  }
  return /* @__PURE__ */ jsxs("div", { className: "filtros-barra", children: [
    /* @__PURE__ */ jsxs(
      "form",
      {
        className: "filtros-linha",
        onSubmit: aplicar,
        noValidate: true,
        role: "search",
        "aria-label": "Refinar pedidos por cliente e período de digitação",
        children: [
          /* @__PURE__ */ jsxs("label", { className: "filtro-campo filtro-cliente", htmlFor: "filtro-cliente", children: [
            "Cliente",
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "filtro-cliente",
                type: "search",
                value: rascunho.cliente,
                placeholder: "Nome ou parte do nome",
                autoComplete: "off",
                onChange: (event) => alterar("cliente", event.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "filtro-campo", htmlFor: "filtro-data-inicial", children: [
            "Digitação de",
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "filtro-data-inicial",
                type: "date",
                value: rascunho.data_ini,
                max: rascunho.data_fim || void 0,
                "aria-invalid": Boolean(erroPeriodo),
                "aria-describedby": erroPeriodo ? "filtro-periodo-erro" : void 0,
                onChange: (event) => alterar("data_ini", event.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "filtro-campo", htmlFor: "filtro-data-final", children: [
            "até",
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "filtro-data-final",
                type: "date",
                value: rascunho.data_fim,
                min: rascunho.data_ini || void 0,
                "aria-invalid": Boolean(erroPeriodo),
                "aria-describedby": erroPeriodo ? "filtro-periodo-erro" : void 0,
                onChange: (event) => alterar("data_fim", event.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "filtros-acoes", children: [
            /* @__PURE__ */ jsx("button", { type: "submit", className: "btn", disabled: !alterado || Boolean(erroPeriodo), children: "Aplicar" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                className: "btn-ghost",
                disabled: !haAlgoParaLimpar,
                onClick: onLimparTodos,
                children: "Limpar filtros"
              }
            )
          ] })
        ]
      }
    ),
    erroPeriodo && /* @__PURE__ */ jsx("div", { className: "filtros-erro", id: "filtro-periodo-erro", role: "alert", children: erroPeriodo }),
    (filtrosAtivos.length > 0 || alterado) && /* @__PURE__ */ jsxs("div", { className: "filtros-rodape", children: [
      /* @__PURE__ */ jsx("div", { className: "filtros-chips", children: filtrosAtivos.map((filtro) => /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: "filtro-chip",
          "aria-label": `Remover filtro ${filtro.rotulo}`,
          onClick: () => onRemoverFiltro(filtro.chave),
          children: [
            /* @__PURE__ */ jsx("span", { children: filtro.rotulo }),
            /* @__PURE__ */ jsx("span", { className: "filtro-chip-remover", "aria-hidden": "true", children: "×" })
          ]
        },
        filtro.chave
      )) }),
      /* @__PURE__ */ jsx(
        "span",
        {
          className: `filtros-estado ${alterado ? "pendente" : ""}`,
          role: "status",
          "aria-live": "polite",
          children: alterado ? "Alterações ainda não aplicadas" : carregando ? "Atualizando resultados…" : ""
        }
      )
    ] })
  ] });
}

// Preferências de visualização (densidade, colunas visíveis, linhas por página)
// são escolhas do operador, não estado de domínio: ficam no navegador para que
// recarregar a página não jogue a tabela de volta no padrão.
function usePreferencia(chave, valorInicial) {
  const [valor, setValor] = useState(() => {
    try {
      const bruto = window.localStorage.getItem(chave);
      if (bruto == null) return valorInicial;
      return JSON.parse(bruto);
    } catch {
      return valorInicial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // Navegação privada ou quota cheia: a preferência apenas não persiste.
    }
  }, [chave, valor]);

  return [valor, setValor];
}

function SeletorColunas({ colunas, visiveis, onChange, onRestaurar }) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef(null);
  const gatilhoRef = useRef(null);
  const opcionais = colunas.filter((coluna) => !coluna.fixa);
  const totalVisiveis = colunas.filter(
    (coluna) => coluna.fixa || visiveis.includes(coluna.key)
  ).length;
  useEffect(() => {
    if (!aberto) return void 0;
    function aoClicarFora(evento) {
      if (!containerRef.current?.contains(evento.target)) setAberto(false);
    }
    function aoTeclar(evento) {
      if (evento.key !== "Escape") return;
      evento.stopPropagation();
      setAberto(false);
      gatilhoRef.current?.focus();
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);
  function alternar(chave) {
    onChange(
      visiveis.includes(chave) ? visiveis.filter((item) => item !== chave) : [...visiveis, chave]
    );
  }
  return /* @__PURE__ */ jsxs("div", { className: "popover-wrap", ref: containerRef, children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        ref: gatilhoRef,
        className: `btn-sec btn-compacto ${aberto ? "ativo" : ""}`,
        "aria-expanded": aberto,
        "aria-haspopup": "true",
        onClick: () => setAberto((valor) => !valor),
        children: [
          "Colunas ",
          /* @__PURE__ */ jsx("span", { className: "btn-contador", children: totalVisiveis })
        ]
      }
    ),
    aberto && /* @__PURE__ */ jsxs("div", { className: "popover", role: "group", "aria-label": "Colunas visíveis", children: [
      /* @__PURE__ */ jsxs("div", { className: "popover-head", children: [
        /* @__PURE__ */ jsx("span", { children: "Colunas visíveis" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: "btn-link", onClick: onRestaurar, children: "Restaurar padrão" })
      ] }),
      /* @__PURE__ */ jsxs("ul", { className: "popover-lista", children: [
        colunas.filter((coluna) => coluna.fixa).map((coluna) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs("label", { className: "popover-opcao fixa", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: true, disabled: true, readOnly: true }),
          /* @__PURE__ */ jsx("span", { children: coluna.label }),
          /* @__PURE__ */ jsx("small", { children: "sempre" })
        ] }) }, coluna.key)),
        opcionais.map((coluna) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs("label", { className: "popover-opcao", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              checked: visiveis.includes(coluna.key),
              onChange: () => alternar(coluna.key)
            }
          ),
          /* @__PURE__ */ jsx("span", { children: coluna.label })
        ] }) }, coluna.key))
      ] })
    ] })
  ] });
}

const ACAO_ETAPA$1 = {
  pcp: "Confirmar PCP",
  producao: "Confirmar produção",
  comercial: "Agendar inspeção",
  lem: "Confirmar inspeção",
  faturamento: "Aguardando faturamento",
  estoque: "Aguardando embarque",
  entrega: "Confirmar entrega"
};
function acaoDaLinha(it) {
  const etapa = it.processo?.etapa_atual;
  if (!etapa || etapa === "concluido") return { label: "Editar", tipo: "entrega" };
  if (etapa === "entrega") return { label: "Confirmar entrega", tipo: "entrega" };
  if (etapa === "faturamento" || etapa === "estoque") {
    return {
      label: etapa === "faturamento" ? "Aguarda faturamento" : "Aguarda embarque",
      tipo: "etapa",
      bloqueada: true
    };
  }
  if (etapa === "lem" && it.processo?.lem_aguardando_inicio) {
    return {
      label: `Aguarda ${it.processo.inspecao_agendada_data}`,
      tipo: "etapa",
      bloqueada: true
    };
  }
  return { label: ACAO_ETAPA$1[etapa] || "Confirmar etapa", tipo: "etapa" };
}
const COLUNAS = [
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
  { key: "motivo", label: "Motivo" }
];
const COLUNAS_PADRAO = COLUNAS.filter((c) => c.padrao).map((c) => c.key);
function StatusBadge({ status }) {
  const map = {
    otif: { txt: "OTIF", cls: "badge-ok" },
    falha: { txt: "Falha", cls: "badge-fail" },
    pendente: { txt: "Pendente", cls: "badge-pend" },
    sem_contract_date: { txt: "Sem Contract Date", cls: "badge-missing" }
  };
  const s = map[status] || map.pendente;
  return /* @__PURE__ */ jsx("span", { className: `badge ${s.cls}`, children: s.txt });
}
function PrazoCell({ it }) {
  const contractDate = it.contract_date || it.prazo_entrega;
  if (!contractDate) return /* @__PURE__ */ jsx("span", { className: "prazo-ausente", children: "Não informado" });
  let contagem = null;
  let classeContagem = "prazo-neutro";
  if (it.status === "pendente" && it.dias_restantes != null) {
    const dias = it.dias_restantes;
    classeContagem = it.situacao_prazo === "vencido" ? "prazo-vencido" : it.situacao_prazo === "atencao" ? "prazo-atencao" : "prazo-ok";
    if (dias < 0) contagem = `vencido há ${Math.abs(dias)}d`;
    else if (dias === 0) contagem = "vence hoje";
    else contagem = `faltam ${dias}d`;
  }
  return /* @__PURE__ */ jsxs("span", { className: "prazo-cell", title: `Contract Date: ${contractDate}`, children: [
    /* @__PURE__ */ jsx("span", { className: "prazo-data", children: contractDate }),
    contagem && /* @__PURE__ */ jsx("span", { className: `prazo-contagem ${classeContagem}`, children: contagem })
  ] });
}
function EtapaCell({ it }) {
  const processo = it.processo;
  if (!processo) return /* @__PURE__ */ jsx("span", { className: "prazo-neutro", children: "-" });
  const classe = processo.concluido ? "etapa-tag etapa-done" : "etapa-tag";
  let detalhe = null;
  const ultimaNegativaAberta = processo.negativas_producao?.find(
    (negativa) => !negativa.resolvida_em
  );
  if (processo.etapa_atual === "pcp" && ultimaNegativaAberta) {
    const quantidade = processo.negativas_abertas || 1;
    detalhe = `${quantidade} ${quantidade === 1 ? "negativa" : "negativas"} · previsão ${ultimaNegativaAberta.data_prevista}`;
  } else if (processo.etapa_atual === "faturamento") {
    detalhe = "aguardando data/hora do ERP";
  } else if (processo.etapa_atual === "estoque") {
    const dias = processo.dias_na_etapa_atual ?? 0;
    detalhe = dias > 0 ? `${dias}d em estoque · aguarda embarque` : "aguarda embarque ERP";
  } else if (processo.etapa_atual === "lem") {
    if (processo.lem_aguardando_inicio) {
      detalhe = `aguarda ${processo.inicio_lem_data} · ${processo.dias_ate_inicio_lem ?? 0}d`;
    } else {
      detalhe = `${processo.dias_na_etapa_atual ?? 0}d no LEM`;
    }
  } else if (processo.inspecao_agendada_data) {
    detalhe = `inspeção ${processo.inspecao_agendada_data}`;
  }
  return /* @__PURE__ */ jsxs("span", { className: "etapa-cell-wrap", children: [
    /* @__PURE__ */ jsx("span", { className: classe, children: processo.etapa_atual_nome }),
    detalhe && /* @__PURE__ */ jsx("span", { className: "etapa-agendamento", children: detalhe })
  ] });
}
function QtdCell({ pedida, faturada }) {
  const p = Number(pedida) || 0;
  const f = Number(faturada) || 0;
  const pct = p > 0 ? Math.min(100, f / p * 100) : 0;
  const full = p > 0 && f >= p;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "qtd", children: [
      f,
      " de ",
      p
    ] }),
    /* @__PURE__ */ jsx("div", { className: `qtd-bar ${full ? "full" : ""}`, children: /* @__PURE__ */ jsx("span", { style: { width: `${pct}%` } }) })
  ] });
}
function AtrasoCell({ it }) {
  if (it.dias_atraso == null) return "-";
  if (it.dias_atraso > 0) {
    return /* @__PURE__ */ jsxs("span", { className: "atraso", children: [
      "+",
      it.dias_atraso,
      "d",
      it.origem_atraso ? ` (${it.origem_atraso})` : ""
    ] });
  }
  return /* @__PURE__ */ jsx("span", { className: "prazo-neutro", children: "no prazo" });
}
function PedidoCell({ it, selecionado, onDetalhe }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        className: "ped-num ped-link",
        "aria-label": `Ver detalhes do pedido ${it.numero}, cliente ${it.cliente}`,
        "aria-haspopup": "dialog",
        "aria-expanded": selecionado,
        "aria-controls": "pedido-drawer",
        onClick: (event) => {
          event.stopPropagation();
          onDetalhe?.(it);
        },
        children: it.numero
      }
    ),
    it.erp_id != null && /* @__PURE__ */ jsxs("div", { className: "ped-interno", children: [
      "ID ERP ",
      it.erp_id
    ] }),
    it.numero_interno && /* @__PURE__ */ jsxs("div", { className: "ped-interno", children: [
      "interno ",
      it.numero_interno
    ] })
  ] });
}
const CELULA = {
  status: (it) => /* @__PURE__ */ jsx(StatusBadge, { status: it.status }),
  pedido: (it, ctx) => /* @__PURE__ */ jsx(PedidoCell, { it, selecionado: ctx.selecionado, onDetalhe: ctx.onDetalhe }),
  // Razão social longa é a regra, não a exceção: trunca na célula e mantém o
  // nome completo acessível no title.
  cliente: (it) => /* @__PURE__ */ jsx("span", { title: it.cliente, children: it.cliente }),
  etapa: (it) => /* @__PURE__ */ jsx(EtapaCell, { it }),
  prazo: (it) => /* @__PURE__ */ jsx(PrazoCell, { it }),
  qtd: (it) => /* @__PURE__ */ jsx(QtdCell, { pedida: it.qtd_pedida_total, faturada: it.qtd_faturada_total }),
  atraso: (it) => /* @__PURE__ */ jsx(AtrasoCell, { it }),
  itens: (it) => it.qtd_itens,
  solicitada: (it) => it.data_solicitada,
  faturamento: (it) => fmtDataHoraCurta(it.faturamento_em || it.processo?.faturamento_em),
  nota_fiscal: (it) => formatarNotaFiscal(it.nota_fiscal_numero, it.nota_fiscal_serie),
  embarque: (it) => fmtDataHoraCurta(it.embarque_em || it.processo?.embarque_em),
  entrega: (it) => it.data_entrega_real || "-",
  motivo: (it) => it.motivo_falha ? motivoLabel(it.motivo_falha) : "-"
};
function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}
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
    "Motivo"
  ];
  const corpo = linhas.map(
    (it) => [
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
      it.motivo_falha ? motivoLabel(it.motivo_falha) : ""
    ].map(csvEscape).join(";")
  );
  const conteudo = "\uFEFF" + [cabecalho.map(csvEscape).join(";"), ...corpo].join("\r\n");
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `otif-pedidos-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
function ItensTable({
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
  onDetalhe
}) {
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
  const totalColunas = colunas.length + 1;
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
  return /* @__PURE__ */ jsxs("section", { className: "panel panel-tabela", "aria-busy": carregando, "aria-labelledby": "pedidos-tabela-titulo", children: [
    /* @__PURE__ */ jsx("h3", { id: "pedidos-tabela-titulo", className: "sr-only", children: "Lista de pedidos" }),
    /* @__PURE__ */ jsxs("div", { className: "tabela-toolbar", children: [
      /* @__PURE__ */ jsx("span", { className: "tabela-contagem", "aria-live": "polite", children: carregando && itens.length === 0 ? "carregando…" : `${fmtInteiro(totalItens)} ${totalItens === 1 ? "pedido" : "pedidos"}` }),
      /* @__PURE__ */ jsx("div", { className: "toolbar-spacer" }),
      /* @__PURE__ */ jsxs("div", { className: "densidade-toggle", role: "group", "aria-label": "Densidade da tabela", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: densidade === "compacta" ? "ativo" : "",
            "aria-pressed": densidade === "compacta",
            onClick: () => setDensidade("compacta"),
            children: "Compacta"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: densidade === "confortavel" ? "ativo" : "",
            "aria-pressed": densidade === "confortavel",
            onClick: () => setDensidade("confortavel"),
            children: "Confortável"
          }
        )
      ] }),
      /* @__PURE__ */ jsx(
        SeletorColunas,
        {
          colunas: COLUNAS,
          visiveis: colunasVisiveis,
          onChange: setColunasVisiveis,
          onRestaurar: () => setColunasVisiveis(COLUNAS_PADRAO)
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: "btn-sec btn-compacto",
          onClick: exportar,
          disabled: totalItens === 0 || exportando,
          children: exportando ? "Exportando…" : "Exportar CSV"
        }
      )
    ] }),
    erroExportacao && /* @__PURE__ */ jsx("div", { className: "exportacao-erro", role: "alert", children: erroExportacao }),
    /* @__PURE__ */ jsx("div", { className: "tabela-wrap", children: /* @__PURE__ */ jsxs(
      "table",
      {
        className: `tabela ${densidade === "compacta" ? "compacta" : ""}`,
        "aria-labelledby": "pedidos-tabela-titulo",
        children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            colunas.map((c) => {
              const ativo = c.key === ordenacao.sort;
              return /* @__PURE__ */ jsx(
                "th",
                {
                  className: `sortable ${c.num ? "num" : ""}`,
                  "aria-sort": ativo ? ordenacao.order === "asc" ? "ascending" : "descending" : "none",
                  children: /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      className: "th-sort-button",
                      onClick: () => onOrdenar?.(c.key),
                      "aria-label": `Ordenar por ${c.label}${ativo ? ordenacao.order === "asc" ? ", ordem crescente" : ", ordem decrescente" : ""}`,
                      children: /* @__PURE__ */ jsxs("span", { className: "th-inner", children: [
                        c.label,
                        ativo && /* @__PURE__ */ jsx("span", { className: "sort-ind", "aria-hidden": "true", children: ordenacao.order === "asc" ? "▲" : "▼" })
                      ] })
                    }
                  )
                },
                c.key
              );
            }),
            /* @__PURE__ */ jsx("th", { className: "col-acoes", children: /* @__PURE__ */ jsx("span", { className: "th-estatico", children: "Ação" }) })
          ] }) }),
          /* @__PURE__ */ jsxs("tbody", { children: [
            carregando && itens.length === 0 && Array.from({ length: 8 }).map((_, i) => /* @__PURE__ */ jsx("tr", { children: Array.from({ length: totalColunas }).map((__, j) => /* @__PURE__ */ jsx("td", { className: j === totalColunas - 1 ? "col-acoes" : "", children: /* @__PURE__ */ jsx("div", { className: "skeleton sk-line", style: { marginBottom: 0 } }) }, j)) }, `sk-${i}`)),
            vazio && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsxs("td", { className: "tabela-vazio", colSpan: totalColunas, children: [
              /* @__PURE__ */ jsx("strong", { children: "Nenhum pedido neste recorte." }),
              /* @__PURE__ */ jsx("span", { children: "Troque a situação na barra acima ou amplie o período de digitação." })
            ] }) }),
            itens.map((it) => {
              const selecionado = it.pedido_id === pedidoSelecionadoId;
              const acao = acaoDaLinha(it);
              const handler = acao.tipo === "etapa" ? onConfirmarEtapa : onConfirmar;
              const ctx = { selecionado, onDetalhe };
              return /* @__PURE__ */ jsxs(
                "tr",
                {
                  className: `clicavel ${selecionado ? "selecionada" : ""}`,
                  onClick: () => onDetalhe?.(it),
                  children: [
                    colunas.map((c) => /* @__PURE__ */ jsx("td", { className: c.num ? "num" : c.key === "cliente" ? "cliente" : "", children: CELULA[c.key](it, ctx) }, c.key)),
                    /* @__PURE__ */ jsx("td", { className: "col-acoes", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        className: "btn-sec btn-acao",
                        onClick: () => handler?.(it),
                        disabled: acao.bloqueada,
                        title: acao.bloqueada ? it.processo?.etapa_atual === "faturamento" ? "O faturamento virá na próxima atualização direta do JUND." : it.processo?.etapa_atual === "estoque" ? "O embarque virá na próxima atualização direta do JUND." : "O LEM ainda aguarda seus pré-requisitos." : void 0,
                        children: acao.label
                      }
                    ) })
                  ]
                },
                it.pedido_id
              );
            })
          ] })
        ]
      }
    ) }),
    totalItens > 0 && /* @__PURE__ */ jsxs("div", { className: "pager", children: [
      /* @__PURE__ */ jsxs("label", { children: [
        "Linhas por página",
        " ",
        /* @__PURE__ */ jsxs("select", { value: pageSize, onChange: (e) => onPageSize?.(Number(e.target.value)), children: [
          /* @__PURE__ */ jsx("option", { value: 25, children: "25" }),
          /* @__PURE__ */ jsx("option", { value: 50, children: "50" }),
          /* @__PURE__ */ jsx("option", { value: 100, children: "100" }),
          /* @__PURE__ */ jsx("option", { value: 200, children: "200" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "pager-info", children: [
        fmtInteiro(inicio + 1),
        "–",
        fmtInteiro(Math.min(inicio + pageSize, totalItens)),
        " de",
        " ",
        fmtInteiro(totalItens)
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "pager-btns", children: [
        /* @__PURE__ */ jsx("button", { onClick: () => onPage?.(Math.max(1, page - 1)), disabled: page <= 1, children: "Anterior" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => onPage?.(Math.min(totalPaginas, page + 1)),
            disabled: page >= totalPaginas,
            children: "Próxima"
          }
        )
      ] })
    ] })
  ] });
}

function Pedidos({
  filtros,
  filtrosRascunho,
  onFiltrosRascunho,
  onAplicarFiltros,
  onAplicarSegmento,
  onLimparFiltros,
  onRemoverFiltro,
  itens,
  carregando,
  ordenacao,
  onOrdenar,
  page,
  pageSize,
  totalItens,
  totalPaginas,
  onPage,
  onPageSize,
  onExportCsv,
  onConfirmar,
  onConfirmarEtapa,
  pedidoSelecionadoId,
  onDetalhe
}) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("section", { className: "pedidos-controles", "aria-label": "Filtros de pedidos", children: [
      /* @__PURE__ */ jsx(SegmentosPedidos, { filtros, onSelecionar: onAplicarSegmento }),
      /* @__PURE__ */ jsx(
        FiltrosPedidos,
        {
          filtros,
          rascunho: filtrosRascunho,
          carregando,
          onRascunhoChange: onFiltrosRascunho,
          onAplicar: onAplicarFiltros,
          onLimparTodos: onLimparFiltros,
          onRemoverFiltro
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      ItensTable,
      {
        itens,
        carregando,
        ordenacao,
        onOrdenar,
        page,
        pageSize,
        totalItens,
        totalPaginas,
        onPage,
        onPageSize,
        onExportCsv,
        onConfirmar,
        onConfirmarEtapa,
        pedidoSelecionadoId,
        onDetalhe
      }
    )
  ] });
}

let quantidadeLocks = 0;
let overflowAnterior = "";

function useBodyScrollLock() {
  useEffect(() => {
    if (quantidadeLocks === 0) {
      overflowAnterior = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    quantidadeLocks += 1;

    return () => {
      quantidadeLocks = Math.max(0, quantidadeLocks - 1);
      if (quantidadeLocks === 0) {
        document.body.style.overflow = overflowAnterior;
      }
    };
  }, []);
}

const ACAO_ETAPA = {
  pcp: "Confirmar PCP",
  producao: "Confirmar produção",
  comercial: "Agendar inspeção",
  lem: "Confirmar inspeção",
  faturamento: "Aguardando faturamento",
  estoque: "Aguardando embarque",
  entrega: "Confirmar entrega"
};
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])'
].join(",");
function acaoDoDrawer(pedido) {
  const etapa = pedido.processo?.etapa_atual;
  if (!etapa || etapa === "concluido") {
    return {
      label: pedido.confirmacao ? "Editar confirmação" : "Confirmar entrega",
      tipo: "entrega"
    };
  }
  if (etapa === "entrega") return { label: "Confirmar entrega", tipo: "entrega" };
  if (etapa === "faturamento" || etapa === "estoque") {
    return {
      label: etapa === "faturamento" ? "Aguardando faturamento no ERP" : "Aguardando embarque no ERP",
      tipo: "etapa",
      bloqueada: true
    };
  }
  if (etapa === "lem" && pedido.processo?.lem_aguardando_inicio) {
    return {
      label: `Aguardando ${pedido.processo.inspecao_agendada_data}`,
      tipo: "etapa",
      bloqueada: true
    };
  }
  return { label: ACAO_ETAPA[etapa] || "Confirmar etapa", tipo: "etapa" };
}
function podeAgendarAntecipado(pedido) {
  const processo = pedido.processo;
  return Boolean(
    processo && !processo.concluido && processo.etapa_atual !== "comercial" && !processo.inspecao_agendada_data && !processo.lem_data
  );
}
function Flag({ estado, label }) {
  if (estado == null) return /* @__PURE__ */ jsxs("span", { className: "flag flag-neutro", children: [
    label,
    ": —"
  ] });
  return /* @__PURE__ */ jsxs("span", { className: `flag ${estado ? "flag-ok" : "flag-bad"}`, children: [
    estado ? "✓" : "✗",
    " ",
    label
  ] });
}
function StatusFlag({ status }) {
  const map = {
    otif: { txt: "OTIF", cls: "flag-ok" },
    falha: { txt: "Falha", cls: "flag-bad" },
    pendente: { txt: "Pendente", cls: "flag-neutro" },
    sem_contract_date: { txt: "Sem Contract Date", cls: "flag-missing" }
  };
  const atual = map[status] || map.pendente;
  return /* @__PURE__ */ jsx("span", { className: `flag ${atual.cls}`, children: atual.txt });
}
function textoPrazo(pedido) {
  if (pedido.status !== "pendente" || pedido.dias_restantes == null) return null;
  const dias = pedido.dias_restantes;
  if (dias < 0) return `Vencido há ${Math.abs(dias)}d`;
  if (dias === 0) return "Vence hoje";
  return `Faltam ${dias}d`;
}
function tomPrazo(pedido) {
  if (!pedido.contract_date && !pedido.prazo_entrega) return "perigo";
  if (pedido.status !== "pendente") return "neutro";
  if (pedido.dias_restantes < 0 || pedido.situacao_prazo === "vencido") return "perigo";
  if (pedido.situacao_prazo === "atencao") return "atencao";
  return "ok";
}
function textoTempoEtapa(processo) {
  if (!processo || processo.concluido) return null;
  if (processo.etapa_atual === "faturamento") {
    const dias = processo.dias_na_etapa_atual ?? 0;
    return dias > 0 ? `Aguardando faturamento no ERP · há ${dias}d` : "Aguardando faturamento no ERP";
  }
  if (processo.etapa_atual === "estoque") {
    const dias = processo.dias_na_etapa_atual ?? 0;
    return dias > 0 ? `${dias}d em Estoque · aguardando embarque no ERP` : "Em Estoque · aguardando embarque no ERP";
  }
  if (processo.etapa_atual === "lem") {
    if (processo.lem_aguardando_inicio) {
      const dias2 = processo.dias_ate_inicio_lem;
      return `Aguardando até ${processo.inicio_lem_data}${dias2 != null ? ` · faltam ${dias2}d` : ""}`;
    }
    const dias = processo.dias_na_etapa_atual ?? 0;
    return dias === 0 ? "Inspeção inicia hoje · 0d parada" : `${dias}d parada no LEM`;
  }
  return processo.dias_na_etapa_atual > 0 ? `Há ${processo.dias_na_etapa_atual}d nesta etapa` : "Aguardando atualização";
}
function ProcessoTimeline({ processo }) {
  if (!processo) return /* @__PURE__ */ jsx("p", { className: "vazio", children: "Sem dados de processo." });
  const { etapas = [], etapa_atual, gargalo } = processo;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "proc-resumo", children: [
      /* @__PURE__ */ jsxs("span", { children: [
        "Etapa atual: ",
        /* @__PURE__ */ jsx("b", { children: processo.etapa_atual_nome || "-" }),
        textoTempoEtapa(processo) && ` · ${textoTempoEtapa(processo)}`
      ] }),
      processo.lead_time_dias != null && /* @__PURE__ */ jsxs("span", { children: [
        "Lead time: ",
        /* @__PURE__ */ jsxs("b", { children: [
          processo.lead_time_dias,
          "d"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("ol", { className: "timeline", children: etapas.map((etapa) => {
      const atual = etapa.chave === etapa_atual;
      const aguardandoInicio = atual && etapa.chave === "lem" && processo.lem_aguardando_inicio;
      const aguardandoFaturamento = atual && etapa.chave === "faturamento";
      const aguardandoEmbarque = atual && etapa.chave === "estoque";
      const classe = etapa.concluida ? "tl-done" : atual ? "tl-current" : "tl-todo";
      const ehGargalo = etapa.chave === gargalo && etapa.dias != null;
      return /* @__PURE__ */ jsxs("li", { className: `tl-item ${classe}`, children: [
        /* @__PURE__ */ jsx("span", { className: "tl-dot", "aria-hidden": "true", children: etapa.concluida ? "✓" : atual ? "●" : "○" }),
        /* @__PURE__ */ jsxs("div", { className: "tl-body", children: [
          /* @__PURE__ */ jsxs("div", { className: "tl-linha", children: [
            /* @__PURE__ */ jsx("span", { className: "tl-nome", children: etapa.nome }),
            etapa.dias != null && /* @__PURE__ */ jsxs("span", { className: `tl-dias ${ehGargalo ? "tl-gargalo" : ""}`, children: [
              etapa.dias,
              "d",
              ehGargalo ? " · gargalo" : ""
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "tl-data", children: etapa.chave === "estoque" && etapa.data_hora ? `Faturamento até embarque em ${fmtDataHora(etapa.data_hora)}` : etapa.chave === "expedicao" && etapa.data_hora ? `Automática · embarque em ${fmtDataHora(etapa.data_hora)}` : etapa.data_hora ? fmtDataHora(etapa.data_hora) : etapa.data ? etapa.data : aguardandoFaturamento ? "aguardando data/hora do ERP" : aguardandoEmbarque ? "em estoque · aguardando embarque no ERP" : aguardandoInicio ? "aguardando a data agendada" : atual ? "em andamento" : "—" }),
          etapa.data_agendada && /* @__PURE__ */ jsxs("div", { className: "tl-agendamento", children: [
            "Inspeção agendada: ",
            etapa.data_agendada
          ] }),
          etapa.obs && /* @__PURE__ */ jsx("div", { className: "tl-obs", children: etapa.obs })
        ] })
      ] }, etapa.chave);
    }) })
  ] });
}
function ResumoOperacional({ pedido, itens }) {
  const processo = pedido.processo;
  const prazo = textoPrazo(pedido);
  const contractDate = pedido.contract_date || pedido.prazo_entrega;
  const diasAtraso = Number(pedido.dias_atraso) || 0;
  const leadTime = processo?.lead_time_dias;
  const totalItens = pedido.qtd_itens ?? itens.length;
  return /* @__PURE__ */ jsxs("section", { className: "drawer-section drawer-overview", "aria-labelledby": "resumo-operacional", children: [
    /* @__PURE__ */ jsx("h3", { className: "drawer-section-titulo", id: "resumo-operacional", children: "Resumo operacional" }),
    /* @__PURE__ */ jsxs("div", { className: "flags", children: [
      /* @__PURE__ */ jsx(StatusFlag, { status: pedido.status }),
      /* @__PURE__ */ jsx(Flag, { estado: pedido.on_time, label: "On Time" }),
      /* @__PURE__ */ jsx(Flag, { estado: pedido.in_full, label: "In Full" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "drawer-overview-grid", children: [
      /* @__PURE__ */ jsxs("div", { className: `drawer-overview-card tom-${tomPrazo(pedido)}`, children: [
        /* @__PURE__ */ jsx("span", { className: "drawer-overview-label", children: "Contract Date" }),
        /* @__PURE__ */ jsx("strong", { children: contractDate || "Não informado" }),
        /* @__PURE__ */ jsx("small", { children: contractDate ? prazo || "Prazo oficial informado no JUND" : "Corrija a data de entrega no pedido do JUND" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "drawer-overview-card", children: [
        /* @__PURE__ */ jsx("span", { className: "drawer-overview-label", children: "Etapa atual" }),
        /* @__PURE__ */ jsx("strong", { children: processo?.etapa_atual_nome || "Sem informação" }),
        /* @__PURE__ */ jsx("small", { children: processo?.concluido ? "Processo concluído" : textoTempoEtapa(processo) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "drawer-overview-card", children: [
        /* @__PURE__ */ jsx("span", { className: "drawer-overview-label", children: "Faturado / pedido" }),
        /* @__PURE__ */ jsxs("strong", { children: [
          pedido.qtd_faturada_total ?? 0,
          " / ",
          pedido.qtd_pedida_total ?? 0
        ] }),
        /* @__PURE__ */ jsxs("small", { children: [
          totalItens,
          " ",
          totalItens === 1 ? "item" : "itens"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: `drawer-overview-card ${diasAtraso > 0 ? "tom-perigo" : ""}`, children: [
        /* @__PURE__ */ jsx("span", { className: "drawer-overview-label", children: diasAtraso > 0 ? "Atraso" : "Lead time" }),
        /* @__PURE__ */ jsx("strong", { children: diasAtraso > 0 ? `+${diasAtraso}d` : leadTime != null ? `${leadTime}d` : "-" }),
        /* @__PURE__ */ jsx("small", { children: diasAtraso > 0 ? pedido.origem_atraso || "Origem não informada" : leadTime != null ? "Tempo total do processo" : "Ainda não calculado" })
      ] })
    ] })
  ] });
}
function ItemDrawer({
  item,
  suspenso = false,
  onClose,
  onConfirmar,
  onConfirmarEtapa,
  onNegarProducao,
  onEtapa
}) {
  const painelRef = useRef(null);
  const focoAnteriorRef = useRef(null);
  const ultimoFocoRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useBodyScrollLock();
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    focoAnteriorRef.current = document.activeElement;
    return () => {
      const focoAnterior = focoAnteriorRef.current;
      if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected) {
        requestAnimationFrame(() => focoAnterior.focus());
      }
    };
  }, []);
  useEffect(() => {
    const painel = painelRef.current;
    if (!painel) return void 0;
    if (suspenso) {
      painel.setAttribute("inert", "");
      return () => painel.removeAttribute("inert");
    }
    painel.removeAttribute("inert");
    const frame = requestAnimationFrame(() => {
      const alvo = ultimoFocoRef.current;
      if (alvo instanceof HTMLElement && painel.contains(alvo)) alvo.focus();
      else painel.focus();
    });
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focaveis = Array.from(painel.querySelectorAll(FOCUSABLE)).filter(
        (elemento) => elemento.getClientRects().length > 0
      );
      if (focaveis.length === 0) {
        event.preventDefault();
        painel.focus();
        return;
      }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (event.shiftKey && (document.activeElement === primeiro || !painel.contains(document.activeElement))) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [suspenso]);
  const pedido = item;
  const confirmacao = pedido.confirmacao;
  const prazo = textoPrazo(pedido);
  const itens = pedido.itens || [];
  const diasAtraso = Number(pedido.dias_atraso) || 0;
  const acao = acaoDoDrawer(pedido);
  const handlerAcao = acao.tipo === "etapa" ? onConfirmarEtapa : onConfirmar;
  const agendamentoParalelo = podeAgendarAntecipado(pedido);
  const podeNegarProducao = pedido.processo?.etapa_atual === "pcp";
  const negativasProducao = pedido.processo?.negativas_producao || [];
  const ultimaNegativaAberta = negativasProducao.find(
    (negativa) => !negativa.resolvida_em
  );
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "drawer-overlay",
      onMouseDown: (event) => {
        if (event.target === event.currentTarget && !suspenso) onClose();
      },
      children: /* @__PURE__ */ jsxs(
        "aside",
        {
          id: "pedido-drawer",
          className: "drawer",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "pedido-drawer-titulo",
          tabIndex: -1,
          ref: painelRef,
          onFocusCapture: (event) => {
            ultimoFocoRef.current = event.target;
          },
          children: [
            /* @__PURE__ */ jsxs("div", { className: "drawer-head", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("h2", { id: "pedido-drawer-titulo", children: [
                  "Pedido ",
                  pedido.numero
                ] }),
                /* @__PURE__ */ jsx("div", { className: "drawer-sub", children: pedido.cliente }),
                (pedido.erp_id != null || pedido.numero_interno) && /* @__PURE__ */ jsxs("div", { className: "drawer-identificadores", children: [
                  pedido.erp_id != null && /* @__PURE__ */ jsxs("span", { children: [
                    "ID ERP ",
                    pedido.erp_id
                  ] }),
                  pedido.numero_interno && /* @__PURE__ */ jsxs("span", { children: [
                    "Interno ",
                    pedido.numero_interno
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx("button", { className: "drawer-close", onClick: onClose, "aria-label": "Fechar detalhes do pedido", children: "×" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "drawer-body", children: [
              /* @__PURE__ */ jsx(ResumoOperacional, { pedido, itens }),
              ultimaNegativaAberta && /* @__PURE__ */ jsxs("div", { className: "drawer-alerta-pcp", children: [
                /* @__PURE__ */ jsx("strong", { children: "Produção negada pelo PCP" }),
                /* @__PURE__ */ jsx("span", { children: ultimaNegativaAberta.motivo }),
                /* @__PURE__ */ jsxs("span", { children: [
                  "Nova previsão: ",
                  /* @__PURE__ */ jsx("b", { children: ultimaNegativaAberta.data_prevista })
                ] })
              ] }),
              pedido.status === "sem_contract_date" && /* @__PURE__ */ jsxs("div", { className: "drawer-alerta", children: [
                /* @__PURE__ */ jsx("strong", { children: "Contract Date não informado" }),
                /* @__PURE__ */ jsx("span", { children: "Corrija a data de entrega no pedido do JUND e sincronize novamente. Até lá, este pedido não entra nas taxas de On Time ou OTIF." })
              ] }),
              (diasAtraso > 0 || pedido.motivo_falha) && /* @__PURE__ */ jsxs("div", { className: "drawer-alerta", children: [
                /* @__PURE__ */ jsx("strong", { children: diasAtraso > 0 ? "Pedido com atraso" : "Falha registrada" }),
                /* @__PURE__ */ jsxs("span", { children: [
                  diasAtraso > 0 && `${diasAtraso}d${pedido.origem_atraso ? ` · ${pedido.origem_atraso}` : ""}`,
                  diasAtraso > 0 && pedido.motivo_falha ? " · " : "",
                  pedido.motivo_falha ? motivoLabel(pedido.motivo_falha) : ""
                ] })
              ] }),
              /* @__PURE__ */ jsxs("section", { className: "drawer-section", "aria-labelledby": "datas-pedido", children: [
                /* @__PURE__ */ jsx("h3", { className: "drawer-section-titulo", id: "datas-pedido", children: "Datas principais" }),
                /* @__PURE__ */ jsxs("dl", { className: "kv", children: [
                  /* @__PURE__ */ jsx("dt", { children: "Digitação" }),
                  /* @__PURE__ */ jsx("dd", { children: pedido.data_solicitada || "-" }),
                  /* @__PURE__ */ jsx("dt", { children: "Contract Date" }),
                  /* @__PURE__ */ jsxs("dd", { children: [
                    pedido.contract_date || pedido.prazo_entrega || "Não informado",
                    prazo && ` · ${prazo.toLocaleLowerCase()}`
                  ] }),
                  /* @__PURE__ */ jsx("dt", { children: "Inspeção agendada" }),
                  /* @__PURE__ */ jsx("dd", { children: pedido.processo?.inspecao_agendada_data || "-" }),
                  /* @__PURE__ */ jsx("dt", { children: "Faturamento" }),
                  /* @__PURE__ */ jsx("dd", { children: fmtDataHora(pedido.faturamento_em || pedido.processo?.faturamento_em) }),
                  /* @__PURE__ */ jsx("dt", { children: "Nota fiscal" }),
                  /* @__PURE__ */ jsx("dd", { children: formatarNotaFiscal(pedido.nota_fiscal_numero, pedido.nota_fiscal_serie) }),
                  /* @__PURE__ */ jsx("dt", { children: "Embarque" }),
                  /* @__PURE__ */ jsx("dd", { children: fmtDataHora(pedido.embarque_em || pedido.processo?.embarque_em) }),
                  /* @__PURE__ */ jsx("dt", { children: "Entrega" }),
                  /* @__PURE__ */ jsx("dd", { children: pedido.data_entrega_real || "-" })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("details", { className: "drawer-disclosure", children: [
                /* @__PURE__ */ jsxs("summary", { children: [
                  /* @__PURE__ */ jsx("span", { children: "Itens do pedido" }),
                  /* @__PURE__ */ jsxs("span", { className: "drawer-disclosure-meta", children: [
                    itens.length,
                    " ",
                    itens.length === 1 ? "item" : "itens"
                  ] })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "drawer-disclosure-body", children: itens.length > 0 ? /* @__PURE__ */ jsx("div", { className: "itens-lista", children: itens.map((itemPedido) => {
                  const classeQuantidade = itemPedido.in_full == null ? "neutro" : itemPedido.in_full ? "ok" : "bad";
                  return /* @__PURE__ */ jsxs(
                    "div",
                    {
                      className: "item-linha",
                      children: [
                        /* @__PURE__ */ jsxs("div", { className: "item-info", children: [
                          /* @__PURE__ */ jsx("span", { className: "item-sku", children: itemPedido.sku }),
                          /* @__PURE__ */ jsx("span", { className: "item-desc", children: itemPedido.descricao || "Sem descrição" })
                        ] }),
                        /* @__PURE__ */ jsx("div", { className: "item-qtd", children: /* @__PURE__ */ jsxs("span", { className: `flag-mini ${classeQuantidade}`, children: [
                          /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Faturado / pedido: " }),
                          itemPedido.qtd_faturada,
                          " / ",
                          itemPedido.qtd_pedida
                        ] }) })
                      ]
                    },
                    itemPedido.item_numero ?? `${itemPedido.sku}-${itemPedido.descricao}`
                  );
                }) }) : /* @__PURE__ */ jsx("p", { className: "vazio", children: "Nenhum item informado para este pedido." }) })
              ] }),
              /* @__PURE__ */ jsxs("details", { className: "drawer-disclosure", children: [
                /* @__PURE__ */ jsxs("summary", { children: [
                  /* @__PURE__ */ jsx("span", { children: "Processo interno" }),
                  /* @__PURE__ */ jsx("span", { className: "drawer-disclosure-meta", children: pedido.processo?.etapa_atual_nome || "Sem dados" })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "drawer-disclosure-body", children: [
                  onEtapa && /* @__PURE__ */ jsx("div", { className: "drawer-disclosure-acoes", children: /* @__PURE__ */ jsx("button", { className: "btn-link", onClick: () => onEtapa(pedido), children: "Editar todas as etapas" }) }),
                  /* @__PURE__ */ jsx(ProcessoTimeline, { processo: pedido.processo })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("details", { className: "drawer-disclosure", children: [
                /* @__PURE__ */ jsxs("summary", { children: [
                  /* @__PURE__ */ jsx("span", { children: "Histórico de negativas do PCP" }),
                  /* @__PURE__ */ jsxs("span", { className: "drawer-disclosure-meta", children: [
                    negativasProducao.length,
                    " ",
                    negativasProducao.length === 1 ? "registro" : "registros"
                  ] })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "drawer-disclosure-body", children: negativasProducao.length === 0 ? /* @__PURE__ */ jsx("p", { className: "vazio", children: "Nenhuma negativa de produção registrada." }) : /* @__PURE__ */ jsx("ol", { className: "negativas-historico", children: negativasProducao.map((negativa) => {
                  const aberta = !negativa.resolvida_em;
                  return /* @__PURE__ */ jsxs(
                    "li",
                    {
                      className: `negativa-item ${aberta ? "aberta" : "resolvida"}`,
                      children: [
                        /* @__PURE__ */ jsxs("div", { className: "negativa-head", children: [
                          /* @__PURE__ */ jsx("strong", { children: aberta ? "Negativa aberta" : "Negativa resolvida" }),
                          /* @__PURE__ */ jsx("span", { children: fmtDataHora(negativa.criado_em) })
                        ] }),
                        /* @__PURE__ */ jsx("p", { children: negativa.motivo }),
                        /* @__PURE__ */ jsxs("div", { className: "negativa-meta", children: [
                          /* @__PURE__ */ jsxs("span", { children: [
                            "Previsão: ",
                            /* @__PURE__ */ jsx("b", { children: negativa.data_prevista })
                          ] }),
                          /* @__PURE__ */ jsxs("span", { children: [
                            "Registrada por: ",
                            /* @__PURE__ */ jsx("b", { children: negativa.usuario })
                          ] }),
                          !aberta && /* @__PURE__ */ jsxs("span", { children: [
                            "Resolvida em ",
                            fmtDataHora(negativa.resolvida_em),
                            " por",
                            " ",
                            /* @__PURE__ */ jsx("b", { children: negativa.resolvida_por })
                          ] })
                        ] })
                      ]
                    },
                    negativa.id
                  );
                }) }) })
              ] }),
              /* @__PURE__ */ jsxs("details", { className: "drawer-disclosure", children: [
                /* @__PURE__ */ jsxs("summary", { children: [
                  /* @__PURE__ */ jsx("span", { children: "Confirmação de entrega" }),
                  /* @__PURE__ */ jsx("span", { className: "drawer-disclosure-meta", children: confirmacao ? "Registrada" : "Pendente" })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "drawer-disclosure-body", children: confirmacao ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsxs("dl", { className: "kv", children: [
                    /* @__PURE__ */ jsx("dt", { children: "Entregue em" }),
                    /* @__PURE__ */ jsx("dd", { children: confirmacao.data_entrega_real }),
                    /* @__PURE__ */ jsx("dt", { children: "Recebido completo" }),
                    /* @__PURE__ */ jsx("dd", { children: confirmacao.recebido_completo ? "Sim" : "Não" }),
                    /* @__PURE__ */ jsx("dt", { children: "Registrado por" }),
                    /* @__PURE__ */ jsx("dd", { children: confirmacao.usuario }),
                    /* @__PURE__ */ jsx("dt", { children: "Registrado em" }),
                    /* @__PURE__ */ jsx("dd", { children: fmtDataHora(confirmacao.criado_em) })
                  ] }),
                  confirmacao.observacao && /* @__PURE__ */ jsx("div", { className: "obs-box", children: confirmacao.observacao })
                ] }) : /* @__PURE__ */ jsx("p", { className: "vazio", children: "A entrega ainda não foi confirmada." }) })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "drawer-foot", children: [
              /* @__PURE__ */ jsx("button", { className: "btn-sec", onClick: onClose, children: "Voltar à lista" }),
              podeNegarProducao && onNegarProducao && /* @__PURE__ */ jsx(
                "button",
                {
                  className: "btn-sec-danger",
                  onClick: () => onNegarProducao(pedido),
                  children: "Negar produção"
                }
              ),
              agendamentoParalelo && onConfirmarEtapa && /* @__PURE__ */ jsx(
                "button",
                {
                  className: "btn-sec",
                  onClick: () => onConfirmarEtapa(pedido, "comercial"),
                  children: "Agendar inspeção"
                }
              ),
              handlerAcao && /* @__PURE__ */ jsx(
                "button",
                {
                  className: "btn",
                  onClick: () => handlerAcao(pedido),
                  disabled: acao.bloqueada,
                  title: acao.bloqueada ? pedido.processo?.etapa_atual === "faturamento" ? "Aguardando atualização automática do faturamento pelo ERP." : pedido.processo?.etapa_atual === "estoque" ? "Aguardando atualização automática do embarque pelo ERP." : "A contagem do LEM ainda não começou." : void 0,
                  children: acao.label
                }
              )
            ] })
          ]
        }
      )
    }
  );
}

const BASE = "http://localhost:8000";
globalThis.window = {
  localStorage: {
    getItem: () => null,
    setItem: () => {
    }
  }
};
async function get(caminho) {
  const resposta = await fetch(`${BASE}${caminho}`);
  if (!resposta.ok) throw new Error(`${caminho} -> ${resposta.status}`);
  return resposta.json();
}
function checar(nome, elemento) {
  const html = renderToString(elemento);
  if (!html || html.length < 50) throw new Error(`${nome}: HTML suspeito (${html.length} bytes)`);
  console.log(`OK   ${nome} (${html.length} bytes)`);
  return html;
}
const filtrosVazios = {
  data_ini: "",
  data_fim: "",
  cliente: "",
  status: "",
  situacao_prazo: ""
};
const [metricas, tendencia, clientes, listagem, config] = await Promise.all([
  get("/metrics/otif"),
  get("/metrics/tendencia"),
  get("/metrics/clientes"),
  get("/pedidos?page=1&page_size=25"),
  get("/config")
]);
const htmlVisao = checar(
  "VisaoGeral (com dados)",
  /* @__PURE__ */ jsx(
    VisaoGeral,
    {
      metricas,
      tendencia,
      clientes,
      carregando: false,
      filtros: filtrosVazios,
      meta: config.meta_otif,
      diasAlerta: config.dias_alerta_prazo,
      onPeriodo: () => {
      },
      onRemoverCliente: () => {
      },
      onDrillSituacao: () => {
      },
      onDrillSemContractDate: () => {
      }
    }
  )
);
checar(
  "VisaoGeral (carregando, sem métricas)",
  /* @__PURE__ */ jsx(
    VisaoGeral,
    {
      metricas: null,
      tendencia: [],
      clientes: [],
      carregando: true,
      filtros: filtrosVazios,
      onPeriodo: () => {
      },
      onRemoverCliente: () => {
      },
      onDrillSituacao: () => {
      },
      onDrillSemContractDate: () => {
      }
    }
  )
);
const propsPedidos = {
  filtros: filtrosVazios,
  filtrosRascunho: filtrosVazios,
  onFiltrosRascunho: () => {
  },
  onAplicarFiltros: () => {
  },
  onAplicarSegmento: () => {
  },
  onLimparFiltros: () => {
  },
  onRemoverFiltro: () => {
  },
  itens: listagem.items,
  carregando: false,
  ordenacao: { sort: "prazo", order: "asc" },
  onOrdenar: () => {
  },
  page: 1,
  pageSize: 25,
  totalItens: listagem.total,
  totalPaginas: listagem.total_pages,
  onPage: () => {
  },
  onPageSize: () => {
  },
  onExportCsv: async () => [],
  onConfirmar: () => {
  },
  onConfirmarEtapa: () => {
  },
  pedidoSelecionadoId: listagem.items[0]?.pedido_id ?? null,
  onDetalhe: () => {
  }
};
const htmlPedidos = checar("Pedidos (com linhas)", /* @__PURE__ */ jsx(Pedidos, { ...propsPedidos }));
checar(
  "Pedidos (vazio)",
  /* @__PURE__ */ jsx(Pedidos, { ...propsPedidos, itens: [], totalItens: 0, totalPaginas: 1 })
);
if (listagem.items[0]) {
  checar(
    "ItemDrawer",
    /* @__PURE__ */ jsx(
      ItemDrawer,
      {
        item: listagem.items[0],
        onClose: () => {
        },
        onConfirmar: () => {
        },
        onConfirmarEtapa: () => {
        },
        onNegarProducao: () => {
        },
        onEtapa: () => {
        }
      }
    )
  );
}
const verificacoes = [
  ["barra de segmentos presente", htmlPedidos.includes('class="seg-barra"')],
  ["coluna de ações sticky presente", htmlPedidos.includes('class="col-acoes"')],
  ["densidade compacta é o padrão", htmlPedidos.includes("tabela compacta")],
  ["seletor de colunas presente", htmlPedidos.includes("Colunas")],
  [
    "colunas padrão reduzidas (sem Nota fiscal na visão inicial)",
    !htmlPedidos.includes(">Nota fiscal<")
  ],
  ["recorte de período na Visão geral", htmlVisao.includes('class="recorte"')],
  // O SVG em si é desenhado após medir o container (client-only), então aqui
  // verificamos o container e os eixos; as barras antigas não devem existir.
  ["container do gráfico de linha presente", htmlVisao.includes('class="grafico-plot"')],
  ["eixo de meta ajustado ao domínio", htmlVisao.includes("grafico-y-meta")],
  ["gráfico de barras removido", !htmlVisao.includes("trend-bar")],
  ["tiles de risco são botões", htmlVisao.includes('<button type="button" class="metric')]
];
let falhou = false;
for (const [nome, ok] of verificacoes) {
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}`);
  if (!ok) falhou = true;
}
if (falhou) process.exit(1);
console.log("\nSmoke test concluido sem erros.");
