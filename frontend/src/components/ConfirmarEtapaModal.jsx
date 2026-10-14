import { useState } from "react";
import { api } from "../api.js";
import { hojeIso, nomeEtapa } from "../lib/etapas.js";
import { fmtDataIso } from "../lib/format.js";
import ModalDialog from "./ModalDialog.jsx";

const CAMPO_ETAPA = {
  pcp: "pcp_data",
  producao: "producao_fim",
  comercial: "comercial_data",
  lem: "lem_data",
};

const OBS_ETAPA = {
  pcp: "pcp_obs",
  producao: "producao_obs",
  comercial: "comercial_obs",
  lem: "lem_obs",
};

const TITULO = {
  pcp: "Confirmar PCP",
  producao: "Confirmar produção",
  comercial: "Agendar inspeção",
  lem: "Confirmar inspeção LEM",
};

export default function ConfirmarEtapaModal({ item, etapaForcada = null, onClose, onSaved }) {
  const proc = item.processo || {};
  const etapa = etapaForcada || proc.etapa_atual;
  const ehComercial = etapa === "comercial";
  const antecipado = ehComercial && proc.etapa_atual !== "comercial";
  const campo = CAMPO_ETAPA[etapa];
  const campoObs = OBS_ETAPA[etapa];
  const dataOperacional = proc.data_operacional || hojeIso();

  const [data, setData] = useState(proc[campo] || dataOperacional);
  const [dataAgendamento, setDataAgendamento] = useState(
    proc.inspecao_agendada_data || dataOperacional
  );
  const [obs, setObs] = useState(proc[campoObs] || "");
  const [usuario, setUsuario] = useState(ehComercial ? "comercial" : proc.usuario || "pcp");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    if (!campo) {
      setErro("Etapa inválida para confirmação.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      if (ehComercial) {
        await api.agendarInspecao(item.pedido_id, {
          inspecao_agendada_data: dataAgendamento,
          observacao: obs || null,
          usuario: usuario || "comercial",
        });
      } else {
        await api.confirmarEtapa(item.pedido_id, {
          etapa,
          data,
          observacao: obs || null,
          usuario: usuario || "pcp",
        });
      }
      onSaved();
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  return (
    <ModalDialog
      title={antecipado ? "Agendar inspeção antecipada" : TITULO[etapa] || "Confirmar etapa"}
      titleId="confirmacao-etapa-titulo"
      subtitle={`${item.numero} · ${item.cliente}`}
      busy={salvando}
      onClose={onClose}
    >
      {ehComercial && (
        <p className="txt-sec">
          {antecipado
            ? "O agendamento fica registrado agora. A inspeção LEM começa quando a data chegar e a Produção estiver concluída."
            : "A inspeção LEM começa na data agendada."}
        </p>
      )}
      {etapa === "lem" && proc.inspecao_agendada_data && (
        <p className="txt-sec">
          Agendada para {fmtDataIso(proc.inspecao_agendada_data)}. A inspeção pode ser registrada
          antes ou depois dessa data, desde que após o fim da Produção.
        </p>
      )}

      <form onSubmit={salvar} className="form">
        {ehComercial ? (
          <label className="campo">
            <span className="campo-rotulo">Data agendada para a inspeção</span>
            <input
              type="date"
              min={dataOperacional}
              value={dataAgendamento}
              required
              onChange={(e) => setDataAgendamento(e.target.value)}
            />
          </label>
        ) : (
          <label className="campo">
            <span className="campo-rotulo">
              Data em que {nomeEtapa(etapa)} foi concluída
            </span>
            <input
              type="date"
              min={etapa === "lem" ? proc.producao_fim || undefined : undefined}
              max={dataOperacional}
              value={data}
              required
              onChange={(e) => setData(e.target.value)}
            />
          </label>
        )}

        <label className="campo">
          <span className="campo-rotulo">Observação (opcional)</span>
          <textarea
            rows={3}
            placeholder={ehComercial ? "Contato, horário ou instruções da inspeção" : ""}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
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
            {salvando ? "Salvando…" : ehComercial ? "Salvar agendamento" : TITULO[etapa]}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
