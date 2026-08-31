import { useState } from "react";
import { api, MOTIVOS } from "../api.js";

export default function ConfirmacaoModal({ item, onClose, onSaved }) {
  const conf = item.data_entrega_real
    ? {
        data_entrega_real: item.data_entrega_real,
        recebido_completo: item.in_full ?? true,
        motivo_falha: item.motivo_falha || "",
      }
    : { data_entrega_real: "", recebido_completo: true, motivo_falha: "" };

  const [dataEntrega, setDataEntrega] = useState(conf.data_entrega_real);
  const [recebidoCompleto, setRecebidoCompleto] = useState(conf.recebido_completo);
  const [motivo, setMotivo] = useState(conf.motivo_falha);
  const [observacao, setObservacao] = useState("");
  const [usuario, setUsuario] = useState("comercial");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await api.confirmar({
        item_id: item.item_id,
        data_entrega_real: dataEntrega,
        recebido_completo: recebidoCompleto,
        motivo_falha: motivo || null,
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Confirmar entrega</h3>
        <div className="modal-sub">
          {item.pedido_numero} - {item.sku} - {item.cliente}
        </div>
        <div className="modal-info">
          <span>Solicitada: <b>{item.data_solicitada}</b></span>
          <span>Faturamento: <b>{item.data_faturamento || "-"}</b></span>
          <span>Pedido/Faturado: <b>{item.qtd_pedida} / {item.qtd_faturada}</b></span>
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
            Recebido completo (sem falta/avaria)
          </label>

          <label>
            Motivo da falha (se houve)
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">-- nenhum --</option>
              {MOTIVOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Observacao
            <textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </label>

          <label>
            Usuario
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </label>

          {erro && <div className="erro">{erro}</div>}

          <div className="modal-acoes">
            <button type="button" className="btn-sec" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
