export const FILTROS_PEDIDOS_VAZIOS = Object.freeze({
  data_ini: "",
  data_fim: "",
  cliente: "",
  status: "",
  situacao_prazo: "",
});

const STATUS_VALIDOS = new Set(["otif", "falha", "pendente", "sem_contract_date"]);
const SITUACOES_VALIDAS = new Set(["no_prazo", "atencao", "vencido"]);

export function normalizarFiltrosPedidos(filtros = {}) {
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

export function filtrosPedidosIguais(a, b) {
  return Object.keys(FILTROS_PEDIDOS_VAZIOS).every((chave) => a[chave] === b[chave]);
}

export function temFiltrosPedidos(filtros) {
  return Object.keys(FILTROS_PEDIDOS_VAZIOS).some((chave) => Boolean(filtros[chave]));
}

export function filtrosGerais(filtros) {
  return {
    data_ini: filtros.data_ini,
    data_fim: filtros.data_fim,
    cliente: filtros.cliente,
  };
}

export function removerFiltroPedido(filtros, chave) {
  const proximos = { ...filtros };
  if (chave === "periodo") {
    proximos.data_ini = "";
    proximos.data_fim = "";
  } else if (chave === "status") {
    proximos.status = "";
    proximos.situacao_prazo = "";
  } else if (chave in FILTROS_PEDIDOS_VAZIOS) {
    proximos[chave] = "";
  }
  return normalizarFiltrosPedidos(proximos);
}
