import PeriodoFiltro from "../components/PeriodoFiltro.jsx";
import ItensTable from "../components/ItensTable.jsx";

export default function Pedidos({
  filtros,
  onFiltro,
  onLimpar,
  temFiltros,
  statusFiltro,
  setStatusFiltro,
  situacaoFiltro,
  setSituacaoFiltro,
  itens,
  carregando,
  onConfirmar,
  onDetalhe,
}) {
  return (
    <>
      <PeriodoFiltro
        filtros={filtros}
        onFiltro={onFiltro}
        onLimpar={onLimpar}
        temFiltros={temFiltros}
      >
        <label>
          Status
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="otif">OTIF</option>
            <option value="falha">Falha</option>
            <option value="pendente">Pendente</option>
          </select>
        </label>
        <label>
          Prazo (pendentes)
          <select value={situacaoFiltro} onChange={(e) => setSituacaoFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="no_prazo">No prazo</option>
            <option value="atencao">Atenção</option>
            <option value="vencido">Vencido</option>
          </select>
        </label>
      </PeriodoFiltro>

      <ItensTable
        itens={itens}
        onConfirmar={onConfirmar}
        onDetalhe={onDetalhe}
        carregando={carregando}
      />
    </>
  );
}
