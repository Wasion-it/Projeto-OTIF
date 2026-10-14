import { useState } from "react";
import { api } from "../api.js";
import ModalDialog from "./ModalDialog.jsx";

export default function NegarProducaoModal({ item, onClose, onSaved }) {
  const processo = item.processo || {};
  const [motivo, setMotivo] = useState("");
  const [dataPrevista, setDataPrevista] = useState("");
  const [usuario, setUsuario] = useState("pcp");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(event) {
    event.preventDefault();
    const motivoNormalizado = motivo.trim();
    if (!motivoNormalizado) {
      setErro("Informe o motivo da negativa de produção.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await api.negarProducao(item.pedido_id, {
        motivo: motivoNormalizado,
        data_prevista: dataPrevista,
        usuario: usuario.trim() || "pcp",
      });
      onSaved();
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  return (
    <ModalDialog
      title="Negar produção"
      titleId="negativa-producao-titulo"
      subtitle={`${item.numero} · ${item.cliente}`}
      busy={salvando}
      onClose={onClose}
    >
      <p className="txt-sec">
        O pedido continua no PCP e a negativa fica no histórico. Confirme o PCP quando a
        restrição for resolvida.
      </p>

      <form onSubmit={salvar} className="form">
        <label className="campo">
          <span className="campo-rotulo">Motivo da negativa</span>
          <textarea
            rows={4}
            maxLength={2000}
            placeholder="Ex.: matéria-prima indisponível"
            value={motivo}
            required
            onChange={(event) => setMotivo(event.target.value)}
          />
        </label>

        <label className="campo">
          <span className="campo-rotulo">Quando a produção poderá ser feita</span>
          <input
            type="date"
            min={processo.data_operacional || undefined}
            value={dataPrevista}
            required
            onChange={(event) => setDataPrevista(event.target.value)}
          />
        </label>

        <label className="campo">
          <span className="campo-rotulo">Usuário</span>
          <input value={usuario} required onChange={(event) => setUsuario(event.target.value)} />
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
          <button type="submit" className="btn btn-perigo" disabled={salvando}>
            {salvando ? "Registrando…" : "Negar produção"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
