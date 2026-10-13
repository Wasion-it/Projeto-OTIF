import { useState } from "react";
import { api } from "../api.js";
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

const hoje = () => {
  const data = new Date();
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
};

export default function ConfirmarEtapaModal({
  item,
  etapaForcada = null,
  onClose,
  onSaved,
}) {
  const proc = item.processo || {};
  const etapa = etapaForcada || proc.etapa_atual;
  const ehComercial = etapa === "comercial";
  const aguardandoInicioLem = etapa === "lem" && proc.lem_aguardando_inicio;
  const campo = CAMPO_ETAPA[etapa];
  const campoObs = OBS_ETAPA[etapa];
  const dataOperacional = proc.data_operacional || hoje();

  const [data, setData] = useState(proc[campo] || dataOperacional);
  const [dataAgendamento, setDataAgendamento] = useState(
    proc.inspecao_agendada_data || dataOperacional
  );
  const [obs, setObs] = useState(proc[campoObs] || "");
  const [usuario, setUsuario] = useState(
    ehComercial ? "comercial" : proc.usuario || "pcp"
  );
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const anteriores = (proc.etapas || [])
    .filter((e) => e.chave !== "pedido" && e.chave !== "entrega" && e.concluida)
    .map((e) => e.nome);

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
      title={ehComercial ? "Agendar inspeção do pedido" : `Confirmar etapa: ${proc.etapa_atual_nome}`}
      titleId="confirmacao-etapa-titulo"
      subtitle={`${item.numero} · ${item.cliente}`}
      busy={salvando}
      onClose={onClose}
    >
      <div className="modal-info">
        <span>
          Pedido em: <b>{proc.etapas?.[0]?.data || "-"}</b>
        </span>
        <span>
          Etapas cumpridas: <b>{anteriores.length ? anteriores.join(" · ") : "nenhuma"}</b>
        </span>
        {etapa === "lem" && proc.inspecao_agendada_data && (
          <span>
            Inspeção agendada para: <b>{proc.inspecao_agendada_data}</b>
          </span>
        )}
      </div>

      {aguardandoInicioLem && (
        <div className="etapa-transicao-info">
          O LEM está em espera programada. A contagem começa em
          <strong> {proc.inspecao_agendada_data}</strong>.
        </div>
      )}

      <form onSubmit={salvar}>
        {ehComercial ? (
          <>
            <div className="etapa-transicao-info">
              O agendamento será registrado agora, sem esperar a Produção. O LEM
              começará somente quando a data agendada chegar e a Produção estiver
              concluída.
            </div>
            <label>
              Data agendada para a inspeção
              <input
                type="date"
                min={dataOperacional}
                value={dataAgendamento}
                required
                onChange={(e) => setDataAgendamento(e.target.value)}
              />
            </label>
          </>
        ) : (
          <label>
            Data em que {proc.etapa_atual_nome} foi finalizada
            <input
              type="date"
              min={etapa === "lem" ? proc.inicio_lem_data : undefined}
              max={dataOperacional}
              value={data}
              required
              onChange={(e) => setData(e.target.value)}
            />
          </label>
        )}

        <label>
          Observação (opcional)
          <textarea
            rows={3}
            placeholder={
              ehComercial
                ? "Contato, horário ou instruções para a inspeção…"
                : `Anote algo sobre ${proc.etapa_atual_nome}…`
            }
            value={obs}
            onChange={(e) => setObs(e.target.value)}
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
          <button
            type="submit"
            className="btn"
            disabled={salvando || aguardandoInicioLem}
          >
            {salvando
              ? "Salvando..."
              : ehComercial
                ? "Salvar agendamento"
                : "Confirmar etapa"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
