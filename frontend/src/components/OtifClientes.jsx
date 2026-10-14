import { useState } from "react";
import { fmtInteiro, fmtPct } from "../lib/format.js";

const LIMITE = 10;

// Ordenado por número de falhas: é o que mais pesa no OTIF. O percentual sem o
// volume ao lado engana (1 pedido com falha = 0%).
export default function OtifClientes({ clientes, onAbrirCliente }) {
  const [todos, setTodos] = useState(false);
  const avaliados = (clientes || [])
    .filter((c) => c.total_avaliados > 0)
    .sort((a, b) => b.falhas - a.falhas || a.otif_pct - b.otif_pct);
  const lista = todos ? avaliados : avaliados.slice(0, LIMITE);

  return (
    <section className="bloco" aria-labelledby="clientes-titulo">
      <div className="secao-titulo">
        <h2 id="clientes-titulo">Clientes com mais falhas</h2>
        {avaliados.length > LIMITE && (
          <button type="button" className="btn btn-texto btn-p" onClick={() => setTodos((v) => !v)}>
            {todos ? `Mostrar ${LIMITE}` : `Mostrar todos (${avaliados.length})`}
          </button>
        )}
      </div>
      {lista.length === 0 ? (
        <p className="txt-sec">Nenhum cliente com pedidos avaliados no período.</p>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela tabela-mini">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="num">Avaliados</th>
                <th className="num">Falhas</th>
                <th className="num">OTIF</th>
                <th className="num">On Time</th>
                <th className="num">In Full</th>
                <th className="num">Pendentes</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.cliente}>
                  <td className="col-cliente">
                    <button
                      type="button"
                      className="link-pedido"
                      onClick={() => onAbrirCliente(c.cliente)}
                      title={`Ver pedidos de ${c.cliente}`}
                    >
                      {c.cliente}
                    </button>
                  </td>
                  <td className="num">{fmtInteiro(c.total_avaliados)}</td>
                  <td className="num">{fmtInteiro(c.falhas)}</td>
                  <td className="num">{fmtPct(c.otif_pct)}%</td>
                  <td className="num">{fmtPct(c.on_time_pct)}%</td>
                  <td className="num">{fmtPct(c.in_full_pct)}%</td>
                  <td className="num">{fmtInteiro(c.total_pendentes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
