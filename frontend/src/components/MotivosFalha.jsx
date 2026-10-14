import { motivoLabel } from "../api.js";
import { fmtInteiro, fmtPct } from "../lib/format.js";

// "Não informado" não é causa: é entrega registrada sem motivo. Fica separado
// para não competir com as causas reais.
export default function MotivosFalha({ motivos, onVerFalhas }) {
  const lista = motivos || [];
  const total = lista.reduce((s, x) => s + x.quantidade, 0);
  const causas = lista.filter((m) => m.motivo !== "nao_informado");
  const semMotivo = lista.find((m) => m.motivo === "nao_informado")?.quantidade || 0;

  return (
    <section className="bloco" aria-labelledby="motivos-titulo">
      <div className="secao-titulo">
        <h2 id="motivos-titulo">Por que falhamos</h2>
        {total > 0 && (
          <button type="button" className="btn btn-texto btn-p" onClick={onVerFalhas}>
            Ver {fmtInteiro(total)} {total === 1 ? "falha" : "falhas"}
          </button>
        )}
      </div>
      {total === 0 ? (
        <p className="txt-sec">Nenhuma falha no período.</p>
      ) : (
        <>
          <table className="tabela tabela-mini">
            <thead>
              <tr>
                <th>Motivo</th>
                <th className="num">Falhas</th>
                <th className="num">% das falhas</th>
              </tr>
            </thead>
            <tbody>
              {causas.map((m) => (
                <tr key={m.motivo}>
                  <td>{motivoLabel(m.motivo)}</td>
                  <td className="num">{fmtInteiro(m.quantidade)}</td>
                  <td className="num">{fmtPct((m.quantidade / total) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {semMotivo > 0 && (
            <p className="tom-atencao">
              {fmtInteiro(semMotivo)} {semMotivo === 1 ? "falha foi registrada" : "falhas foram registradas"}{" "}
              sem motivo ({fmtPct((semMotivo / total) * 100)}% do total).
            </p>
          )}
        </>
      )}
    </section>
  );
}
