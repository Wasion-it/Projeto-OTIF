import { useMemo } from "react";
import Diferenca, { diferenca } from "./Diferenca.jsx";
import { nomeEtapa } from "../lib/etapas.js";
import { fmtDataCurta, fmtDataHora, fmtDataIso, fmtDias } from "../lib/format.js";
import { isoDeDia, montarProcessoPedido } from "../lib/processoPedido.js";

const dataDia = (dia) => fmtDataCurta(isoDeDia(dia));

function textoEtapa(etapa, processo, atual) {
  if (etapa.chave === "estoque" && etapa.data_hora) {
    return `Embarcou em ${fmtDataHora(etapa.data_hora)}`;
  }
  if ((etapa.chave === "lem" || etapa.chave === "producao") && etapa.data_inicio_hora && etapa.data_hora) {
    return `${fmtDataHora(etapa.data_inicio_hora)} → ${fmtDataHora(etapa.data_hora)}`;
  }
  if (etapa.data_hora) return fmtDataHora(etapa.data_hora);
  if (etapa.data) return fmtDataIso(etapa.data);
  // Produção automática já iniciada, mas ainda com lotes por completar.
  if (etapa.chave === "producao" && etapa.data_inicio_hora) {
    return `Em andamento desde ${fmtDataHora(etapa.data_inicio_hora)}`;
  }
  if (!atual) return null;
  if (etapa.chave === "faturamento") return "Aguardando o ERP";
  if (etapa.chave === "estoque") return "Faturado, aguardando embarque no ERP";
  if (etapa.chave === "lem" && processo.lem_aguardando_inicio) {
    return "Aguardando a data agendada";
  }
  return null;
}

// Texto equivalente à barra, para leitor de tela e dica ao passar o mouse.
function descricaoPeriodo(linha) {
  if (linha.estado === "feita") {
    return `Realizado de ${dataDia(linha.ini)} a ${dataDia(linha.fim)}, ${linha.dias} dias`;
  }
  if (linha.estado === "atual") {
    return linha.aguardando
      ? `Começa em ${dataDia(linha.ini)}`
      : `Em andamento desde ${dataDia(linha.ini)}, ${linha.dias} dias`;
  }
  if (linha.estado === "sem_calculo") {
    return `Concluída em ${dataDia(linha.fim)}, mas a etapa anterior não foi registrada`;
  }
  return null;
}

function Barra({ linha, pos, largura }) {
  const { dias, meta, estado } = linha;
  const dentro = meta != null && dias > meta ? meta : dias;
  const pctDentro = dias > 0 ? (dentro / dias) * 100 : 100;
  return (
    <span
      className={`pp-barra ${estado === "atual" ? "atual" : ""}`}
      style={{ left: `${pos(linha.ini)}%`, width: `${largura(linha.ini, linha.fim)}%` }}
      title={descricaoPeriodo(linha)}
    >
      <span className="pp-dentro" style={{ width: `${pctDentro}%` }} />
      {pctDentro < 100 && <span className="pp-excesso" style={{ width: `${100 - pctDentro}%` }} />}
    </span>
  );
}

function Linha({ linha, modelo, processo }) {
  const { eixo, hoje, contract } = modelo;
  const { etapa, estado, meta } = linha;
  const pos = (dia) => ((dia - eixo.min) / eixo.span) * 100;
  const largura = (ini, fim) => ((fim - ini) / eixo.span) * 100;

  const atual = estado === "atual";
  const futura = estado === "futura";
  const detalhe = textoEtapa(etapa, processo, atual);

  // Diferença só vale para quem já terminou ou já estourou a meta: uma etapa em
  // andamento dentro da meta não está "adiantada", ainda não acabou.
  const dif =
    estado === "feita"
      ? diferenca(linha.dias, meta)
      : atual && meta != null && linha.dias > meta
        ? linha.dias - meta
        : null;

  return (
    <tr className={`pp-linha ${estado}`}>
      <th scope="row" className="pp-etapa">
        <span className={atual ? "peso-500" : futura ? "txt-sec" : ""}>
          {nomeEtapa(etapa.chave, etapa.nome)}
        </span>
        {detalhe && <span className="pp-nota">{detalhe}</span>}
        {etapa.data_agendada && (
          <span className="pp-nota">Agendada para {fmtDataIso(etapa.data_agendada)}</span>
        )}
        {etapa.obs && <span className="tl-obs">{etapa.obs}</span>}
      </th>
      <td className="pp-gantt">
        <span className="pp-area">
          {hoje != null && <span className="pp-hoje" style={{ left: `${pos(hoje)}%` }} />}
          {contract != null && <span className="pp-contract" style={{ left: `${pos(contract)}%` }} />}

          {(estado === "feita" || (atual && !linha.aguardando)) && (
            <Barra linha={linha} pos={pos} largura={largura} />
          )}
          {estado === "sem_calculo" && (
            <span
              className="pp-ponto"
              style={{ left: `${pos(linha.fim)}%` }}
              title={descricaoPeriodo(linha)}
            />
          )}
          {linha.projFim != null && linha.projFim > linha.projIni && (
            <span
              className="pp-proj"
              style={{
                left: `${pos(linha.projIni)}%`,
                width: `${largura(linha.projIni, linha.projFim)}%`,
              }}
              title={`Pela meta: ${dataDia(linha.projIni)} a ${dataDia(linha.projFim)}`}
            />
          )}
        </span>
        {descricaoPeriodo(linha) && <span className="sr-only">{descricaoPeriodo(linha)}</span>}
        {linha.projFim != null && linha.projFim > linha.projIni && (
          <span className="sr-only">
            Projetado pela meta de {dataDia(linha.projIni)} a {dataDia(linha.projFim)}
          </span>
        )}
      </td>
      <td className="num txt-sec">{meta == null ? "—" : fmtDias(meta)}</td>
      <td className="num">
        {estado === "feita" ? (
          fmtDias(linha.dias)
        ) : atual ? (
          linha.aguardando ? (
            <span className="txt-sec">—</span>
          ) : (
            `há ${fmtDias(linha.dias)}`
          )
        ) : (
          <span className="txt-sec">—</span>
        )}
      </td>
      <td className="num">
        <Diferenca valor={dif} />
      </td>
    </tr>
  );
}

function Chave({ classe, children }) {
  return (
    <span className="pp-chave">
      <span className={`pp-amostra ${classe}`} aria-hidden="true" />
      {children}
    </span>
  );
}

// Meta x realizado de um pedido: uma linha por etapa, faixa em dias corridos,
// marcadores de Hoje e Contract Date e, nos pendentes, a projeção pela meta.
export default function ProcessoPedido({ pedido, metasDias }) {
  const modelo = useMemo(() => montarProcessoPedido(pedido, metasDias), [pedido, metasDias]);
  const processo = pedido.processo;
  if (!modelo) return <p className="txt-sec">Sem dados de processo.</p>;

  const { eixo, projecao, hoje, contract } = modelo;
  const fechado = modelo.leadTime != null;
  const difTotal = fechado ? diferenca(modelo.leadTime, modelo.metaTotal) : null;

  let resumo = null;
  if (projecao) {
    const quando = dataDia(projecao.fim);
    if (projecao.folga == null) {
      resumo = { tom: "neutro", texto: `Pela meta das etapas restantes, entrega em ${quando}. Sem Contract Date para comparar.` };
    } else if (projecao.folga < 0) {
      resumo = { tom: "erro", texto: `Pela meta das etapas restantes, entrega em ${quando}, ${-projecao.folga}d depois do Contract Date.` };
    } else if (projecao.folga === 0) {
      resumo = { tom: "atencao", texto: `Pela meta das etapas restantes, entrega em ${quando}, no dia do Contract Date.` };
    } else {
      resumo = { tom: "ok", texto: `Pela meta das etapas restantes, entrega em ${quando}, ${projecao.folga}d antes do Contract Date.` };
    }
  }

  return (
    <>
      {resumo && <p className={`pp-resumo tom-${resumo.tom} peso-500`}>{resumo.texto}</p>}
      {modelo.semProjecao && <p className="pp-resumo txt-sec">{modelo.semProjecao}</p>}

      <div className="tabela-wrap pp-wrap">
        <table className="tabela tabela-mini pp">
          <thead>
            <tr>
              <th scope="col">Etapa</th>
              <th scope="col" className="pp-eixo">
                <span>{dataDia(eixo.min)}</span>
                <span>{dataDia(eixo.min + eixo.span)}</span>
              </th>
              <th scope="col" className="num">Meta</th>
              <th scope="col" className="num">Realizado</th>
              <th scope="col" className="num">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {modelo.linhas.map((linha) => (
              <Linha key={linha.chave} linha={linha} modelo={modelo} processo={processo} />
            ))}
          </tbody>
          <tfoot>
            <tr className="pp-total">
              <th scope="row" className="pp-etapa">
                {fechado ? "Lead time (pedido → entrega)" : "Desde o pedido"}
              </th>
              <td />
              <td className="num txt-sec">
                {modelo.metaTotal == null ? "—" : fmtDias(modelo.metaTotal)}
              </td>
              <td className="num peso-500">
                {fechado ? fmtDias(modelo.leadTime) : `há ${fmtDias(modelo.decorrido)}`}
              </td>
              <td className="num">
                <Diferenca valor={difTotal} destaque />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="pp-legenda">
        <Chave classe="dentro">Dentro da meta</Chave>
        <Chave classe="excesso">Acima da meta</Chave>
        {modelo.aberto && <Chave classe="atual">Em andamento</Chave>}
        {projecao && <Chave classe="proj">Pela meta (projetado)</Chave>}
        {hoje != null && <Chave classe="hoje">Hoje, {dataDia(hoje)}</Chave>}
        {contract != null && <Chave classe="contract">Contract Date, {dataDia(contract)}</Chave>}
      </p>
      <p className="legenda">
        Tempos em dias corridos, a partir da etapa anterior.
        {projecao &&
          " A projeção soma o que falta da etapa atual e a meta das seguintes; se a etapa atual passar da meta, a data piora."}
      </p>
    </>
  );
}
