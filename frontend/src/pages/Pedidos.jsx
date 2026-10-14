import EtapasBarra from "../components/EtapasBarra.jsx";
import SegmentosPedidos from "../components/SegmentosPedidos.jsx";
import FiltrosPedidos from "../components/FiltrosPedidos.jsx";
import ItensTable from "../components/ItensTable.jsx";
import LoteBarra from "../components/LoteBarra.jsx";
import { ETAPAS_LOTE } from "../lib/etapas.js";
import { temFiltrosPedidos } from "../lib/pedidosFiltros.js";

// Tela de trabalho de todos os perfis: onde cada pedido está (barra de etapas
// e trilha por linha) e a ação manual da etapa atual na própria linha.
export default function Pedidos({
  filtros,
  filtrosRascunho,
  onFiltrosRascunho,
  onAplicarFiltros,
  onAplicarSegmento,
  onLimparFiltros,
  onRemoverFiltro,
  processo,
  itens,
  carregando,
  ordenacao,
  onOrdenar,
  onDefinirOrdenacao,
  page,
  pageSize,
  totalItens,
  totalPaginas,
  onPage,
  onPageSize,
  onExportCsv,
  onConfirmar,
  onConfirmarEtapa,
  onNegarProducao,
  pedidoSelecionadoId,
  onDetalhe,
  selecionados,
  onAlternarSelecao,
  onSelecionarPagina,
  onLimparSelecao,
  onLoteConcluido,
}) {
  const etapaLote = ETAPAS_LOTE[filtros.etapa] ? filtros.etapa : null;
  // Só pedidos da página atual (a seleção é limpa ao trocar página/filtro).
  const pedidosSelecionados = itens.filter(
    (it) => selecionados.has(it.pedido_id) && it.processo?.etapa_atual === etapaLote
  );

  return (
    <>
      <section className="controles" aria-label="Filtros de pedidos">
        <EtapasBarra
          processo={processo}
          etapaAtiva={filtros.etapa}
          onSelecionar={(etapa) => onAplicarSegmento({ etapa })}
        />
        <SegmentosPedidos filtros={filtros} onSelecionar={onAplicarSegmento} />
        <FiltrosPedidos
          filtros={filtros}
          rascunho={filtrosRascunho}
          carregando={carregando}
          onRascunhoChange={onFiltrosRascunho}
          onAplicar={onAplicarFiltros}
          onLimparTodos={onLimparFiltros}
          onRemoverFiltro={onRemoverFiltro}
        />
      </section>

      <ItensTable
        itens={itens}
        carregando={carregando}
        ordenacao={ordenacao}
        onOrdenar={onOrdenar}
        onDefinirOrdenacao={onDefinirOrdenacao}
        page={page}
        pageSize={pageSize}
        totalItens={totalItens}
        totalPaginas={totalPaginas}
        onPage={onPage}
        onPageSize={onPageSize}
        onExportCsv={onExportCsv}
        onConfirmar={onConfirmar}
        onConfirmarEtapa={onConfirmarEtapa}
        onNegarProducao={onNegarProducao}
        pedidoSelecionadoId={pedidoSelecionadoId}
        onDetalhe={onDetalhe}
        temFiltros={temFiltrosPedidos(filtros)}
        onLimparFiltros={onLimparFiltros}
        selecaoAtiva={Boolean(etapaLote)}
        selecionados={selecionados}
        onAlternarSelecao={onAlternarSelecao}
        onSelecionarPagina={onSelecionarPagina}
        lote={
          etapaLote && pedidosSelecionados.length > 0 ? (
            <LoteBarra
              key={etapaLote}
              etapa={etapaLote}
              pedidos={pedidosSelecionados}
              dataOperacional={pedidosSelecionados[0]?.processo?.data_operacional}
              onCancelar={onLimparSelecao}
              onConcluido={onLoteConcluido}
            />
          ) : etapaLote ? (
            <p className="lote-dica">
              Marque vários pedidos para usar “{ETAPAS_LOTE[etapaLote].verbo}” de uma vez.
            </p>
          ) : null
        }
      />
    </>
  );
}
