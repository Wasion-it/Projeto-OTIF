const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const getsEmAndamento = new Map();

function qs(params) {
  const clean = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : "";
}

async function executarReq(url, options) {
  let res;
  try {
    res = await fetch(url, { cache: "no-store", ...options });
  } catch {
    throw new Error(`Não foi possível conectar à API em ${BASE}. O backend está rodando?`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${detail}`.trim());
  }
  if (res.status === 204) return null;

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `A API retornou uma resposta inesperada (não-JSON) em ${url}. ` +
        `Verifique se o backend está rodando e se VITE_API_URL aponta para ele.`
    );
  }
  return res.json();
}

function req(path, options = {}) {
  const url = `${BASE}${path}`;
  const metodo = String(options.method || "GET").toUpperCase();
  const chave = metodo === "GET" && !options.signal ? url : null;

  if (chave && getsEmAndamento.has(chave)) return getsEmAndamento.get(chave);

  const requisicao = executarReq(url, options);
  if (!chave) return requisicao;

  let compartilhada;
  compartilhada = requisicao.finally(() => {
    if (getsEmAndamento.get(chave) === compartilhada) getsEmAndamento.delete(chave);
  });
  getsEmAndamento.set(chave, compartilhada);
  return compartilhada;
}

export const api = {
  health: () => req(`/health`),
  metricas: (filtros) => req(`/metrics/otif${qs(filtros)}`),
  tendencia: (filtros) => req(`/metrics/tendencia${qs(filtros)}`),
  clientes: (filtros) => req(`/metrics/clientes${qs(filtros)}`),
  pedidos: (filtros) => req(`/pedidos${qs(filtros)}`),
  config: () => req(`/config`),
  salvarConfig: (payload) =>
    req(`/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  confirmar: (payload) =>
    req(`/confirmacoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  removerConfirmacao: (pedidoId) =>
    req(`/confirmacoes/${pedidoId}`, { method: "DELETE" }),
  salvarEtapa: (pedidoId, payload) =>
    req(`/etapas/${pedidoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  confirmarEtapa: (pedidoId, payload) =>
    req(`/etapas/${pedidoId}/confirmar`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  negarProducao: (pedidoId, payload) =>
    req(`/etapas/${pedidoId}/negar-producao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  agendarInspecao: (pedidoId, payload) =>
    req(`/etapas/${pedidoId}/comercial`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  removerEtapa: (pedidoId) => req(`/etapas/${pedidoId}`, { method: "DELETE" }),
};

export const ETAPAS = [
  { chave: "pedido", label: "Pedido" },
  { chave: "pcp", label: "PCP / Planejamento" },
  { chave: "producao", label: "Produção" },
  { chave: "comercial", label: "Comercial / Agendamento" },
  { chave: "lem", label: "Inspeção LEM" },
  { chave: "faturamento", label: "Faturamento" },
  { chave: "estoque", label: "Estoque" },
  { chave: "expedicao", label: "Expedição" },
  { chave: "entrega", label: "Entrega" },
];

export function etapaLabel(chave) {
  if (chave === "concluido") return "Concluído";
  return ETAPAS.find((e) => e.chave === chave)?.label || chave;
}

export const MOTIVOS = [
  { value: "falta_estoque", label: "Falta de estoque" },
  { value: "atraso_producao", label: "Atraso de produção" },
  { value: "atraso_faturamento", label: "Atraso de faturamento" },
  { value: "atraso_transporte", label: "Atraso de transporte" },
  { value: "recusa_cliente", label: "Recusa do cliente" },
  { value: "erro_documento", label: "Erro de documento" },
  { value: "avaria", label: "Avaria" },
  { value: "outro", label: "Outro" },
];

const MOTIVO_LABELS = {
  ...Object.fromEntries(MOTIVOS.map((m) => [m.value, m.label])),
  nao_informado: "Não informado",
};

export function motivoLabel(value) {
  return MOTIVO_LABELS[value] || value;
}
