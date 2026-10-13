import { useState } from "react";
import { api } from "../api.js";
import { formatarNotaFiscal } from "../lib/format.js";
import ModalDialog from "./ModalDialog.jsx";

function formatarDataHora(iso) {
  if (!iso) return "Aguardando ERP";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const CAMPOS = [
  { key: "pcp_data", label: "PCP — planejamento concluído", obs: "pcp_obs" },
  { key: "producao_plan_inicio", label: "Produção — início planejado" },
  { key: "producao_plan_fim", label: "Produção — fim planejado" },
  { key: "producao_fim", label: "Produção — OPs finalizadas (real)", obs: "producao_obs" },
  {
    key: "comercial_data",
    label: "Comercial — agendamento registrado (real)",
    obs: "comercial_obs",
  },
  {
    key: "inspecao_agendada_data",
    label: "Inspeção — data agendada",
    planejada: true,
  },
  { key: "lem_data", label: "Inspeção LEM concluída (real)", obs: "lem_obs" },
  { key: "faturamento_em", label: "Faturamento — data/hora do ERP", automatico: true },
  { key: "embarque_em", label: "Estoque — embarque do ERP", automatico: true },
  { key: "expedicao_em", label: "Expedição — igual ao embarque do ERP", automatico: true },
];

const CAMPOS_OBS = ["pcp_obs", "producao_obs", "comercial_obs", "lem_obs"];

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
  const dataMinimaLem =
    datas.producao_fim && datas.inspecao_agendada_data
      ? datas.producao_fim > datas.inspecao_agendada_data
        ? datas.producao_fim
        : datas.inspecao_agendada_data
      : datas.producao_fim || datas.inspecao_agendada_data || undefined;
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
      setErro("Informe juntos a conclusão do Comercial e a data agendada da inspeção.");
      return;
    }
    if (
      comercialInformado &&
      datas.inspecao_agendada_data < datas.comercial_data
    ) {
      setErro("A inspeção não pode ser agendada antes da conclusão do Comercial.");
      return;
    }
    if (datas.lem_data && !datas.inspecao_agendada_data) {
      setErro("Agende a inspeção pelo Comercial antes de concluir o LEM.");
      return;
    }
    const inicioLem =
      datas.producao_fim && datas.inspecao_agendada_data
        ? datas.producao_fim > datas.inspecao_agendada_data
          ? datas.producao_fim
          : datas.inspecao_agendada_data
        : "";
    if (datas.lem_data && inicioLem && datas.lem_data < inicioLem) {
      setErro(
        `O LEM não pode ser concluído antes de ${inicioLem}, quando agenda e Produção estão atendidas.`
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
      for (const campo of CAMPOS) {
        if (!campo.automatico) payload[campo.key] = datas[campo.key] || null;
      }
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
      title="Etapas do processo"
      titleId="edicao-etapas-titulo"
      subtitle={`${item.numero} · ${item.cliente}`}
      busy={salvando}
      onClose={onClose}
    >
      <div className="modal-info">
        <span>
          Pedido em: <b>{proc.etapas?.[0]?.data || "-"}</b>
        </span>
        <span>
          Etapa atual: <b>{proc.etapa_atual_nome || "-"}</b>
        </span>
        <span>
          Nota fiscal: <b>{formatarNotaFiscal(item.nota_fiscal_numero, item.nota_fiscal_serie)}</b>
        </span>
      </div>

      <form onSubmit={salvar}>
        {CAMPOS.map((campo) => (
          <div key={campo.key} className="etapa-grupo">
            <label>
              {campo.label}
              <input
                type={campo.automatico ? "text" : "date"}
                min={
                  campo.key === "inspecao_agendada_data"
                    ? datas.comercial_data || undefined
                    : campo.key === "lem_data"
                      ? dataMinimaLem
                      : undefined
                }
                value={
                  campo.automatico
                    ? formatarDataHora(
                        campo.key === "faturamento_em"
                          ? proc.faturamento_em
                          : proc.embarque_em
                      )
                    : datas[campo.key]
                }
                readOnly={campo.automatico}
                onChange={
                  campo.automatico
                    ? undefined
                    : (e) => setCampo(campo.key, e.target.value)
                }
              />
              {campo.automatico && (
                <span className="campo-ajuda">Consultado diretamente no JUND.</span>
              )}
              {campo.planejada && (
                <span className="campo-ajuda">Pode ser uma data futura.</span>
              )}
            </label>
            {campo.obs && (
              <label>
                Observação
                <textarea
                  rows={2}
                  value={obss[campo.obs]}
                  onChange={(e) => setObs(campo.obs, e.target.value)}
                />
              </label>
            )}
          </div>
        ))}

        <label>
          Observação geral
          <textarea
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </label>

        <label>
          Usuário
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </label>

        {erro && <div className="erro">{erro}</div>}

        <div className="modal-acoes">
          <button type="button" className="btn-sec" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar etapas"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
