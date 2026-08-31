import { motivoLabel } from "../api.js";

export default function MotivosFalha({ motivos }) {
  const lista = motivos || [];
  const total = lista.reduce((s, x) => s + x.quantidade, 0);
  const max = lista.reduce((m, x) => Math.max(m, x.quantidade), 0) || 1;

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Falhas por motivo</h3>
        {total > 0 && <span className="panel-hint">{total} no período</span>}
      </div>
      {lista.length === 0 ? (
        <p className="vazio">Nenhuma falha registrada no período.</p>
      ) : (
        <ul className="motivos">
          {lista.map((m) => (
            <li key={m.motivo}>
              <span className="motivo-nome">{motivoLabel(m.motivo)}</span>
              <span className="motivo-barra-wrap">
                <span
                  className="motivo-barra"
                  style={{ width: `${(m.quantidade / max) * 100}%` }}
                />
              </span>
              <span className="motivo-qtd">{m.quantidade}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
