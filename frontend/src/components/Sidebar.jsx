export default function Sidebar({ route, navigate, pendentesVencidos }) {
  function Item({ id, label, badge }) {
    return (
      <button
        className={`nav-item ${route === id ? "ativo" : ""}`}
        onClick={() => navigate(id)}
        aria-current={route === id ? "page" : undefined}
      >
        <span>{label}</span>
        {badge > 0 && <span className="nav-badge">{badge}</span>}
      </button>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-marca">
        Painel <strong>OTIF</strong>
      </div>
      <nav className="nav">
        <Item id="visao-geral" label="Visão geral" />
        <div className="nav-grupo">Operação</div>
        <Item id="pedidos" label="Pedidos" />
        <Item id="confirmacoes" label="Confirmações" badge={pendentesVencidos} />
      </nav>
      <div className="sidebar-foot">
        Dados fake · ERP mock
        <br />
        Sem autenticação
      </div>
    </aside>
  );
}
