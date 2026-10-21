const NAV = [
  { id: "pedidos", label: "Pedidos" },
  { id: "comercial", label: "Comercial" },
  { id: "visao-geral", label: "Visão geral" },
  { id: "ajustes", label: "Ajustes" },
];

// Navegação enxuta: quatro destinos, o ativo marcado pelo fundo de seleção.
export default function Sidebar({ route, navigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-marca">OTIF</div>
      <nav aria-label="Seções do painel">
        <ul className="nav">
          {NAV.map(({ id, label }) => {
            const ativo = route === id;
            return (
              <li key={id}>
                <a
                  href={`#/${id}`}
                  className={`nav-item ${ativo ? "ativo" : ""}`}
                  aria-current={ativo ? "page" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(id);
                  }}
                >
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="sidebar-nota">Acesso sem autenticação</p>
    </aside>
  );
}
