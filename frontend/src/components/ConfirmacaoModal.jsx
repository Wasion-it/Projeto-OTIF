import { useState } from "react";
import { api, MOTIVOS } from "../api.js";
import { formatarNotaFiscal } from "../lib/format.js";
import ModalDialog from "./ModalDialog.jsx";

function formatarDataHora(iso) {
  if (!iso) return "-";
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

export default function ConfirmacaoModal({ item, onClose, onSaved }) {
  const pedido = item;
  const motivoPersistido = pedido.confirmacao?.motivo_falha;
  const motivoInicial = MOTIVOS.some((motivo) => motivo.value === motivoPersistido)
    ? motivoPersistido
    : "";
  const conf = pedido.data_entrega_real
    ? {
        data_entrega_real: pedido.data_entrega_real,
        recebido_completo: pedido.confirmacao?.recebido_completo ?? true,
        motivo_falha: motivoInicial,
      }
    : { data_entrega_real: "", recebido_completo: true, motivo_falha: "" };

  const [dataEntrega, setDataEntrega] = useState(conf.data_entrega_real);
  const [recebidoCompleto, setRecebidoCompleto] = useState(conf.recebido_completo);
  const [motivo, setMotivo] = useState(conf.motivo_falha);
  const [observacao, setObservacao] = useState(pedido.confirmacao?.observacao || "");
  const [usuario, setUsuario] = useState(pedido.confirmacao?.usuario || "comercial");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const contractDate = pedido.contract_date || pedido.prazo_entrega;

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await api.confirmar({
        pedido_id: pedido.pedido_id,
        data_entrega_real: dataEntrega,
        recebido_completo: recebidoCompleto,
        motivo_falha: MOTIVOS.some((itemMotivo) => itemMotivo.value === motivo)
          ? motivo
          : null,
        observacao: observacao || null,
        usuario: usuario || "comercial",
      });
      onSaved();
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  return (
    <ModalDialog
      title="Confirmar entrega do pedido"
      titleId="confirmacao-entrega-titulo"
      subtitle={`${pedido.numero} · ${pedido.cliente}`}
      busy={salvando}
      onClose={onClose}
    >
      {!contractDate && (
        <div className="modal-contract-alert" role="alert">
          <strong>Contract Date não informado</strong>
          <span>
            A confirmação pode ser registrada, mas o pedido só será avaliado após a data ser
            corrigida no JUND e sincronizada.
          </span>
        </div>
      )}

      <div className="modal-info">
        <span>
          Digitação: <b>{pedido.data_solicitada}</b>
        </span>
        <span>
          Contract Date: <b>{contractDate || "Não informado"}</b>
        </span>
        <span>
          Faturamento: <b>{formatarDataHora(pedido.faturamento_em)}</b>
        </span>
        <span>
          Nota fiscal: <b>{formatarNotaFiscal(pedido.nota_fiscal_numero, pedido.nota_fiscal_serie)}</b>
        </span>
        <span>
          Embarque: <b>{formatarDataHora(pedido.embarque_em)}</b>
        </span>
        <span>
          Itens: <b>{pedido.qtd_itens}</b> · Faturado/Pedido:{" "}
          <b>{pedido.qtd_faturada_total} / {pedido.qtd_pedida_total}</b>
        </span>
      </div>

      <form onSubmit={salvar}>
        <label>
          Data de entrega no cliente
          <input
            type="date"
            value={dataEntrega}
            required
            onChange={(e) => setDataEntrega(e.target.value)}
          />
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={recebidoCompleto}
            onChange={(e) => setRecebidoCompleto(e.target.checked)}
          />
          Pedido recebido completo (sem falta/avaria)
        </label>

        <label>
          Motivo da falha (se houve)
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">-- nenhum --</option>
            {MOTIVOS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>

        <label>
          Observação
          <textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
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
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
