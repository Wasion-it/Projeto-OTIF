import { useEffect, useRef } from "react";
import Icone from "./Icone.jsx";
import { motivoLabel } from "../api.js";
import {
  acaoDoPedido,
  contractDateDe,
  detalheEtapa,
  negativaAberta,
  nomeEtapa,
  podeAgendarAntecipado,
  podeNegarProducao,
  registroPendente,
  situacaoPedido,
} from "../lib/etapas.js";
import { fmtDataHora, fmtDataIso, fmtInteiro, formatarNotaFiscal } from "../lib/format.js";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock.js";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function textoEtapaTimeline(etapa, processo, atual) {
  if (etapa.chave === "estoque" && etapa.data_hora) {
    return `Embarcou em ${fmtDataHora(etapa.data_hora)}`;
  }
  if (etapa.chave === "expedicao" && etapa.data_hora) {
    return `Automática, com o embarque do ERP`;
  }
  if (etapa.data_hora) return fmtDataHora(etapa.data_hora);
  if (etapa.data) return fmtDataIso(etapa.data);
  if (!atual) return null;
  if (etapa.chave === "faturamento") return "Aguardando o ERP";
  if (etapa.chave === "estoque") return "Faturado, aguardando embarque no ERP";
  if (etapa.chave === "lem" && processo.lem_aguardando_inicio) {
    return "Aguardando a inspeção · a contagem começa na data agendada";
  }
  return processo.dias_na_etapa_atual != null
    ? `Em andamento há ${processo.dias_na_etapa_atual}d`
    : "Em andamento";
}

function LinhaDoTempo({ processo }) {
  if (!processo) return <p className="txt-sec">Sem dados de processo.</p>;
  const { etapas = [], etapa_atual, gargalo } = processo;
  return (
    <ol className="timeline">
      {etapas.map((etapa) => {
        const atual = etapa.chave === etapa_atual;
        const classe = etapa.concluida ? "feita" : atual ? "atual" : "";
        const ehGargalo = etapa.chave === gargalo && etapa.dias != null && etapa.dias > 0;
        return (
          <li key={etapa.chave} className={`tl-item ${classe}`}>
            <span className="tl-marca" aria-hidden="true">
              {etapa.concluida && <Icone nome="check" tamanho={12} />}
            </span>
            <span className="sr-only">
              {etapa.concluida ? "Concluída: " : atual ? "Etapa atual: " : "Pendente: "}
            </span>
            <div className="tl-corpo">
              <div className="tl-linha">
                <span className={`tl-nome ${atual ? "peso-500" : ""}`}>
                  {nomeEtapa(etapa.chave, etapa.nome)}
                </span>
                {etapa.dias != null && (
                  <span className="tl-dias">
                    {etapa.dias}d{ehGargalo && <span className="peso-500"> · gargalo</span>}
                  </span>
                )}
              </div>
              {textoEtapaTimeline(etapa, processo, atual) && (
                <div className="tl-info">{textoEtapaTimeline(etapa, processo, atual)}</div>
              )}
              {etapa.data_agendada && (
                <div className="tl-info">Inspeção agendada para {fmtDataIso(etapa.data_agendada)}</div>
              )}
              {etapa.obs && <div className="tl-obs">{etapa.obs}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SimNao({ valor }) {
  if (valor == null) return <span className="txt-sec">sem resultado</span>;
  return valor ? <span className="tom-ok">Sim</span> : <span className="tom-erro">Não</span>;
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

  // Foco preso no drawer; suspenso (inert) enquanto um modal está por cima.
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
      if (
        event.shiftKey &&
        (document.activeElement === primeiro || !painel.contains(document.activeElement))
      ) {
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
  const processo = pedido.processo;
  const confirmacao = pedido.confirmacao;
  const itens = pedido.itens || [];
  const situacao = situacaoPedido(pedido);
  const contractDate = contractDateDe(pedido);
  const acao = acaoDoPedido(pedido);
  const handlerAcao = acao.tipo === "entrega" ? onConfirmar : onConfirmarEtapa;
  const detalhe = detalheEtapa(processo);
  const negativa = negativaAberta(processo);
  const negativas = processo?.negativas_producao || [];
  const fechado = pedido.status === "otif" || pedido.status === "falha";

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
        <header className="drawer-topo">
          <div>
            <h2 id="pedido-drawer-titulo">Pedido {pedido.numero}</h2>
            <p className="drawer-cliente">{pedido.cliente}</p>
          </div>
          <button
            type="button"
            className="btn-icone"
            onClick={onClose}
            aria-label="Fechar detalhes do pedido"
          >
            <Icone nome="fechar" tamanho={18} />
          </button>
        </header>

        <div className="drawer-corpo">
          <dl className="drawer-resumo">
            <div>
              <dt>Situação</dt>
              <dd className={`tom-${situacao.tom} peso-500`}>{situacao.texto}</dd>
            </div>
            <div>
              <dt>Contract Date</dt>
              <dd className={contractDate ? "" : "tom-atencao"}>
                {contractDate ? fmtDataIso(contractDate) : "Não informado no JUND"}
              </dd>
            </div>
            <div>
              <dt>Etapa atual</dt>
              <dd>
                {processo ? nomeEtapa(processo.etapa_atual, processo.etapa_atual_nome) : "—"}
                {detalhe && (
                  <span className={`drawer-resumo-det tom-${detalhe.tom}`}>{detalhe.texto}</span>
                )}
              </dd>
            </div>
          </dl>

          <section className="drawer-secao" aria-labelledby="drawer-acao">
            <h3 id="drawer-acao">Próxima ação</h3>
            {acao.tipo ? (
              <div className="drawer-acoes">
                <button type="button" className="btn btn-pri" onClick={() => handlerAcao?.(pedido)}>
                  {acao.label}
                </button>
                {podeNegarProducao(pedido) && onNegarProducao && (
                  <button
                    type="button"
                    className="btn btn-sec tom-erro"
                    onClick={() => onNegarProducao(pedido)}
                  >
                    Negar produção
                  </button>
                )}
                {podeAgendarAntecipado(pedido) && onConfirmarEtapa && (
                  <button
                    type="button"
                    className="btn btn-sec"
                    onClick={() => onConfirmarEtapa(pedido, "comercial")}
                  >
                    Agendar inspeção antecipada
                  </button>
                )}
              </div>
            ) : (
              <p>
                {acao.espera ||
                  (processo?.concluido ? "Nenhuma: processo concluído." : "Nenhuma ação manual.")}
              </p>
            )}
            {negativa && (
              <p className="drawer-nota">
                Produção negada pelo PCP: “{negativa.motivo}”. Nova previsão{" "}
                {fmtDataIso(negativa.data_prevista)}.
              </p>
            )}
            {registroPendente(pedido) && (
              <p className="drawer-nota tom-atencao">
                Este pedido já foi faturado no ERP, mas a etapa {nomeEtapa(processo.etapa_atual)} não
                foi registrada aqui.
              </p>
            )}
            {pedido.status === "sem_contract_date" && (
              <p className="drawer-nota tom-atencao">
                Sem Contract Date, o pedido fica fora de On Time e OTIF. Corrija a data de entrega
                no pedido do JUND.
              </p>
            )}
          </section>

          <section className="drawer-secao" aria-labelledby="drawer-tempo">
            <div className="secao-titulo">
              <h3 id="drawer-tempo">Linha do tempo</h3>
              {onEtapa && (
                <button type="button" className="btn btn-texto btn-p" onClick={() => onEtapa(pedido)}>
                  Editar etapas
                </button>
              )}
            </div>
            <LinhaDoTempo processo={processo} />
          </section>

          {fechado && (
            <section className="drawer-secao" aria-labelledby="drawer-resultado">
              <h3 id="drawer-resultado">Resultado</h3>
              <dl className="kv">
                <dt>On Time</dt>
                <dd>
                  <SimNao valor={pedido.on_time} />
                  {pedido.dias_atraso > 0 &&
                    ` · ${pedido.dias_atraso}d de atraso${
                      pedido.origem_atraso ? ` (${pedido.origem_atraso})` : ""
                    }`}
                </dd>
                <dt>In Full</dt>
                <dd>
                  <SimNao valor={pedido.in_full} />
                </dd>
                {pedido.motivo_falha && (
                  <>
                    <dt>Motivo da falha</dt>
                    <dd>{motivoLabel(pedido.motivo_falha)}</dd>
                  </>
                )}
                {processo?.lead_time_dias != null && (
                  <>
                    <dt>Lead time</dt>
                    <dd>{processo.lead_time_dias}d</dd>
                  </>
                )}
              </dl>
            </section>
          )}

          <section className="drawer-secao" aria-labelledby="drawer-itens">
            <h3 id="drawer-itens">
              Itens <span className="txt-sec peso-400">{itens.length}</span>
            </h3>
            {itens.length === 0 ? (
              <p className="txt-sec">Nenhum item informado.</p>
            ) : (
              <table className="tabela tabela-mini">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Descrição</th>
                    <th className="num">Pedido</th>
                    <th className="num">Faturado</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((linha) => {
                    const parcial = linha.qtd_faturada > 0 && linha.qtd_faturada < linha.qtd_pedida;
                    return (
                      <tr key={linha.item_numero ?? `${linha.sku}-${linha.descricao}`}>
                        <td>{linha.sku}</td>
                        <td>{linha.descricao || "—"}</td>
                        <td className="num">{fmtInteiro(linha.qtd_pedida)}</td>
                        <td className={`num ${parcial ? "tom-atencao peso-500" : ""}`}>
                          {fmtInteiro(linha.qtd_faturada)}
                          {parcial && <span className="sr-only"> (parcial)</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="drawer-secao" aria-labelledby="drawer-erp">
            <h3 id="drawer-erp">Dados do ERP</h3>
            <dl className="kv">
              <dt>Digitação</dt>
              <dd>{fmtDataIso(pedido.data_solicitada) || "—"}</dd>
              <dt>Faturamento</dt>
              <dd>{fmtDataHora(pedido.faturamento_em || processo?.faturamento_em)}</dd>
              <dt>Nota fiscal</dt>
              <dd>{formatarNotaFiscal(pedido.nota_fiscal_numero, pedido.nota_fiscal_serie)}</dd>
              <dt>Embarque</dt>
              <dd>{fmtDataHora(pedido.embarque_em || processo?.embarque_em)}</dd>
              <dt>Nº interno</dt>
              <dd>{pedido.numero_interno || "—"}</dd>
              <dt>ID ERP</dt>
              <dd>{pedido.erp_id ?? "—"}</dd>
            </dl>
          </section>

          {negativas.length > 0 && (
            <section className="drawer-secao" aria-labelledby="drawer-negativas">
              <h3 id="drawer-negativas">
                Negativas de produção <span className="txt-sec peso-400">{negativas.length}</span>
              </h3>
              <ol className="negativas">
                {negativas.map((n) => (
                  <li key={n.id}>
                    <div className="negativa-linha">
                      <span className={n.resolvida_em ? "txt-sec" : "peso-500"}>
                        {n.resolvida_em ? "Resolvida" : "Aberta"}
                      </span>
                      <span className="txt-sec">
                        {fmtDataHora(n.criado_em)} · {n.usuario}
                      </span>
                    </div>
                    <p>{n.motivo}</p>
                    <p className="txt-sec">
                      Previsão {fmtDataIso(n.data_prevista)}
                      {n.resolvida_em &&
                        ` · resolvida em ${fmtDataHora(n.resolvida_em)} por ${n.resolvida_por}`}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="drawer-secao" aria-labelledby="drawer-entrega">
            <div className="secao-titulo">
              <h3 id="drawer-entrega">Entrega</h3>
              {confirmacao && onConfirmar && (
                <button type="button" className="btn btn-texto btn-p" onClick={() => onConfirmar(pedido)}>
                  Editar entrega
                </button>
              )}
            </div>
            {confirmacao ? (
              <>
                <dl className="kv">
                  <dt>Entregue em</dt>
                  <dd>{fmtDataIso(confirmacao.data_entrega_real)}</dd>
                  <dt>Recebido completo</dt>
                  <dd>
                    <SimNao valor={confirmacao.recebido_completo} />
                  </dd>
                  <dt>Registrado por</dt>
                  <dd>
                    {confirmacao.usuario} em {fmtDataHora(confirmacao.criado_em)}
                  </dd>
                </dl>
                {confirmacao.observacao && <p className="tl-obs">{confirmacao.observacao}</p>}
              </>
            ) : (
              <p className="txt-sec">Ainda não confirmada.</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
