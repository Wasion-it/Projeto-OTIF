const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function qs(params) {
  const clean = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : "";
}

async function req(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${detail}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => req(`/health`),
  metricas: (filtros) => req(`/metrics/otif${qs(filtros)}`),
  tendencia: (filtros) => req(`/metrics/tendencia${qs(filtros)}`),
  itens: (filtros) => req(`/pedidos/itens${qs(filtros)}`),
  confirmar: (payload) =>
    req(`/confirmacoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  removerConfirmacao: (itemId) =>
    req(`/confirmacoes/${itemId}`, { method: "DELETE" }),
};

export const MOTIVOS = [
  { value: "falta_estoque", label: "Falta de estoque" },
  { value: "atraso_producao", label: "Atraso de producao" },
  { value: "atraso_faturamento", label: "Atraso de faturamento" },
  { value: "atraso_transporte", label: "Atraso de transporte" },
  { value: "recusa_cliente", label: "Recusa do cliente" },
  { value: "erro_documento", label: "Erro de documento" },
  { value: "avaria", label: "Avaria" },
  { value: "outro", label: "Outro" },
];

export function motivoLabel(value) {
  return MOTIVOS.find((m) => m.value === value)?.label || value;
}
