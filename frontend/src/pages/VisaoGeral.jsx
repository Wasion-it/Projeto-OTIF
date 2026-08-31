import MetricCard from "../components/MetricCard.jsx";
import MetaChip from "../components/MetaChip.jsx";
import OtifTrend from "../components/OtifTrend.jsx";
import MotivosFalha from "../components/MotivosFalha.jsx";
import { META_OTIF, tom, fmtPct } from "../lib/format.js";

function SkeletonStrip() {
  return (
    <div className="sk-strip" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="sk-seg" key={i}>
          <div className="skeleton sk-line" style={{ width: "50%" }} />
          <div className="skeleton sk-line big" />
          <div className="skeleton sk-line" style={{ width: "70%", marginBottom: 0 }} />
        </div>
      ))}
    </div>
  );
}

export default function VisaoGeral({ metricas, tendencia, carregando, info, onDrillSituacao }) {
  if (!metricas) {
    return carregando ? <SkeletonStrip /> : null;
  }

  return (
    <>
      <section className="kpi-strip">
        <MetricCard
          hero
          titulo="OTIF"
          valor={fmtPct(metricas.otif_pct)}
          sufixo="%"
          tom={tom(metricas.otif_pct)}
          rodape={
            <>
              <MetaChip pct={metricas.otif_pct} />
              <div className="metric-sub">
                {metricas.otif_ok} de {metricas.total_avaliados} avaliados
              </div>
            </>
          }
        />
        <MetricCard
          titulo="On Time"
          valor={fmtPct(metricas.on_time_pct)}
          sufixo="%"
          tom={tom(metricas.on_time_pct)}
          rodape="entregas no prazo"
        />
        <MetricCard
          titulo="In Full"
          valor={fmtPct(metricas.in_full_pct)}
          sufixo="%"
          tom={tom(metricas.in_full_pct)}
          rodape="entregas completas"
        />
        <MetricCard
          titulo="Pendentes"
          valor={metricas.total_pendentes}
          tom="neutro"
          rodape="aguardando confirmação"
        />
      </section>

      <section className="risk-block">
        <div className="risk-head">
          <span className="risk-head-titulo">Pendentes por prazo</span>
          <span className="risk-sub">
            entrega em até {info?.prazo_entrega_dias ?? "?"} dias — clique para confirmar
          </span>
        </div>
        <div className="risk-bar">
          <MetricCard
            className="risk-item"
            titulo="Vencidos"
            valor={metricas.pendentes_vencidos}
            tom="ruim"
            rodape="prazo já estourou"
            onClick={() => onDrillSituacao("vencido")}
          />
          <MetricCard
            className="risk-item"
            titulo="Atenção"
            valor={metricas.pendentes_atencao}
            tom="medio"
            rodape="prazo se aproximando"
            onClick={() => onDrillSituacao("atencao")}
          />
          <MetricCard
            className="risk-item"
            titulo="No prazo"
            valor={metricas.pendentes_no_prazo}
            tom="bom"
            rodape="folga confortável"
            onClick={() => onDrillSituacao("no_prazo")}
          />
        </div>
      </section>

      <section className="panels-2">
        <OtifTrend dados={tendencia} meta={META_OTIF} />
        <MotivosFalha motivos={metricas.motivos_falha} />
      </section>
    </>
  );
}
