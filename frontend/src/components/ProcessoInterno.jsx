import { GRUPOS_PROCESSO, nomeEtapa } from "../lib/etapas.js";
import Diferenca, { diferenca } from "./Diferenca.jsx";
import { fmtDias, fmtInteiro, fmtPct } from "../lib/format.js";

// Faixa do 25º ao 90º percentil dos dias, com um traço na meta. A escala é a
// mesma em todas as linhas, então uma etapa muito mais lenta salta aos olhos.
function Distribuicao({ etapa, escala, destaque }) {
  if (etapa.dias_p25 == null || etapa.dias_p90 == null) {
    return <span className="txt-sec">—</span>;
  }
  const pos = (dias) => Math.min(100, (dias / escala) * 100);
  const largura = Math.max(2, pos(etapa.dias_p90) - pos(etapa.dias_p25));
  const inicio = Math.min(pos(etapa.dias_p25), 100 - largura);
  const resumo =
    `Maioria dos pedidos entre ${fmtPct(etapa.dias_p25)} e ${fmtPct(etapa.dias_p90)} dias` +
    (etapa.dias_mediana != null ? `, mediana ${fmtPct(etapa.dias_mediana)} dias` : "") +
    (etapa.meta_dias != null ? `, meta ${etapa.meta_dias} dias` : "");

  return (
    <span className="dist" title={resumo}>
      <span className="dist-trilho" aria-hidden="true">
        <span
          className={`dist-faixa ${destaque ? "forte" : ""}`}
          style={{ left: `${inicio}%`, width: `${largura}%` }}
        />
        {etapa.meta_dias != null && (
          <span className="dist-meta" style={{ left: `${pos(etapa.meta_dias)}%` }} />
        )}
      </span>
      <span className="sr-only">{resumo}</span>
    </span>
  );
}

function soma(lista) {
  return lista.length ? lista.reduce((total, valor) => total + valor, 0) : null;
}

// Subtotal só com as etapas do grupo que têm meta e realizado, para a
// diferença comparar o mesmo conjunto dos dois lados.
function subtotal(etapas) {
  const comDados = etapas.filter((e) => e.dias_medio != null && e.meta_dias != null);
  return {
    meta: soma(comDados.map((e) => e.meta_dias)),
    realizado: soma(comDados.map((e) => e.dias_medio)),
    emAndamento: etapas.reduce((total, e) => total + e.em_andamento, 0),
    acimaMeta: etapas.reduce((total, e) => total + e.acima_meta, 0),
  };
}

function Valor({ dias, forte = false }) {
  if (dias == null) return <span className="txt-sec">—</span>;
  return <span className={forte ? "peso-500" : ""}>{fmtDias(Math.round(dias * 10) / 10)}</span>;
}

// Onde o processo interno perde tempo: meta global x realizado por etapa,
// agrupado por trecho do fluxo, com os pedidos parados hoje ao lado.
export default function ProcessoInterno({ processo, onAbrirEtapa, onAbrirAjustes }) {
  const porChave = Object.fromEntries((processo?.etapas || []).map((e) => [e.chave, e]));
  const grupos = GRUPOS_PROCESSO.map((g) => ({
    ...g,
    itens: g.etapas.map((chave) => porChave[chave]).filter(Boolean),
  })).filter((g) => g.itens.length > 0);

  const escala = Math.max(
    1,
    ...grupos.flatMap((g) => g.itens.flatMap((e) => [e.dias_p90 || 0, e.meta_dias || 0]))
  );
  const difTotal = diferenca(processo?.lead_time_medio, processo?.lead_time_meta);

  return (
    <section className="bloco" aria-labelledby="processo-titulo">
      <div className="secao-titulo">
        <h2 id="processo-titulo">Processo interno</h2>
        <span className="secao-titulo-acoes">
          {processo && (
            <span className="txt-sec">
              {fmtInteiro(processo.total_em_processo)} em andamento ·{" "}
              {fmtInteiro(processo.total_concluido)} concluídos
            </span>
          )}
          {onAbrirAjustes && (
            <button type="button" className="btn btn-texto btn-p" onClick={onAbrirAjustes}>
              Ajustar metas
            </button>
          )}
        </span>
      </div>

      {!processo ? (
        <p className="txt-sec">Carregando…</p>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela tabela-mini tabela-processo">
            <thead>
              <tr>
                <th>Etapa</th>
                <th className="num">Meta</th>
                <th className="num">Realizado</th>
                <th className="num">Diferença</th>
                <th>Distribuição dos dias</th>
                <th className="num">Em andamento</th>
                <th className="num">Acima da meta</th>
              </tr>
            </thead>
            {grupos.map((grupo) => {
              const sub = subtotal(grupo.itens);
              return (
                <tbody key={grupo.nome}>
                  <tr className="linha-grupo">
                    <th scope="rowgroup">{grupo.nome}</th>
                    <td className="num">{sub.meta == null ? "" : fmtDias(sub.meta)}</td>
                    <td className="num">{sub.realizado == null ? "" : fmtDias(Math.round(sub.realizado * 10) / 10)}</td>
                    <td className="num">
                      {sub.meta == null ? "" : <Diferenca valor={diferenca(sub.realizado, sub.meta)} />}
                    </td>
                    <td />
                    <td className="num">{fmtInteiro(sub.emAndamento)}</td>
                    <td className="num">{fmtInteiro(sub.acimaMeta)}</td>
                  </tr>
                  {grupo.itens.map((e) => {
                    const destaque = e.chave === processo.maior_desvio;
                    const nome = nomeEtapa(e.chave, e.nome);
                    return (
                      <tr key={e.chave} className="linha-etapa">
                        <td>
                          {nome}
                          {destaque && <span className="selo">maior desvio</span>}
                        </td>
                        <td className="num txt-sec">
                          {e.meta_dias == null ? "—" : fmtDias(e.meta_dias)}
                        </td>
                        <td className="num">
                          <Valor dias={e.dias_medio} forte={destaque} />
                        </td>
                        <td className="num">
                          <Diferenca valor={diferenca(e.dias_medio, e.meta_dias)} destaque={destaque} />
                        </td>
                        <td>
                          <Distribuicao etapa={e} escala={escala} destaque={destaque} />
                        </td>
                        <td className="num">
                          {e.em_andamento > 0 ? (
                            <button
                              type="button"
                              className="link-pedido"
                              onClick={() => onAbrirEtapa(e.chave)}
                              aria-label={`Ver os ${e.em_andamento} pedidos em ${nome}`}
                            >
                              {fmtInteiro(e.em_andamento)}
                            </button>
                          ) : (
                            <span className="txt-sec">0</span>
                          )}
                        </td>
                        <td className="num">
                          {e.acima_meta > 0 ? (
                            <>
                              <span className="tom-erro peso-500">{fmtInteiro(e.acima_meta)}</span>
                              <span className="txt-sec"> · mais antigo {fmtDias(e.parado_max_dias)}</span>
                            </>
                          ) : (
                            <span className="txt-sec">0</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
            <tfoot>
              <tr className="linha-total">
                <th scope="row">Lead time (pedido → entrega)</th>
                <td className="num txt-sec">
                  {processo.lead_time_meta == null ? "—" : fmtDias(processo.lead_time_meta)}
                </td>
                <td className="num">
                  <Valor dias={processo.lead_time_medio} forte />
                </td>
                <td className="num">
                  <Diferenca valor={difTotal} destaque />
                </td>
                <td colSpan={3} className="txt-sec">
                  {processo.lead_time_n > 0
                    ? `média de ${fmtInteiro(processo.lead_time_n)} ${
                        processo.lead_time_n === 1 ? "pedido entregue" : "pedidos entregues"
                      }`
                    : "nenhum pedido entregue no recorte"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="legenda">
        Meta: valor global por etapa, definido em Ajustes. Realizado: média dos pedidos que já
        passaram pela etapa; os parados hoje aparecem em “Acima da meta”. A faixa mostra onde fica
        a maioria dos pedidos (do 25º ao 90º percentil) e o traço marca a meta. As etapas podem não
        somar o lead time, por exemplo quando o Comercial agenda antes de a produção terminar.
      </p>
    </section>
  );
}
