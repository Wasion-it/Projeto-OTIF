// Regras de apresentação do fluxo do pedido, compartilhadas pela tabela, pelo
// drawer e pelas ações em lote. Antes elas estavam duplicadas (com textos
// diferentes) em ItensTable e ItemDrawer.
import { fmtDataCurta } from "./format.js";

// Etapas na ordem do processo. `origem` diz quem move a etapa: "manual" é
// registrada aqui no painel; "erp" chega sozinha do JUND.
export const ETAPAS_FLUXO = [
  { chave: "pcp", nome: "PCP", origem: "manual" },
  { chave: "producao", nome: "Produção", origem: "manual" },
  { chave: "comercial", nome: "Comercial", origem: "manual" },
  { chave: "lem", nome: "Inspeção LEM", origem: "manual" },
  { chave: "faturamento", nome: "Faturamento", origem: "erp" },
  { chave: "estoque", nome: "Estoque", origem: "erp" },
  { chave: "expedicao", nome: "Expedição", origem: "erp" },
  { chave: "entrega", nome: "Entrega", origem: "manual" },
];

// Etapas que aparecem na barra de filtro. Expedição nunca é a etapa atual
// (tem a mesma data do embarque que encerra o Estoque), então não vira filtro.
export const ETAPAS_FILTRO = ETAPAS_FLUXO.filter((e) => e.chave !== "expedicao");

// Etapas em que a mesma data vale para vários pedidos: aceitam ação em lote.
export const ETAPAS_LOTE = {
  pcp: { verbo: "Confirmar PCP", campoData: "Data do planejamento", limite: "max" },
  producao: { verbo: "Confirmar produção", campoData: "Fim da produção", limite: "max" },
  comercial: { verbo: "Agendar inspeção", campoData: "Data da inspeção", limite: "min" },
};

// Nome curto e único em toda a interface (o backend usa nomes longos, como
// "PCP / Planejamento", que não cabem na tabela).
export function nomeEtapa(chave, fallback) {
  if (chave === "concluido") return "Concluído";
  if (chave === "pedido") return "Pedido digitado";
  return ETAPAS_FLUXO.find((e) => e.chave === chave)?.nome || fallback || chave || "—";
}

export function hojeIso() {
  const data = new Date();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function negativaAberta(processo) {
  return processo?.negativas_producao?.find((n) => !n.resolvida_em) || null;
}

export function contractDateDe(pedido) {
  return pedido.contract_date || pedido.prazo_entrega || null;
}

// Situação = status OTIF + prazo, numa frase curta. `tom` só existe quando há
// status a sinalizar; "neutro" fica na cor do texto.
export function situacaoPedido(pedido) {
  const { status } = pedido;
  if (status === "otif") return { texto: "OTIF", tom: "ok" };
  if (status === "falha") {
    const atraso = Number(pedido.dias_atraso) || 0;
    if (atraso > 0) {
      const origem = pedido.origem_atraso ? ` ${pedido.origem_atraso}` : "";
      return { texto: `Falha · +${atraso}d${origem}`, tom: "erro" };
    }
    return { texto: "Falha · incompleto", tom: "erro" };
  }
  if (status === "sem_contract_date") return { texto: "Sem Contract Date", tom: "atencao" };

  const dias = pedido.dias_restantes;
  if (dias == null) return { texto: "Pendente", tom: "neutro" };
  if (dias < 0) return { texto: `Vencido há ${Math.abs(dias)}d`, tom: "erro" };
  if (dias === 0) return { texto: "Vence hoje", tom: "atencao" };
  return {
    texto: `Faltam ${dias}d`,
    tom: pedido.situacao_prazo === "atencao" ? "atencao" : "neutro",
  };
}

// Detalhe da etapa atual: tempo parado, espera programada ou bloqueio.
// Retorna { texto, tom } para que a cor só apareça quando há exceção.
export function detalheEtapa(processo) {
  if (!processo) return null;
  if (processo.concluido) return null;
  const etapa = processo.etapa_atual;
  const dias = processo.dias_na_etapa_atual;
  const hoje = processo.data_operacional || hojeIso();

  const negativa = etapa === "pcp" ? negativaAberta(processo) : null;
  if (negativa) {
    const vencida = negativa.data_prevista < hoje;
    return {
      texto: `Negada · previsão ${fmtDataCurta(negativa.data_prevista)}${
        vencida ? " vencida" : ""
      }`,
      tom: vencida ? "erro" : "neutro",
    };
  }
  if (etapa === "lem" && processo.lem_aguardando_inicio) {
    return { texto: `Inspeção agendada para ${fmtDataCurta(processo.inicio_lem_data)}`, tom: "neutro" };
  }
  if (etapa === "faturamento") {
    return { texto: dias ? `Aguarda o ERP há ${dias}d` : "Aguarda o ERP", tom: "neutro" };
  }
  if (etapa === "estoque") {
    return { texto: dias ? `Em estoque há ${dias}d` : "Em estoque", tom: "neutro" };
  }
  if (etapa === "producao" && processo.producao_plan_fim && processo.producao_plan_fim < hoje) {
    return {
      texto: `Fim planejado ${fmtDataCurta(processo.producao_plan_fim)} ultrapassado`,
      tom: "atencao",
    };
  }
  if (dias != null) return { texto: `Há ${dias}d na etapa`, tom: "neutro" };
  return null;
}

// Ação manual da etapa atual. `tipo`:
// - "etapa": ConfirmarEtapaModal (PCP, Produção, Comercial, LEM)
// - "entrega": ConfirmacaoModal
// - null: nada a fazer no painel; `espera` explica quem está com a bola.
export function acaoDoPedido(pedido) {
  const processo = pedido.processo;
  const etapa = processo?.etapa_atual;
  if (!processo || etapa === "concluido") return { tipo: null, espera: null };
  if (etapa === "pcp") return { tipo: "etapa", etapa, label: "Confirmar PCP" };
  if (etapa === "producao") return { tipo: "etapa", etapa, label: "Confirmar produção" };
  if (etapa === "comercial") return { tipo: "etapa", etapa, label: "Agendar inspeção" };
  // A inspeção pode acontecer antes ou depois da data agendada.
  if (etapa === "lem") return { tipo: "etapa", etapa, label: "Confirmar inspeção" };
  if (etapa === "faturamento") return { tipo: null, espera: "Aguarda o ERP" };
  if (etapa === "estoque" || etapa === "expedicao") {
    return { tipo: null, espera: "Aguarda embarque" };
  }
  if (etapa === "entrega") return { tipo: "entrega", etapa, label: "Confirmar entrega" };
  return { tipo: null, espera: null };
}

export function podeNegarProducao(pedido) {
  return pedido.processo?.etapa_atual === "pcp";
}

// O Comercial pode agendar a inspeção antes da Produção terminar.
export function podeAgendarAntecipado(pedido) {
  const processo = pedido.processo;
  return Boolean(
    processo &&
      !processo.concluido &&
      (processo.etapa_atual === "pcp" || processo.etapa_atual === "producao") &&
      !processo.inspecao_agendada_data &&
      !processo.lem_data
  );
}

// Pedido já faturado no ERP cuja etapa atual ainda é manual: falta registrar
// o que já aconteceu na fábrica.
export function registroPendente(pedido) {
  const etapa = pedido.processo?.etapa_atual;
  const faturado = Boolean(pedido.faturamento_em || pedido.processo?.faturamento_em);
  return faturado && ["pcp", "producao", "comercial", "lem"].includes(etapa);
}
