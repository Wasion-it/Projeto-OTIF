import { CaretRight, Clock, Hourglass, Package, Warning } from "@phosphor-icons/react";
import MetricCard from "../components/MetricCard.jsx";
import MetaChip from "../components/MetaChip.jsx";
import Regua from "../components/Regua.jsx";
import OtifTrend from "../components/OtifTrend.jsx";
import MotivosFalha from "../components/MotivosFalha.jsx";
import OtifClientes from "../components/OtifClientes.jsx";
import PeriodoRapido from "../components/PeriodoRapido.jsx";
import { META_OTIF_PADRAO, fmtInteiro, tom, fmtPct } from "../lib/format.js";

function SkeletonStrip() {
  return (
    <div className="sk-strip" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="sk-seg" key={i}>
          <div className="skeleton sk-line" style={{ width: "40%" }} />
          <div className="skeleton sk-line big" />
          <div className="skeleton sk-line" style={{ width: "75%", marginBottom: 0 }} />
        </div>
      ))}
    </div>
  );
}

// Proporção dos pendentes por situação numa única barra. A faixa zebrada é a
// mesma usada nas linhas vencidas da tabela: um só sinal para "prazo estourado".
function DistribuicaoPendentes({ vencidos, atencao, noPrazo }) {
  const total = vencidos + atencao + noPrazo;
  if (total === 0) return null;
  const partes = [
    { cls: "d-ruim", n: vencidos, rotulo: "vencidos" },
    { cls: "d-medio", n: atencao, rotulo: "em atenção" },
    { cls: "d-bom", n: noPrazo, rotulo: "no prazo" },
  ].filter((p) => p.n > 0);

  const descricao = partes
    .map((p) => `${fmtInteiro(p.n)} ${p.rotulo} (${fmtPct((p.n / total) * 100)}%)`)
    .join(", ");

  return (
    <div className="risk-dist" role="img" aria-label={`Distribuição dos pendentes: ${descricao}`}>
      {partes.map((p) => (
        <span
          key={p.cls}
          className={p.cls}
          style={{ flexGrow: p.n }}
          title={`${fmtInteiro(p.n)} ${p.rotulo}`}
        />
      ))}
    </div>
  );
}

export default function VisaoGeral({
  metricas,
  tendencia,
  clientes,
  carregando,
  filtros,
  meta = META_OTIF_PADRAO,
  diasAlerta = 7,
  onPeriodo,
  onRemoverCliente,
  onDrillSituacao,
  onDrillSemContractDate,
}) {
  const semContractDate = metricas?.total_sem_contract_date || 0;

  return (
    <>
      <PeriodoRapido
        filtros={filtros}
        onPeriodo={onPeriodo}
        onRemoverCliente={onRemoverCliente}
      />

      {!metricas ? (
        carregando ? (
          <SkeletonStrip />
        ) : null
      ) : (
        <>
          <section className="kpi-strip" aria-label="Indicadores do recorte">
            <MetricCard
              hero
              titulo="OTIF no recorte"
              valor={fmtPct(metricas.otif_pct)}
              sufixo="%"
              tom={tom(metricas.otif_pct, meta)}
              rodape={
                <>
                  <Regua
                    valor={metricas.otif_pct}
                    meta={meta}
                    tom={tom(metricas.otif_pct, meta)}
                  />
                  <MetaChip pct={metricas.otif_pct} meta={meta} />
                  <div className="metric-sub">
                    {fmtInteiro(metricas.otif_ok)} de {fmtInteiro(metricas.total_avaliados)}{" "}
                    pedidos entregues no prazo e completos
                  </div>
                </>
              }
            />
            <MetricCard
              titulo="On Time"
              icone={<Clock size={16} aria-hidden="true" />}
              valor={fmtPct(metricas.on_time_pct)}
              sufixo="%"
              tom={tom(metricas.on_time_pct, meta)}
              rodape={
                <>
                  <Regua
                    valor={metricas.on_time_pct}
                    meta={meta}
                    tom={tom(metricas.on_time_pct, meta)}
                  />
                  <div className="metric-sub">entregas até o Contract Date</div>
                </>
              }
            />
            <MetricCard
              titulo="In Full"
              icone={<Package size={16} aria-hidden="true" />}
              valor={fmtPct(metricas.in_full_pct)}
              sufixo="%"
              tom={tom(metricas.in_full_pct, meta)}
              rodape={
                <>
                  <Regua
                    valor={metricas.in_full_pct}
                    meta={meta}
                    tom={tom(metricas.in_full_pct, meta)}
                  />
                  <div className="metric-sub">entregas completas, sem falta ou avaria</div>
                </>
              }
            />
            <MetricCard
              titulo="Pendentes"
              icone={<Hourglass size={16} aria-hidden="true" />}
              valor={fmtInteiro(metricas.total_pendentes)}
              tom="neutro"
              rodape="pedidos ainda sem resultado de OTIF"
            />
          </section>

          {semContractDate > 0 && (
            <button type="button" className="contract-date-alert" onClick={onDrillSemContractDate}>
              <span className="contract-date-alert-count">{fmtInteiro(semContractDate)}</span>
              <span>
                <strong>
                  {semContractDate === 1
                    ? "pedido sem Contract Date"
                    : "pedidos sem Contract Date"}
                </strong>
                <small>
                  Corrija a data de entrega no pedido do JUND. Esses pedidos ficam fora das
                  taxas.
                </small>
              </span>
              <span className="contract-date-alert-action">
                Ver pedidos
                <CaretRight size={14} weight="bold" aria-hidden="true" />
              </span>
            </button>
          )}

          <section className="risk-block" aria-labelledby="risco-titulo">
            <div className="risk-head">
              <h2 className="risk-head-titulo" id="risco-titulo">
                Pendentes por Contract Date
              </h2>
              <span className="risk-sub">
                Atenção quando faltam até {diasAlerta} dias. Clique numa faixa para abrir a
                lista.
              </span>
            </div>
            <DistribuicaoPendentes
              vencidos={metricas.pendentes_vencidos || 0}
              atencao={metricas.pendentes_atencao || 0}
              noPrazo={metricas.pendentes_no_prazo || 0}
            />
            <div className="risk-bar">
              <MetricCard
                className="risk-item"
                titulo="Vencidos"
                icone={<Warning size={16} weight="fill" color="var(--danger)" aria-hidden="true" />}
                valor={fmtInteiro(metricas.pendentes_vencidos)}
                tom="ruim"
                rodape="Contract Date ultrapassado"
                onClick={() => onDrillSituacao("vencido")}
              />
              <MetricCard
                className="risk-item"
                titulo="Atenção"
                icone={<Clock size={16} weight="fill" color="var(--warning-solid)" aria-hidden="true" />}
                valor={fmtInteiro(metricas.pendentes_atencao)}
                tom="medio"
                rodape={`faltam até ${diasAlerta} dias`}
                onClick={() => onDrillSituacao("atencao")}
              />
              <MetricCard
                className="risk-item"
                titulo="No prazo"
                icone={<Clock size={16} color="var(--success)" aria-hidden="true" />}
                valor={fmtInteiro(metricas.pendentes_no_prazo)}
                tom="bom"
                rodape="com folga até o Contract Date"
                onClick={() => onDrillSituacao("no_prazo")}
              />
            </div>
          </section>

          <OtifTrend dados={tendencia} meta={meta} />

          <section className="panels-2">
            <MotivosFalha motivos={metricas.motivos_falha} />
            <OtifClientes clientes={clientes} meta={meta} />
          </section>
        </>
      )}
    </>
  );
}
