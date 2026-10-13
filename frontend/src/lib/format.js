// Meta de OTIF (%) padrao, usada como fallback ate o backend responder.
// A meta efetiva vem de GET /config (tela Ajustes).
export const META_OTIF_PADRAO = 95;

// Tom (cor) de um percentual conforme a meta. Verde >= meta, amarelo >= 85, senao vermelho.
export function tom(pct, meta = META_OTIF_PADRAO) {
  if (pct >= meta) return "bom";
  if (pct >= 85) return "medio";
  return "ruim";
}

export function fmtPct(n) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function fmtInteiro(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

export function formatarNotaFiscal(numero, serie) {
  if (!numero) return "-";
  return serie ? `NF ${numero} · série ${serie}` : `NF ${numero}`;
}

// Data/hora do ERP em formato de tabela: sem segundos e com ano de 2 dígitos.
// Segundos são ruído numa grade e custam ~25% da largura da célula.
export function fmtDataHoraCurta(iso) {
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
export function fmtDataHora(iso) {
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
export function fmtDataIso(dataIso) {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

// Data local no formato aceito por <input type="date"> e pela API.
export function isoLocal(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
