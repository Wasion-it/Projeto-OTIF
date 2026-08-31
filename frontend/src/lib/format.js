// Meta de OTIF (%). On Time / In Full usam o mesmo alvo por ora.
// TODO: mover para configuração do backend quando existir a tela de Administração/SLA.
export const META_OTIF = 95;

export function tom(pct) {
  if (pct >= META_OTIF) return "bom";
  if (pct >= 85) return "medio";
  return "ruim";
}

export function fmtPct(n) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
