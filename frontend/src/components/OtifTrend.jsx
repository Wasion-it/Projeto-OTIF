function toneOf(pct, meta) {
  if (pct >= meta) return "success";
  if (pct >= 85) return "warning";
  return "danger";
}

function fmtMes(mes) {
  // "2026-08" -> "08/26"
  return `${mes.slice(5, 7)}/${mes.slice(2, 4)}`;
}

export default function OtifTrend({ dados, meta = 95 }) {
  const pontos = (dados || []).filter((d) => d.total_avaliados > 0);
  const ultimo = pontos[pontos.length - 1];
  const anterior = pontos[pontos.length - 2];
  const delta =
    ultimo && anterior
      ? Math.round((ultimo.otif_pct - anterior.otif_pct) * 10) / 10
      : null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>OTIF por mês</h3>
        {ultimo && (
          <span className="panel-hint">
            Último: {ultimo.otif_pct}%
            {delta != null && (
              <span className={delta >= 0 ? "up" : "down"}>
                {" "}
                {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)} p.p.
              </span>
            )}
          </span>
        )}
      </div>

      {pontos.length === 0 ? (
        <p className="vazio">Sem dados no período.</p>
      ) : (
        <>
          <div className="trend-plot">
            <div className="trend-meta-line" style={{ bottom: `${meta}%` }} aria-hidden="true">
              <span className="trend-meta-label">meta {meta}%</span>
            </div>
            {pontos.map((d) => (
              <div
                className="trend-col"
                key={d.mes}
                title={`${d.mes}: ${d.otif_pct}% OTIF (${d.total_avaliados} itens)`}
              >
                <span className="trend-valor">{Math.round(d.otif_pct)}</span>
                <div
                  className={`trend-bar tone-${toneOf(d.otif_pct, meta)}`}
                  style={{ height: `${d.otif_pct}%` }}
                />
              </div>
            ))}
          </div>
          <div className="trend-axis">
            {pontos.map((d) => (
              <span className="trend-mes" key={d.mes}>
                {fmtMes(d.mes)}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
