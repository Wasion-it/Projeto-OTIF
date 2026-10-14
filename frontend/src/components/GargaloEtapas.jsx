import { nomeEtapa } from "../lib/etapas.js";
import { fmtInteiro, fmtPct } from "../lib/format.js";

// Onde os pedidos estão agora e quanto cada etapa demora. A barra compara só
// a duração média; a etapa mais lenta recebe tom forte e a palavra "gargalo".
export default function GargaloEtapas({ processo, onAbrirEtapa }) {
  const etapas = (processo?.etapas || []).filter(
    (e) => e.chave !== "pedido" && e.chave !== "expedicao"
  );
  const maxDias = Math.max(1, ...etapas.map((e) => e.dias_medio || 0));

  return (
    <section className="bloco" aria-labelledby="gargalo-titulo">
      <div className="secao-titulo">
        <h2 id="gargalo-titulo">Onde os pedidos estão</h2>
        {processo && (
          <span className="txt-sec">
            {fmtInteiro(processo.total_em_processo)} em andamento ·{" "}
            {fmtInteiro(processo.total_concluido)} concluídos
          </span>
        )}
      </div>
      {!processo ? (
        <p className="txt-sec">Carregando…</p>
      ) : (
        <table className="tabela tabela-mini">
          <thead>
            <tr>
              <th>Etapa</th>
              <th className="num">Em andamento</th>
              <th>Tempo médio na etapa</th>
            </tr>
          </thead>
          <tbody>
            {etapas.map((e) => {
              const gargalo = e.chave === processo.gargalo;
              return (
                <tr key={e.chave}>
                  <td>{nomeEtapa(e.chave, e.nome)}</td>
                  <td className="num">
                    {e.em_andamento > 0 ? (
                      <button
                        type="button"
                        className="link-pedido"
                        onClick={() => onAbrirEtapa(e.chave)}
                        aria-label={`Ver os ${e.em_andamento} pedidos em ${nomeEtapa(e.chave, e.nome)}`}
                      >
                        {fmtInteiro(e.em_andamento)}
                      </button>
                    ) : (
                      <span className="txt-sec">0</span>
                    )}
                  </td>
                  <td>
                    <span className="barra-linha">
                      <span className="barra-trilho" aria-hidden="true">
                        <span
                          className={`barra ${gargalo ? "barra-forte" : ""}`}
                          style={{ width: `${((e.dias_medio || 0) / maxDias) * 100}%` }}
                        />
                      </span>
                      <span className={gargalo ? "peso-500" : ""}>
                        {e.dias_medio == null ? "—" : `${fmtPct(e.dias_medio)}d`}
                        {gargalo ? " · gargalo" : ""}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="legenda">Tempo médio calculado nos pedidos que já passaram pela etapa.</p>
    </section>
  );
}
