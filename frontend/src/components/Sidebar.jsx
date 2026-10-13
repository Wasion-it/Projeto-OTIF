import { ChartLineUp, Package, SlidersHorizontal, Truck } from "@phosphor-icons/react";

const NAV = [
  { grupo: null, itens: [{ id: "visao-geral", label: "Visão geral", Icone: ChartLineUp }] },
  { grupo: "Operação", itens: [{ id: "pedidos", label: "Pedidos", Icone: Package }] },
  { grupo: "Administração", itens: [{ id: "ajustes", label: "Ajustes", Icone: SlidersHorizontal }] },
];

export default function Sidebar({ route, navigate, apiOk = true }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-marca">
        <span className="marca-icone" aria-hidden="true">
          <Truck size={20} weight="fill" />
        </span>
        <span className="marca-texto">
          <strong>OTIF</strong>
          <span>On Time In Full</span>
        </span>
      </div>

      <nav className="nav" aria-label="Seções do painel">
        {NAV.map((secao) => (
          <div className="nav-secao" key={secao.grupo || "principal"}>
            {secao.grupo && <div className="nav-grupo">{secao.grupo}</div>}
            {secao.itens.map(({ id, label, Icone }) => {
              const ativo = route === id;
              return (
                <button
                  type="button"
                  key={id}
                  className={`nav-item ${ativo ? "ativo" : ""}`}
                  onClick={() => navigate(id)}
                  aria-current={ativo ? "page" : undefined}
                >
                  <Icone className="ico" size={18} weight={ativo ? "bold" : "regular"} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Rodapé com estado real da integração. */}
      <div className="sidebar-foot">
        <span className={`sidebar-status ${apiOk ? "on" : "off"}`} role="status">
          {apiOk ? "JUND conectado" : "JUND sem resposta"}
        </span>
        <span className="sidebar-nota">Acesso sem autenticação</span>
      </div>
    </aside>
  );
}
