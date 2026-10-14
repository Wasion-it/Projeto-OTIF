import { useState } from "react";
import { api } from "../api.js";
import { fmtDataHora, fmtDataIso, formatarNotaFiscal } from "../lib/format.js";
import ModalDialog from "./ModalDialog.jsx";

// Editor administrativo de todas as etapas manuais. As etapas do ERP aparecem
// só para leitura, como referência.
const GRUPOS = [
  {
    titulo: "PCP",
    campos: [{ key: "pcp_data", label: "Planejamento concluído" }],
    obs: "pcp_obs",
  },
  {
    titulo: "Produção",
    campos: [
      { key: "producao_plan_inicio", label: "Início planejado" },
      { key: "producao_plan_fim", label: "Fim planejado" },
      { key: "producao_fim", label: "OPs finalizadas (real)" },
    ],
    obs: "producao_obs",
  },
  {
    titulo: "Comercial",
    campos: [
      { key: "comercial_data", label: "Agendamento registrado" },
      {
        key: "inspecao_agendada_data",
        label: "Inspeção agendada para",
        ajuda: "Pode ser futura. A inspeção pode ocorrer antes ou depois dela.",
      },
    ],
    obs: "comercial_obs",
  },
  {
    titulo: "Inspeção LEM",
    campos: [{ key: "lem_data", label: "Inspeção concluída (real)" }],
    obs: "lem_obs",
  },
];

const CAMPOS = GRUPOS.flatMap((g) => g.campos);
const CAMPOS_OBS = GRUPOS.map((g) => g.obs);

const ETAPAS_SEQUENCIAIS = [
  { key: "pcp_data", label: "PCP" },
  { key: "producao_fim", label: "Produção" },
  { key: "lem_data", label: "Inspeção LEM" },
];

export default function EtapaModal({ item, onClose, onSaved }) {
  const proc = item.processo || {};
  const [datas, setDatas] = useState(() =>
    CAMPOS.reduce((acc, campo) => ({ ...acc, [campo.key]: proc[campo.key] || "" }), {})
  );
  const [obss, setObss] = useState(() =>
    CAMPOS_OBS.reduce((acc, chave) => ({ ...acc, [chave]: proc[chave] || "" }), {})
  );
  const [observacao, setObservacao] = useState(proc.observacao || "");
  const [usuario, setUsuario] = useState(proc.usuario || "pcp");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  // A inspeção pode ser antes ou depois da data agendada, mas nunca antes do
  // fim da Produção.
  const dataMinimaLem = datas.producao_fim || undefined;
  const dataFaturamento = proc.faturamento_em?.slice(0, 10) || "";
  const dataEmbarque = proc.embarque_em?.slice(0, 10) || "";

  function setCampo(chave, valor) {
    setDatas((atuais) => ({ ...atuais, [chave]: valor }));
  }

  function setObs(chave, valor) {
    setObss((atuais) => ({ ...atuais, [chave]: valor }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(null);

    let etapaPendente = null;
    for (const etapa of ETAPAS_SEQUENCIAIS) {
      if (!datas[etapa.key] && !etapaPendente) etapaPendente = etapa;
      if (datas[etapa.key] && etapaPendente) {
        setErro(`Preencha ${etapaPendente.label} antes de registrar ${etapa.label}.`);
        return;
      }
    }

    const comercialInformado = Boolean(datas.comercial_data);
    const agendamentoInformado = Boolean(datas.inspecao_agendada_data);
    if (comercialInformado !== agendamentoInformado) {
      setErro("Informe juntos o agendamento do Comercial e a data da inspeção.");
      return;
    }
    if (comercialInformado && datas.inspecao_agendada_data < datas.comercial_data) {
      setErro("A inspeção não pode ser agendada antes do registro do Comercial.");
      return;
    }
    if (datas.lem_data && !datas.inspecao_agendada_data) {
      setErro("Agende a inspeção pelo Comercial antes de concluir o LEM.");
      return;
    }
    if (datas.lem_data && datas.producao_fim && datas.lem_data < datas.producao_fim) {
      setErro(
        `A inspeção LEM não pode ser anterior ao fim da Produção (${fmtDataIso(datas.producao_fim)}).`
      );
      return;
    }
    if (dataEmbarque && (!dataFaturamento || dataEmbarque < dataFaturamento)) {
      setErro("O embarque do ERP está anterior ou sem faturamento. Corrija o JUND.");
      return;
    }

    setSalvando(true);
    try {
      const payload = { usuario: usuario || "pcp", observacao: observacao || null };
      for (const campo of CAMPOS) payload[campo.key] = datas[campo.key] || null;
      for (const chave of CAMPOS_OBS) payload[chave] = obss[chave] || null;
      await api.salvarEtapa(item.pedido_id, payload);
      onSaved();
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  return (
    <ModalDialog
      title="Editar etapas"
      titleId="edicao-etapas-titulo"
      subtitle={`${item.numero} · ${item.cliente}`}
      busy={salvando}
      onClose={onClose}
      largo
    >
      <form onSubmit={salvar} className="form">
        {GRUPOS.map((grupo) => (
          <fieldset key={grupo.titulo} className="grupo-campos">
            <legend>{grupo.titulo}</legend>
            <div className="grupo-linha">
              {grupo.campos.map((campo) => (
                <label key={campo.key} className="campo">
                  <span className="campo-rotulo">{campo.label}</span>
                  <input
                    type="date"
                    min={
                      campo.key === "inspecao_agendada_data"
                        ? datas.comercial_data || undefined
                        : campo.key === "lem_data"
                          ? dataMinimaLem
                          : undefined
                    }
                    value={datas[campo.key]}
                    onChange={(e) => setCampo(campo.key, e.target.value)}
                  />
                  {campo.ajuda && <span className="campo-ajuda">{campo.ajuda}</span>}
                </label>
              ))}
            </div>
            <label className="campo">
              <span className="campo-rotulo">Observação</span>
              <textarea
                rows={2}
                value={obss[grupo.obs]}
                onChange={(e) => setObs(grupo.obs, e.target.value)}
              />
            </label>
          </fieldset>
        ))}

        <fieldset className="grupo-campos">
          <legend>Do ERP (somente leitura)</legend>
          <dl className="kv">
            <dt>Faturamento</dt>
            <dd>{proc.faturamento_em ? fmtDataHora(proc.faturamento_em) : "Aguardando o ERP"}</dd>
            <dt>Nota fiscal</dt>
            <dd>{formatarNotaFiscal(item.nota_fiscal_numero, item.nota_fiscal_serie)}</dd>
            <dt>Embarque e expedição</dt>
            <dd>{proc.embarque_em ? fmtDataHora(proc.embarque_em) : "Aguardando o ERP"}</dd>
          </dl>
        </fieldset>

        <label className="campo">
          <span className="campo-rotulo">Observação geral</span>
          <textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </label>

        <label className="campo">
          <span className="campo-rotulo">Usuário</span>
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </label>

        {erro && (
          <p className="msg-erro" role="alert">
            {erro}
          </p>
        )}

        <div className="modal-acoes">
          <button type="button" className="btn btn-sec" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-pri" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar etapas"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
