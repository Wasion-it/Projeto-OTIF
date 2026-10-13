import { useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react";
import { useLarguraElemento } from "../hooks/useLarguraElemento.js";
import { fmtInteiro, fmtPct } from "../lib/format.js";

const ALTURA = 200;
const RECUO = 22; // folga lateral para o primeiro e o último ponto não colarem na borda

function fmtMes(mes) {
  // "2026-08" -> "08/26"
  return `${mes.slice(5, 7)}/${mes.slice(2, 4)}`;
}

// A escala começa um pouco abaixo do menor valor (ou da meta) em vez de zero:
// com valores entre 88% e 97%, uma escala 0–100 achata justamente a variação
// que interessa.
function escala(valores, meta) {
  const minimo = Math.min(...valores, meta);
  const base = Math.max(0, Math.floor(minimo - 4));
  const yMin = base >= 98 ? 90 : base;
  return { yMin, yMax: 100 };
}

export default function OtifTrend({ dados, meta = 95 }) {
  const plotRef = useRef(null);
  const largura = useLarguraElemento(plotRef);
  const [ativo, setAtivo] = useState(null);

  const pontos = (dados || []).filter((d) => d.total_avaliados > 0);
  const ultimo = pontos[pontos.length - 1];
  const anterior = pontos[pontos.length - 2];
  const delta =
    ultimo && anterior ? Math.round((ultimo.otif_pct - anterior.otif_pct) * 10) / 10 : null;

  const { yMin, yMax } = pontos.length
    ? escala(
        pontos.map((d) => d.otif_pct),
        meta
      )
    : { yMin: 0, yMax: 100 };

  const razao = (valor) => (valor - yMin) / (yMax - yMin);
  const posY = (valor) => ALTURA - razao(valor) * ALTURA;
  const posX = (indice) =>
    pontos.length === 1
      ? largura / 2
      : RECUO + (indice * (largura - RECUO * 2)) / (pontos.length - 1);

  const coordenadas = pontos.map((d, i) => ({ x: posX(i), y: posY(d.otif_pct), d }));
  const linha = coordenadas.map((p) => `${p.x},${p.y}`).join(" ");
  const area = coordenadas.length
    ? [
        `M${coordenadas[0].x},${ALTURA}`,
        ...coordenadas.map((p) => `L${p.x},${p.y}`),
        `L${coordenadas[coordenadas.length - 1].x},${ALTURA}`,
        "Z",
      ].join(" ")
    : "";
  const yMeta = posY(meta);
  const grade = [yMin, Math.round((yMin + yMax) / 2), yMax];
  const pontoAtivo = ativo != null ? coordenadas[ativo] : null;

  return (
    <section className="panel" aria-labelledby="otif-mes-titulo">
      <div className="panel-head">
        <h3 id="otif-mes-titulo">OTIF por mês</h3>
        {ultimo && (
          <span className="panel-hint">
            {fmtMes(ultimo.mes)}: <b>{fmtPct(ultimo.otif_pct)}%</b>
            {delta != null && (
              <span className={delta >= 0 ? "up" : "down"}>
                {delta >= 0 ? (
                  <ArrowUpRight size={13} weight="bold" aria-hidden="true" />
                ) : (
                  <ArrowDownRight size={13} weight="bold" aria-hidden="true" />
                )}
                {fmtPct(Math.abs(delta))} p.p.
                <span className="sr-only">
                  {delta >= 0 ? "acima" : "abaixo"} do mês anterior
                </span>
              </span>
            )}
          </span>
        )}
      </div>

      {pontos.length === 0 ? (
        <p className="vazio">Sem meses com pedidos avaliados no período selecionado.</p>
      ) : (
        <>
          <div className="grafico">
            <div className="grafico-y" style={{ height: ALTURA }} aria-hidden="true">
              {/* Meta colada no topo: o rótulo da meta basta, 100% sairia sobreposto. */}
              {yMeta > 16 && <span style={{ top: 0 }}>{yMax}%</span>}
              <span className="grafico-y-meta" style={{ top: `${(1 - razao(meta)) * 100}%` }}>
                {meta}%
              </span>
              <span style={{ top: "100%" }}>{yMin}%</span>
            </div>

            <div
              className="grafico-plot"
              ref={plotRef}
              style={{ height: ALTURA }}
              onMouseLeave={() => setAtivo(null)}
            >
              {largura > 0 && (
                <svg
                  width={largura}
                  height={ALTURA}
                  role="group"
                  aria-label={`Evolução do OTIF por mês. Último mês ${fmtMes(
                    ultimo.mes
                  )} com ${fmtPct(ultimo.otif_pct)} por cento. Meta ${meta} por cento.`}
                >
                  <defs>
                    <linearGradient id="grad-otif" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#2f49c6" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#2f49c6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {grade.map((g) => (
                    <line
                      key={g}
                      className="grafico-grade"
                      x1={0}
                      x2={largura}
                      y1={posY(g)}
                      y2={posY(g)}
                    />
                  ))}
                  <rect
                    className="grafico-zona-abaixo"
                    x={0}
                    y={yMeta}
                    width={largura}
                    height={Math.max(0, ALTURA - yMeta)}
                  />
                  <line
                    className="grafico-meta"
                    x1={0}
                    x2={largura}
                    y1={yMeta}
                    y2={yMeta}
                  />
                  <path className="grafico-area" d={area} />
                  {coordenadas.length > 1 && (
                    <polyline className="grafico-linha" points={linha} />
                  )}
                  {coordenadas.map((p, i) => {
                    const abaixo = p.d.otif_pct < meta;
                    const derradeiro = i === coordenadas.length - 1;
                    const destaque = derradeiro || ativo === i;
                    return (
                      <g key={p.d.mes}>
                        <circle
                          className={`grafico-ponto ${abaixo ? "abaixo" : ""} ${
                            destaque ? "ultimo" : ""
                          }`}
                          cx={p.x}
                          cy={p.y}
                          r={destaque ? 5 : 3.5}
                        />
                        {coordenadas.length <= 14 && (
                          <text
                            className={`grafico-valor ${abaixo ? "abaixo" : ""}`}
                            x={p.x}
                            y={p.y < 20 ? p.y + 19 : p.y - 11}
                            textAnchor="middle"
                            aria-hidden="true"
                          >
                            {Math.round(p.d.otif_pct)}
                          </text>
                        )}
                        {/* Alvo maior que o ponto: hover, toque e foco por teclado */}
                        <circle
                          className="grafico-alvo"
                          cx={p.x}
                          cy={p.y}
                          r={14}
                          tabIndex={0}
                          role="img"
                          aria-label={`${fmtMes(p.d.mes)}: ${fmtPct(
                            p.d.otif_pct
                          )}% de OTIF em ${p.d.total_avaliados} pedidos avaliados${
                            abaixo ? ", abaixo da meta" : ""
                          }`}
                          onMouseEnter={() => setAtivo(i)}
                          onFocus={() => setAtivo(i)}
                          onBlur={() => setAtivo(null)}
                        />
                      </g>
                    );
                  })}
                </svg>
              )}

              {pontoAtivo && (
                <div
                  className="grafico-tooltip"
                  style={{ left: pontoAtivo.x, top: pontoAtivo.y }}
                  aria-hidden="true"
                >
                  {fmtMes(pontoAtivo.d.mes)}
                  <strong className={pontoAtivo.d.otif_pct < meta ? "abaixo" : ""}>
                    {fmtPct(pontoAtivo.d.otif_pct)}%
                  </strong>
                  {fmtInteiro(pontoAtivo.d.total_avaliados)} pedidos avaliados
                </div>
              )}
            </div>

            <div className="grafico-x" aria-hidden="true">
              {largura > 0 &&
                coordenadas.map((p) => (
                  <span key={p.d.mes} style={{ left: p.x }}>
                    {fmtMes(p.d.mes)}
                  </span>
                ))}
            </div>
          </div>

          <div className="grafico-legenda" aria-hidden="true">
            <span>
              <i className="leg-linha" /> OTIF do mês
            </span>
            <span>
              <i className="leg-meta" /> Meta {fmtPct(meta)}%
            </span>
            <span>
              <i className="leg-abaixo" /> Mês abaixo da meta
            </span>
          </div>
        </>
      )}
    </section>
  );
}
