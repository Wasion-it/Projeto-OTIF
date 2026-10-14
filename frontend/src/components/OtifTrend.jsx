import { useRef, useState } from "react";
import { useLarguraElemento } from "../hooks/useLarguraElemento.js";
import { fmtInteiro, fmtPct } from "../lib/format.js";

const ALTURA = 200;
const MARGEM_X = 24;
const MARGEM_TOPO = 18;
const N_MINIMO = 5; // abaixo disso o percentual do mês é pouco confiável

const SERIES = [
  { chave: "on_time_pct", nome: "On Time", classe: "serie-ontime" },
  { chave: "in_full_pct", nome: "In Full", classe: "serie-infull" },
];

function fmtMes(mes) {
  return `${mes.slice(5, 7)}/${mes.slice(2, 4)}`;
}

// Escala a partir de um pouco abaixo do menor valor (ou da meta): uma escala
// 0–100 achataria justamente a variação que interessa.
function escala(valores, meta) {
  const minimo = Math.min(...valores, meta);
  return { yMin: Math.max(0, Math.floor((minimo - 5) / 10) * 10), yMax: 100 };
}

export default function OtifTrend({ dados, meta = 95 }) {
  const plotRef = useRef(null);
  const largura = useLarguraElemento(plotRef);
  const [ativo, setAtivo] = useState(null);
  const [extras, setExtras] = useState({ on_time_pct: false, in_full_pct: false });

  const pontos = (dados || []).filter((d) => d.total_avaliados > 0);
  const valores = pontos.flatMap((d) => [
    d.otif_pct,
    ...SERIES.filter((s) => extras[s.chave]).map((s) => d[s.chave]),
  ]);
  const { yMin, yMax } = pontos.length ? escala(valores, meta) : { yMin: 0, yMax: 100 };

  const posY = (v) => MARGEM_TOPO + (1 - (v - yMin) / (yMax - yMin)) * (ALTURA - MARGEM_TOPO);
  const posX = (i) =>
    pontos.length === 1 ? largura / 2 : MARGEM_X + (i * (largura - MARGEM_X * 2)) / (pontos.length - 1);
  const linhaDe = (chave) => pontos.map((d, i) => `${posX(i)},${posY(d[chave])}`).join(" ");
  const yMeta = posY(meta);
  const pontoAtivo = ativo != null ? pontos[ativo] : null;

  return (
    <section className="bloco" aria-labelledby="otif-mes-titulo">
      <div className="secao-titulo">
        <h2 id="otif-mes-titulo">OTIF por mês de digitação</h2>
        <div className="serie-toggles">
          {SERIES.map((s) => (
            <label key={s.chave} className="opcao">
              <input
                type="checkbox"
                checked={extras[s.chave]}
                onChange={(e) => setExtras((x) => ({ ...x, [s.chave]: e.target.checked }))}
              />
              <span>{s.nome}</span>
            </label>
          ))}
        </div>
      </div>

      {pontos.length === 0 ? (
        <p className="txt-sec">Nenhum mês com pedidos avaliados no período.</p>
      ) : (
        <>
          <div className="grafico">
            <div className="grafico-y" style={{ height: ALTURA }} aria-hidden="true">
              <span style={{ top: posY(yMax) }}>{yMax}%</span>
              <span style={{ top: posY(yMin) }}>{yMin}%</span>
            </div>
            <div
              className="grafico-plot"
              ref={plotRef}
              style={{ height: ALTURA }}
              onMouseLeave={() => setAtivo(null)}
            >
              {largura > 0 && (
                <svg width={largura} height={ALTURA} aria-hidden="true">
                  <line className="grafico-base" x1={0} x2={largura} y1={posY(yMin)} y2={posY(yMin)} />
                  <line className="grafico-meta" x1={0} x2={largura} y1={yMeta} y2={yMeta} />
                  {/* Rótulo da meta à esquerda: o último mês costuma ficar perto de 100%. */}
                  <text className="grafico-meta-rotulo" x={4} y={yMeta - 6} textAnchor="start">
                    meta {fmtPct(meta)}%
                  </text>
                  {SERIES.filter((s) => extras[s.chave] && pontos.length > 1).map((s) => (
                    <polyline key={s.chave} className={`grafico-serie ${s.classe}`} points={linhaDe(s.chave)} />
                  ))}
                  {pontos.length > 1 && (
                    <polyline className="grafico-linha" points={linhaDe("otif_pct")} />
                  )}
                  {pontos.map((d, i) => {
                    const abaixo = d.otif_pct < meta;
                    const pouco = d.total_avaliados < N_MINIMO;
                    const x = posX(i);
                    const y = posY(d.otif_pct);
                    return (
                      <g key={d.mes}>
                        <circle
                          className={`grafico-ponto ${abaixo ? "abaixo" : "acima"} ${pouco ? "pouco" : ""}`}
                          cx={x}
                          cy={y}
                          r={ativo === i ? 5 : 4}
                        />
                        {/* Último ponto: rótulo ao lado, à esquerda, para não cruzar a meta. */}
                        <text
                          className="grafico-valor"
                          x={i === pontos.length - 1 && pontos.length > 1 ? x - 10 : x}
                          y={
                            i === pontos.length - 1 && pontos.length > 1
                              ? y + 4
                              : y < 34
                                ? y + 20
                                : y - 10
                          }
                          textAnchor={i === pontos.length - 1 && pontos.length > 1 ? "end" : "middle"}
                        >
                          {Math.round(d.otif_pct)}
                          {pouco ? ` (n=${d.total_avaliados})` : ""}
                        </text>
                        <rect
                          x={x - 16}
                          y={0}
                          width={32}
                          height={ALTURA}
                          fill="transparent"
                          onMouseEnter={() => setAtivo(i)}
                        />
                      </g>
                    );
                  })}
                </svg>
              )}
              {pontoAtivo && (
                <div
                  className="grafico-tooltip"
                  style={{ left: posX(ativo), top: posY(pontoAtivo.otif_pct) }}
                  aria-hidden="true"
                >
                  <strong>{fmtMes(pontoAtivo.mes)}</strong>
                  <span>OTIF {fmtPct(pontoAtivo.otif_pct)}%</span>
                  <span>On Time {fmtPct(pontoAtivo.on_time_pct)}%</span>
                  <span>In Full {fmtPct(pontoAtivo.in_full_pct)}%</span>
                  <span>{fmtInteiro(pontoAtivo.total_avaliados)} avaliados</span>
                </div>
              )}
            </div>
            <div className="grafico-x" aria-hidden="true">
              {largura > 0 &&
                pontos.map((d, i) => (
                  <span key={d.mes} style={{ left: posX(i) }}>
                    {fmtMes(d.mes)}
                  </span>
                ))}
            </div>
          </div>
          <p className="legenda">
            Ponto vazado: menos de {N_MINIMO} pedidos avaliados no mês. Vermelho: abaixo da meta.
          </p>

          {/* Alternativa textual do gráfico para leitores de tela. */}
          <table className="sr-only">
            <caption>OTIF por mês de digitação</caption>
            <thead>
              <tr>
                <th>Mês</th>
                <th>OTIF</th>
                <th>On Time</th>
                <th>In Full</th>
                <th>Avaliados</th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((d) => (
                <tr key={d.mes}>
                  <td>{fmtMes(d.mes)}</td>
                  <td>{fmtPct(d.otif_pct)}%</td>
                  <td>{fmtPct(d.on_time_pct)}%</td>
                  <td>{fmtPct(d.in_full_pct)}%</td>
                  <td>{d.total_avaliados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
