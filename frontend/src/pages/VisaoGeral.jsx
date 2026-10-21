import PeriodoRapido from "../components/PeriodoRapido.jsx";
import OtifTrend from "../components/OtifTrend.jsx";
import ProcessoInterno from "../components/ProcessoInterno.jsx";
import MotivosFalha from "../components/MotivosFalha.jsx";
import OtifClientes from "../components/OtifClientes.jsx";
import { META_OTIF_PADRAO, fmtInteiro, fmtPct } from "../lib/format.js";

function Link({ children, onClick, tom }) {
  return (
    <button type="button" className={`link-pedido ${tom ? `tom-${tom}` : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

// Resultado primeiro (OTIF contra a meta), depois onde está o trabalho e as
// causas. Cada número que leva a uma lista de pedidos é clicável.
export default function VisaoGeral({
  metricas,
  tendencia,
  clientes,
  processo,
  carregando,
  filtros,
  meta = META_OTIF_PADRAO,
  diasAlerta = 7,
  onPeriodo,
  onRemoverCliente,
  onAbrirPedidos,
  onAbrirAjustes,
}) {
  return (
    <>
      <PeriodoRapido filtros={filtros} onPeriodo={onPeriodo} onRemoverCliente={onRemoverCliente} />

      {!metricas ? (
        carregando ? (
          <div className="resumo" aria-hidden="true">
            <span className="esqueleto esqueleto-grande" />
            <span className="esqueleto" />
          </div>
        ) : null
      ) : (
        <>
          <section className="resumo" aria-labelledby="resumo-titulo">
            <h2 id="resumo-titulo" className="sr-only">
              Resultado do recorte
            </h2>
            <div className="resumo-principal">
              <span className="resumo-rotulo">OTIF</span>
              <span className={`numero-principal ${metricas.otif_pct >= meta ? "tom-ok" : "tom-erro"}`}>
                {fmtPct(metricas.otif_pct)}%
              </span>
              <span className="txt-sec">
                meta {fmtPct(meta)}% ·{" "}
                {metricas.otif_pct >= meta
                  ? "na meta"
                  : `${fmtPct(Math.round((meta - metricas.otif_pct) * 10) / 10)} p.p. abaixo`}{" "}
                · {fmtInteiro(metricas.otif_ok)} de {fmtInteiro(metricas.total_avaliados)} avaliados
              </span>
            </div>
            <dl className="resumo-secundario">
              <div>
                <dt>On Time</dt>
                <dd>{fmtPct(metricas.on_time_pct)}%</dd>
              </div>
              <div>
                <dt>In Full</dt>
                <dd>{fmtPct(metricas.in_full_pct)}%</dd>
              </div>
              <div>
                <dt>Pendentes</dt>
                <dd>
                  <Link onClick={() => onAbrirPedidos({ status: "pendente" })}>
                    {fmtInteiro(metricas.total_pendentes)}
                  </Link>
                </dd>
              </div>
            </dl>
            <p className="resumo-pendentes">
              Dos pendentes:{" "}
              <Link tom="erro" onClick={() => onAbrirPedidos({ situacao_prazo: "vencido" })}>
                {fmtInteiro(metricas.pendentes_vencidos)} vencidos
              </Link>
              {" · "}
              <Link tom="atencao" onClick={() => onAbrirPedidos({ situacao_prazo: "atencao" })}>
                {fmtInteiro(metricas.pendentes_atencao)} vencem em até {diasAlerta} dias
              </Link>
              {" · "}
              <Link onClick={() => onAbrirPedidos({ situacao_prazo: "no_prazo" })}>
                {fmtInteiro(metricas.pendentes_no_prazo)} no prazo
              </Link>
              {metricas.total_sem_contract_date > 0 && (
                <>
                  {" · "}
                  <Link tom="atencao" onClick={() => onAbrirPedidos({ status: "sem_contract_date" })}>
                    {fmtInteiro(metricas.total_sem_contract_date)} sem Contract Date
                  </Link>{" "}
                  <span className="txt-sec">(fora das taxas até a correção no JUND)</span>
                </>
              )}
            </p>
          </section>

          <OtifTrend dados={tendencia} meta={meta} />

          <ProcessoInterno
            processo={processo}
            onAbrirEtapa={(etapa) => onAbrirPedidos({ etapa })}
            onAbrirAjustes={onAbrirAjustes}
          />

          <div className="grade-2">
            <MotivosFalha
              motivos={metricas.motivos_falha}
              onVerFalhas={() => onAbrirPedidos({ status: "falha" })}
            />
          </div>

          <OtifClientes clientes={clientes} onAbrirCliente={(cliente) => onAbrirPedidos({ cliente })} />
        </>
      )}
    </>
  );
}
