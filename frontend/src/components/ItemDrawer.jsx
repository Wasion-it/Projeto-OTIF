import { useEffect, useRef } from "react";
import {
  CalendarCheck,
  CaretRight,
  Check,
  CheckCircle,
  Circle,
  Clock,
  Minus,
  Package,
  Prohibit,
  Timer,
  Warning,
  X,
  XCircle,
} from "@phosphor-icons/react";
import { motivoLabel } from "../api.js";
import { fmtDataHora, formatarNotaFiscal } from "../lib/format.js";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock.js";

const ACAO_ETAPA = {
  pcp: "Confirmar PCP",
  producao: "Confirmar produção",
  comercial: "Agendar inspeção",
  lem: "Confirmar inspeção",
  faturamento: "Aguardando faturamento",
  estoque: "Aguardando embarque",
  entrega: "Confirmar entrega",
};

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function acaoDoDrawer(pedido) {
  const etapa = pedido.processo?.etapa_atual;
  if (!etapa || etapa === "concluido") {
    return {
      label: pedido.confirmacao ? "Editar confirmação" : "Confirmar entrega",
      tipo: "entrega",
    };
  }
  if (etapa === "entrega") return { label: "Confirmar entrega", tipo: "entrega" };
  if (etapa === "faturamento" || etapa === "estoque") {
    return {
      label:
        etapa === "faturamento"
          ? "Aguardando faturamento no ERP"
          : "Aguardando embarque no ERP",
      tipo: "etapa",
      bloqueada: true,
    };
  }
  if (etapa === "lem" && pedido.processo?.lem_aguardando_inicio) {
    return {
      label: `Aguardando ${pedido.processo.inspecao_agendada_data}`,
      tipo: "etapa",
      bloqueada: true,
    };
  }
  return { label: ACAO_ETAPA[etapa] || "Confirmar etapa", tipo: "etapa" };
}

function podeAgendarAntecipado(pedido) {
  const processo = pedido.processo;
  return Boolean(
    processo &&
      !processo.concluido &&
      processo.etapa_atual !== "comercial" &&
      !processo.inspecao_agendada_data &&
      !processo.lem_data
  );
}

function Flag({ estado, label }) {
  if (estado == null) {
    return (
      <span className="flag flag-neutro">
        <Minus size={14} weight="bold" aria-hidden="true" />
        {label}: sem resultado
      </span>
    );
  }
  const Icone = estado ? CheckCircle : XCircle;
  return (
    <span className={`flag ${estado ? "flag-ok" : "flag-bad"}`}>
      <Icone size={15} weight="fill" aria-hidden="true" />
      {label}
      <span className="sr-only">{estado ? ": sim" : ": não"}</span>
    </span>
  );
}

function Resumo({ titulo, meta }) {
  return (
    <summary>
      <CaretRight className="ico-caret" size={16} weight="bold" aria-hidden="true" />
      <span>{titulo}</span>
      <span className="drawer-disclosure-meta">{meta}</span>
    </summary>
  );
}

function StatusFlag({ status }) {
  const map = {
    otif: { txt: "OTIF", cls: "flag-ok", Icone: CheckCircle },
    falha: { txt: "Falha", cls: "flag-bad", Icone: XCircle },
    pendente: { txt: "Pendente", cls: "flag-neutro", Icone: Clock },
    sem_contract_date: { txt: "Sem Contract Date", cls: "flag-missing", Icone: Warning },
  };
  const atual = map[status] || map.pendente;
  const { Icone } = atual;
  return (
    <span className={`flag ${atual.cls}`}>
      <Icone size={15} weight="fill" aria-hidden="true" />
      {atual.txt}
    </span>
  );
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
    return dias > 0
      ? `Aguardando faturamento no ERP · há ${dias}d`
      : "Aguardando faturamento no ERP";
  }
  if (processo.etapa_atual === "estoque") {
    const dias = processo.dias_na_etapa_atual ?? 0;
    return dias > 0
      ? `${dias}d em Estoque · aguardando embarque no ERP`
      : "Em Estoque · aguardando embarque no ERP";
  }
  if (processo.etapa_atual === "lem") {
    if (processo.lem_aguardando_inicio) {
      const dias = processo.dias_ate_inicio_lem;
      return `Aguardando até ${processo.inicio_lem_data}${
        dias != null ? ` · faltam ${dias}d` : ""
      }`;
    }
    const dias = processo.dias_na_etapa_atual ?? 0;
    return dias === 0 ? "Inspeção inicia hoje · 0d parada" : `${dias}d parada no LEM`;
  }
  return processo.dias_na_etapa_atual > 0
    ? `Há ${processo.dias_na_etapa_atual}d nesta etapa`
    : "Aguardando atualização";
}

function ProcessoTimeline({ processo }) {
  if (!processo) return <p className="vazio">Sem dados de processo.</p>;
  const { etapas = [], etapa_atual, gargalo } = processo;
  return (
    <>
      <div className="proc-resumo">
        <span>
          Etapa atual: <b>{processo.etapa_atual_nome || "-"}</b>
          {textoTempoEtapa(processo) && ` · ${textoTempoEtapa(processo)}`}
        </span>
        {processo.lead_time_dias != null && (
          <span>
            Lead time: <b>{processo.lead_time_dias}d</b>
          </span>
        )}
      </div>
      <ol className="timeline">
        {etapas.map((etapa) => {
          const atual = etapa.chave === etapa_atual;
          const aguardandoInicio =
            atual && etapa.chave === "lem" && processo.lem_aguardando_inicio;
          const aguardandoFaturamento = atual && etapa.chave === "faturamento";
          const aguardandoEmbarque = atual && etapa.chave === "estoque";
          const classe = etapa.concluida ? "tl-done" : atual ? "tl-current" : "tl-todo";
          const ehGargalo = etapa.chave === gargalo && etapa.dias != null;
          return (
            <li key={etapa.chave} className={`tl-item ${classe}`}>
              <span className="tl-dot" aria-hidden="true">
                {etapa.concluida ? (
                  <Check size={13} weight="bold" />
                ) : atual ? (
                  <Circle size={8} weight="fill" />
                ) : null}
              </span>
              <span className="sr-only">
                {etapa.concluida ? "Concluída: " : atual ? "Etapa atual: " : "Pendente: "}
              </span>
              <div className="tl-body">
                <div className="tl-linha">
                  <span className="tl-nome">{etapa.nome}</span>
                  {etapa.dias != null && (
                    <span className={`tl-dias ${ehGargalo ? "tl-gargalo" : ""}`}>
                      {etapa.dias}d{ehGargalo ? " · gargalo" : ""}
                    </span>
                  )}
                </div>
                <div className="tl-data">
                  {etapa.chave === "estoque" && etapa.data_hora
                    ? `Faturamento até embarque em ${fmtDataHora(etapa.data_hora)}`
                    : etapa.chave === "expedicao" && etapa.data_hora
                      ? `Automática · embarque em ${fmtDataHora(etapa.data_hora)}`
                      : etapa.data_hora
                        ? fmtDataHora(etapa.data_hora)
                        : etapa.data
                          ? etapa.data
                          : aguardandoFaturamento
                            ? "aguardando data/hora do ERP"
                            : aguardandoEmbarque
                              ? "em estoque · aguardando embarque no ERP"
                              : aguardandoInicio
                              ? "aguardando a data agendada"
                              : atual
                                ? "em andamento"
                                : "—"}
                </div>
                {etapa.data_agendada && (
                  <div className="tl-agendamento">
                    <CalendarCheck size={14} aria-hidden="true" />
                    Inspeção agendada: {etapa.data_agendada}
                  </div>
                )}
                {etapa.obs && <div className="tl-obs">{etapa.obs}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function ResumoOperacional({ pedido, itens }) {
  const processo = pedido.processo;
  const prazo = textoPrazo(pedido);
  const contractDate = pedido.contract_date || pedido.prazo_entrega;
  const diasAtraso = Number(pedido.dias_atraso) || 0;
  const leadTime = processo?.lead_time_dias;
  const totalItens = pedido.qtd_itens ?? itens.length;

  return (
    <section className="drawer-section drawer-overview" aria-labelledby="resumo-operacional">
      <h3 className="drawer-section-titulo" id="resumo-operacional">
        Resumo operacional
      </h3>
      <div className="flags">
        <StatusFlag status={pedido.status} />
        <Flag estado={pedido.on_time} label="On Time" />
        <Flag estado={pedido.in_full} label="In Full" />
      </div>

      <div className="drawer-overview-grid">
        <div className={`drawer-overview-card tom-${tomPrazo(pedido)}`}>
          <span className="drawer-overview-label">
            <CalendarCheck size={14} aria-hidden="true" />
            Contract Date
          </span>
          <strong>{contractDate || "Não informado"}</strong>
          <small>
            {contractDate
              ? prazo || "Prazo oficial informado no JUND"
              : "Corrija a data de entrega no pedido do JUND"}
          </small>
        </div>

        <div className="drawer-overview-card">
          <span className="drawer-overview-label">
            <Clock size={14} aria-hidden="true" />
            Etapa atual
          </span>
          <strong>{processo?.etapa_atual_nome || "Sem informação"}</strong>
          <small>
            {processo?.concluido ? "Processo concluído" : textoTempoEtapa(processo)}
          </small>
        </div>

        <div className="drawer-overview-card">
          <span className="drawer-overview-label">
            <Package size={14} aria-hidden="true" />
            Faturado / pedido
          </span>
          <strong>
            {pedido.qtd_faturada_total ?? 0} / {pedido.qtd_pedida_total ?? 0}
          </strong>
          <small>
            {totalItens} {totalItens === 1 ? "item" : "itens"}
          </small>
        </div>

        <div className={`drawer-overview-card ${diasAtraso > 0 ? "tom-perigo" : ""}`}>
          <span className="drawer-overview-label">
            <Timer size={14} aria-hidden="true" />
            {diasAtraso > 0 ? "Atraso" : "Lead time"}
          </span>
          <strong>{diasAtraso > 0 ? `+${diasAtraso}d` : leadTime != null ? `${leadTime}d` : "-"}</strong>
          <small>
            {diasAtraso > 0
              ? pedido.origem_atraso || "Origem não informada"
              : leadTime != null
                ? "Tempo total do processo"
                : "Ainda não calculado"}
          </small>
        </div>
      </div>
    </section>
  );
}

export default function ItemDrawer({
  item,
  suspenso = false,
  onClose,
  onConfirmar,
  onConfirmarEtapa,
  onNegarProducao,
  onEtapa,
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
    if (!painel) return undefined;

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

  return (
    <div
      className="drawer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !suspenso) onClose();
      }}
    >
      <aside
        id="pedido-drawer"
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pedido-drawer-titulo"
        tabIndex={-1}
        ref={painelRef}
        onFocusCapture={(event) => {
          ultimoFocoRef.current = event.target;
        }}
      >
        <div className="drawer-head">
          <div>
            <h2 id="pedido-drawer-titulo">Pedido {pedido.numero}</h2>
            <div className="drawer-sub">{pedido.cliente}</div>
            {(pedido.erp_id != null || pedido.numero_interno) && (
              <div className="drawer-identificadores">
                {pedido.erp_id != null && <span>ID ERP {pedido.erp_id}</span>}
                {pedido.numero_interno && <span>Interno {pedido.numero_interno}</span>}
              </div>
            )}
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Fechar detalhes do pedido">
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <div className="drawer-body">
          <ResumoOperacional pedido={pedido} itens={itens} />

          {ultimaNegativaAberta && (
            <div className="drawer-alerta-pcp" role="note">
              <strong>
                <Prohibit size={16} weight="bold" aria-hidden="true" />
                Produção negada pelo PCP
              </strong>
              <span>{ultimaNegativaAberta.motivo}</span>
              <span>
                Nova previsão: <b>{ultimaNegativaAberta.data_prevista}</b>
              </span>
            </div>
          )}

          {pedido.status === "sem_contract_date" && (
            <div className="drawer-alerta" role="note">
              <strong>
                <Warning size={16} weight="fill" aria-hidden="true" />
                Contract Date não informado
              </strong>
              <span>
                Corrija a data de entrega no pedido do JUND e sincronize novamente. Até lá,
                este pedido não entra nas taxas de On Time ou OTIF.
              </span>
            </div>
          )}

          {(diasAtraso > 0 || pedido.motivo_falha) && (
            <div className="drawer-alerta" role="note">
              <strong>
                <Warning size={16} weight="fill" aria-hidden="true" />
                {diasAtraso > 0 ? "Pedido com atraso" : "Falha registrada"}
              </strong>
              <span>
                {diasAtraso > 0 && `${diasAtraso}d${pedido.origem_atraso ? ` · ${pedido.origem_atraso}` : ""}`}
                {diasAtraso > 0 && pedido.motivo_falha ? " · " : ""}
                {pedido.motivo_falha ? motivoLabel(pedido.motivo_falha) : ""}
              </span>
            </div>
          )}

          <section className="drawer-section" aria-labelledby="datas-pedido">
            <h3 className="drawer-section-titulo" id="datas-pedido">
              Datas principais
            </h3>
            <dl className="kv">
              <dt>Digitação</dt>
              <dd>{pedido.data_solicitada || "-"}</dd>
              <dt>Contract Date</dt>
              <dd>
                {pedido.contract_date || pedido.prazo_entrega || "Não informado"}
                {prazo && ` · ${prazo.toLocaleLowerCase()}`}
              </dd>
              <dt>Inspeção agendada</dt>
              <dd>{pedido.processo?.inspecao_agendada_data || "-"}</dd>
              <dt>Faturamento</dt>
              <dd>{fmtDataHora(pedido.faturamento_em || pedido.processo?.faturamento_em)}</dd>
              <dt>Nota fiscal</dt>
              <dd>{formatarNotaFiscal(pedido.nota_fiscal_numero, pedido.nota_fiscal_serie)}</dd>
              <dt>Embarque</dt>
              <dd>{fmtDataHora(pedido.embarque_em || pedido.processo?.embarque_em)}</dd>
              <dt>Entrega</dt>
              <dd>{pedido.data_entrega_real || "-"}</dd>
            </dl>
          </section>

          <details className="drawer-disclosure">
            <Resumo
              titulo="Itens do pedido"
              meta={`${itens.length} ${itens.length === 1 ? "item" : "itens"}`}
            />
            <div className="drawer-disclosure-body">
              {itens.length > 0 ? (
                <div className="itens-lista">
                  {itens.map((itemPedido) => {
                    const classeQuantidade =
                      itemPedido.in_full == null ? "neutro" : itemPedido.in_full ? "ok" : "bad";
                    return (
                      <div
                        className="item-linha"
                        key={itemPedido.item_numero ?? `${itemPedido.sku}-${itemPedido.descricao}`}
                      >
                        <div className="item-info">
                          <span className="item-sku">{itemPedido.sku}</span>
                          <span className="item-desc">{itemPedido.descricao || "Sem descrição"}</span>
                        </div>
                        <div className="item-qtd">
                          <span className={`flag-mini ${classeQuantidade}`}>
                            <span className="sr-only">Faturado / pedido: </span>
                            {itemPedido.qtd_faturada} / {itemPedido.qtd_pedida}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="vazio">Nenhum item informado para este pedido.</p>
              )}
            </div>
          </details>

          <details className="drawer-disclosure">
            <Resumo
              titulo="Processo interno"
              meta={pedido.processo?.etapa_atual_nome || "Sem dados"}
            />
            <div className="drawer-disclosure-body">
              {onEtapa && (
                <div className="drawer-disclosure-acoes">
                  <button className="btn-link" onClick={() => onEtapa(pedido)}>
                    Editar todas as etapas
                  </button>
                </div>
              )}
              <ProcessoTimeline processo={pedido.processo} />
            </div>
          </details>

          <details className="drawer-disclosure">
            <Resumo
              titulo="Histórico de negativas do PCP"
              meta={`${negativasProducao.length} ${
                negativasProducao.length === 1 ? "registro" : "registros"
              }`}
            />
            <div className="drawer-disclosure-body">
              {negativasProducao.length === 0 ? (
                <p className="vazio">Nenhuma negativa de produção registrada.</p>
              ) : (
                <ol className="negativas-historico">
                  {negativasProducao.map((negativa) => {
                    const aberta = !negativa.resolvida_em;
                    return (
                      <li
                        key={negativa.id}
                        className={`negativa-item ${aberta ? "aberta" : "resolvida"}`}
                      >
                        <div className="negativa-head">
                          <strong>{aberta ? "Negativa aberta" : "Negativa resolvida"}</strong>
                          <span>{fmtDataHora(negativa.criado_em)}</span>
                        </div>
                        <p>{negativa.motivo}</p>
                        <div className="negativa-meta">
                          <span>Previsão: <b>{negativa.data_prevista}</b></span>
                          <span>Registrada por: <b>{negativa.usuario}</b></span>
                          {!aberta && (
                            <span>
                              Resolvida em {fmtDataHora(negativa.resolvida_em)} por{" "}
                              <b>{negativa.resolvida_por}</b>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </details>

          <details className="drawer-disclosure">
            <Resumo
              titulo="Confirmação de entrega"
              meta={confirmacao ? "Registrada" : "Pendente"}
            />
            <div className="drawer-disclosure-body">
              {confirmacao ? (
                <>
                  <dl className="kv">
                    <dt>Entregue em</dt>
                    <dd>{confirmacao.data_entrega_real}</dd>
                    <dt>Recebido completo</dt>
                    <dd>{confirmacao.recebido_completo ? "Sim" : "Não"}</dd>
                    <dt>Registrado por</dt>
                    <dd>{confirmacao.usuario}</dd>
                    <dt>Registrado em</dt>
                    <dd>{fmtDataHora(confirmacao.criado_em)}</dd>
                  </dl>
                  {confirmacao.observacao && <div className="obs-box">{confirmacao.observacao}</div>}
                </>
              ) : (
                <p className="vazio">A entrega ainda não foi confirmada.</p>
              )}
            </div>
          </details>
        </div>

        <div className="drawer-foot">
          <button className="btn-sec" onClick={onClose}>
            Voltar à lista
          </button>
          {podeNegarProducao && onNegarProducao && (
            <button
              className="btn-sec-danger"
              onClick={() => onNegarProducao(pedido)}
            >
              Negar produção
            </button>
          )}
          {agendamentoParalelo && onConfirmarEtapa && (
            <button
              className="btn-sec"
              onClick={() => onConfirmarEtapa(pedido, "comercial")}
            >
              Agendar inspeção
            </button>
          )}
          {handlerAcao && (
            <button
              className="btn"
              onClick={() => handlerAcao(pedido)}
              disabled={acao.bloqueada}
              title={
                acao.bloqueada
                  ? pedido.processo?.etapa_atual === "faturamento"
                    ? "Aguardando atualização automática do faturamento pelo ERP."
                    : pedido.processo?.etapa_atual === "estoque"
                      ? "Aguardando atualização automática do embarque pelo ERP."
                      : "A contagem do LEM ainda não começou."
                  : undefined
              }
            >
              {acao.label}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
