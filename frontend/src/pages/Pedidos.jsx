import SegmentosPedidos from "../components/SegmentosPedidos.jsx";
import FiltrosPedidos from "../components/FiltrosPedidos.jsx";
import ItensTable from "../components/ItensTable.jsx";

export default function Pedidos({
  filtros,
  filtrosRascunho,
  onFiltrosRascunho,
  onAplicarFiltros,
  onAplicarSegmento,
  onLimparFiltros,
  onRemoverFiltro,
  itens,
  carregando,
  ordenacao,
  onOrdenar,
  page,
  pageSize,
  totalItens,
  totalPaginas,
  onPage,
  onPageSize,
  onExportCsv,
  onConfirmar,
  onConfirmarEtapa,
  pedidoSelecionadoId,
  onDetalhe,
}) {
  return (
    <>
      {/* Controles numa única superfície: triagem por situação em cima (1 clique)
          e refinamento por cliente/período embaixo (Aplicar explícito). */}
      <section className="pedidos-controles" aria-label="Filtros de pedidos">
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
        page={page}
        pageSize={pageSize}
        totalItens={totalItens}
        totalPaginas={totalPaginas}
        onPage={onPage}
        onPageSize={onPageSize}
        onExportCsv={onExportCsv}
        onConfirmar={onConfirmar}
        onConfirmarEtapa={onConfirmarEtapa}
        pedidoSelecionadoId={pedidoSelecionadoId}
        onDetalhe={onDetalhe}
      />
    </>
  );
}
