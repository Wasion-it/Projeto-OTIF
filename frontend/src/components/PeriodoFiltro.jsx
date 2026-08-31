// Filtro de período/cliente compartilhado entre as páginas.
// `children` recebe filtros extras específicos da página (ex.: status em Pedidos).
export default function PeriodoFiltro({ filtros, onFiltro, onLimpar, temFiltros, children }) {
  return (
    <section className="toolbar">
      <label>
        De (solicitada)
        <input
          type="date"
          value={filtros.data_ini}
          onChange={(e) => onFiltro("data_ini", e.target.value)}
        />
      </label>
      <label>
        Até (solicitada)
        <input
          type="date"
          value={filtros.data_fim}
          onChange={(e) => onFiltro("data_fim", e.target.value)}
        />
      </label>
      <label>
        Cliente
        <input
          type="text"
          placeholder="filtro parcial"
          value={filtros.cliente}
          onChange={(e) => onFiltro("cliente", e.target.value)}
        />
      </label>
      {children}
      <div className="toolbar-spacer" />
      {temFiltros && (
        <button className="btn-ghost" onClick={onLimpar}>
          Limpar filtros
        </button>
      )}
    </section>
  );
}
