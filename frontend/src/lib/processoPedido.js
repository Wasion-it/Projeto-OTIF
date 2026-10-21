// Monta a visão "meta x realizado" de UM pedido: uma linha por etapa com o
// período real (ou projetado pela meta) em dias corridos, para a faixa visual
// do drawer. Trabalha com índices de dia (inteiros) para não depender de fuso.
import { contractDateDe, registroPendente } from "./etapas.js";

const DIA_MS = 86_400_000;

// "2026-10-16" (ou datetime ISO) -> índice de dia.
export function diaDe(iso) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(ano, mes - 1, dia) / DIA_MS);
}

export function isoDeDia(dia) {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10);
}

// Pedido não tem duração própria e Expedição é a mesma data do Embarque que
// fecha o Estoque.
const FORA_DA_TABELA = new Set(["pedido", "expedicao"]);

/**
 * @returns {null | {
 *   linhas: Array, eixo: {min:number, span:number}, hoje: number|null,
 *   contract: number|null, projecao: {fim:number, folga:number|null}|null,
 *   semProjecao: string|null, metaTotal: number|null, leadTime: number|null,
 *   decorrido: number, aberto: boolean
 * }}
 *
 * Estados da linha: "feita" (período real), "atual" (em andamento),
 * "futura" (só meta) e "sem_calculo" (tem data, mas a etapa anterior não foi
 * registrada, então não há como medir o período).
 */
export function montarProcessoPedido(pedido, metasDias) {
  const proc = pedido.processo;
  if (!proc?.etapas?.length) return null;

  const metas = metasDias || {};
  const hoje = diaDe(proc.data_operacional);
  const dataContract = contractDateDe(pedido);
  const contract = dataContract ? diaDe(dataContract) : null;
  const dataPedido = proc.etapas.find((e) => e.chave === "pedido")?.data;
  const origem = dataPedido ? diaDe(dataPedido) : hoje;
  const aberto = !proc.concluido && !pedido.confirmacao;

  const linhas = proc.etapas
    .filter((e) => !FORA_DA_TABELA.has(e.chave))
    .map((e) => {
      const meta = metas[e.chave] ?? null;
      const base = {
        chave: e.chave,
        nome: e.nome,
        etapa: e,
        meta,
        estado: "futura",
        dias: null,
        ini: null,
        fim: null,
        projIni: null,
        projFim: null,
        aguardando: false,
      };
      if (e.concluida) {
        const fim = diaDe(e.data);
        return e.dias != null
          ? { ...base, estado: "feita", dias: e.dias, ini: fim - e.dias, fim }
          : { ...base, estado: "sem_calculo", fim };
      }
      if (e.chave === proc.etapa_atual) {
        const dias = proc.dias_na_etapa_atual ?? 0;
        // LEM agendado para o futuro: a contagem só começa na data agendada.
        const aguardando =
          e.chave === "lem" && Boolean(proc.lem_aguardando_inicio) && Boolean(proc.inicio_lem_data);
        const ini = aguardando ? diaDe(proc.inicio_lem_data) : hoje - dias;
        return { ...base, estado: "atual", dias, ini, fim: hoje, aguardando };
      }
      return base;
    });

  // Projeção "pela meta": o que falta da etapa atual + a meta das seguintes.
  // Não se aplica a pedido fechado nem quando faltam registros anteriores.
  let semProjecao = null;
  if (aberto) {
    if (registroPendente(pedido) || linhas.some((l) => l.estado === "sem_calculo")) {
      semProjecao = "Projeção indisponível: há etapas já realizadas que ainda não foram registradas.";
    }
  }
  let projecao = null;
  if (aberto && !semProjecao) {
    let cursor = null;
    for (const linha of linhas) {
      if (linha.estado === "atual" && linha.meta != null) {
        linha.projIni = Math.max(linha.ini, hoje);
        linha.projFim = Math.max(hoje, linha.ini + linha.meta);
        cursor = linha.projFim;
      } else if (linha.estado === "futura" && cursor != null && linha.meta != null) {
        linha.projIni = cursor;
        linha.projFim = cursor + linha.meta;
        cursor = linha.projFim;
      }
    }
    const ultima = linhas[linhas.length - 1];
    if (ultima?.projFim != null) {
      projecao = { fim: ultima.projFim, folga: contract != null ? contract - ultima.projFim : null };
    }
  }

  const marcos = [
    origem,
    contract,
    aberto ? hoje : null,
    projecao?.fim,
    ...linhas.flatMap((l) => [l.ini, l.fim, l.projIni, l.projFim]),
  ].filter((valor) => valor != null);
  const min = Math.min(...marcos);
  const max = Math.max(...marcos);

  const comMeta = linhas.filter((l) => l.meta != null);
  return {
    linhas,
    eixo: { min, span: Math.max(7, max - min) },
    hoje: aberto ? hoje : null,
    contract,
    projecao,
    semProjecao,
    metaTotal: comMeta.length ? comMeta.reduce((total, l) => total + l.meta, 0) : null,
    leadTime: proc.lead_time_dias ?? null,
    decorrido: Math.max(0, hoje - origem),
    aberto,
  };
}
