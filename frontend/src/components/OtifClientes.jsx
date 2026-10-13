import { tom, fmtPct } from "../lib/format.js";

// Ranking de OTIF por cliente (pior primeiro). Só entram clientes com pedidos
// já avaliados; os que só têm pendentes ficam fora. A marca vertical em cada
// barra é a meta, para comparar sem ler o número.
export default function OtifClientes({ clientes, meta, limite = 8 }) {
  const avaliados = (clientes || []).filter((c) => c.total_avaliados > 0);
  const lista = avaliados.slice(0, limite);

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>OTIF por cliente</h3>
        {avaliados.length > 0 && (
          <span className="panel-hint">
            {lista.length} piores de {avaliados.length}
          </span>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="vazio">Sem clientes com pedidos avaliados no período.</p>
      ) : (
        <>
          <ul className="motivos">
            {lista.map((c) => (
              <li key={c.cliente} title={`${c.otif_ok} OTIF de ${c.total_avaliados} avaliados`}>
                <span className="motivo-nome" title={c.cliente}>
                  {c.cliente}
                </span>
                <span className="motivo-barra-wrap" aria-hidden="true">
                  <span
                    className={`motivo-barra barra-${tom(c.otif_pct, meta)}`}
                    style={{ width: `${Math.max(2, c.otif_pct)}%` }}
                  />
                  <span className="barra-meta" style={{ left: `${meta}%` }} />
                </span>
                <span className="motivo-qtd">{fmtPct(c.otif_pct)}%</span>
              </li>
            ))}
          </ul>
          <p className="motivos-legenda">Meta de {fmtPct(meta)}%</p>
        </>
      )}
    </section>
  );
}
