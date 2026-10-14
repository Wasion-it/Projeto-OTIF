import { useState } from "react";
import { api, MOTIVOS } from "../api.js";
import { contractDateDe } from "../lib/etapas.js";
import { fmtDataHora, fmtDataIso, fmtInteiro, formatarNotaFiscal } from "../lib/format.js";
import ModalDialog from "./ModalDialog.jsx";

export default function ConfirmacaoModal({ item, onClose, onSaved }) {
  const pedido = item;
  const motivoPersistido = pedido.confirmacao?.motivo_falha;
  const motivoInicial = MOTIVOS.some((motivo) => motivo.value === motivoPersistido)
    ? motivoPersistido
    : "";

  const [dataEntrega, setDataEntrega] = useState(pedido.data_entrega_real || "");
  const [recebidoCompleto, setRecebidoCompleto] = useState(
    pedido.data_entrega_real ? pedido.confirmacao?.recebido_completo ?? true : true
  );
  const [motivo, setMotivo] = useState(pedido.data_entrega_real ? motivoInicial : "");
  const [observacao, setObservacao] = useState(pedido.confirmacao?.observacao || "");
  const [usuario, setUsuario] = useState(pedido.confirmacao?.usuario || "logistica");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const contractDate = contractDateDe(pedido);

  // Sem motivo, uma falha entra como "Não informado" e some da análise de
  // causas. Exigimos o motivo sempre que o resultado vai ser falha.
  const atrasada = Boolean(contractDate && dataEntrega && dataEntrega > contractDate);
  const faturamentoIncompleto =
    Number(pedido.qtd_faturada_total || 0) < Number(pedido.qtd_pedida_total || 0);
  const motivoObrigatorio = atrasada || !recebidoCompleto || faturamentoIncompleto;
  const razoes = [
    atrasada && "a entrega é posterior ao Contract Date",
    !recebidoCompleto && "o pedido não chegou completo",
    faturamentoIncompleto && "o faturamento foi parcial",
  ].filter(Boolean);

  async function salvar(e) {
    e.preventDefault();
    if (motivoObrigatorio && !motivo) {
      setErro(`Informe o motivo da falha: ${razoes.join(", ")}.`);
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await api.confirmar({
        pedido_id: pedido.pedido_id,
        data_entrega_real: dataEntrega,
        recebido_completo: recebidoCompleto,
        motivo_falha: MOTIVOS.some((m) => m.value === motivo) ? motivo : null,
        observacao: observacao || null,
        usuario: usuario || "logistica",
      });
      onSaved();
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  return (
    <ModalDialog
      title={pedido.confirmacao ? "Editar entrega" : "Confirmar entrega"}
      titleId="confirmacao-entrega-titulo"
      subtitle={`${pedido.numero} · ${pedido.cliente}`}
      busy={salvando}
      onClose={onClose}
    >
      <dl className="kv modal-kv">
        <dt>Contract Date</dt>
        <dd className={contractDate ? "" : "tom-atencao"}>
          {contractDate ? fmtDataIso(contractDate) : "Não informado no JUND"}
        </dd>
        <dt>Nota fiscal</dt>
        <dd>{formatarNotaFiscal(pedido.nota_fiscal_numero, pedido.nota_fiscal_serie)}</dd>
        <dt>Embarque</dt>
        <dd>{fmtDataHora(pedido.embarque_em)}</dd>
        <dt>Faturado / pedido</dt>
        <dd className={faturamentoIncompleto ? "tom-atencao" : ""}>
          {fmtInteiro(pedido.qtd_faturada_total)} / {fmtInteiro(pedido.qtd_pedida_total)}
        </dd>
      </dl>
      {!contractDate && (
        <p className="tom-atencao">
          A entrega pode ser registrada, mas o pedido só será avaliado depois que o Contract Date
          for corrigido no JUND.
        </p>
      )}

      <form onSubmit={salvar} className="form">
        <label className="campo">
          <span className="campo-rotulo">Data da entrega no cliente</span>
          <input
            type="date"
            value={dataEntrega}
            required
            onChange={(e) => setDataEntrega(e.target.value)}
          />
          {atrasada && (
            <span className="campo-ajuda tom-erro">
              Posterior ao Contract Date: o pedido não será On Time.
            </span>
          )}
        </label>

        <label className="opcao">
          <input
            type="checkbox"
            checked={recebidoCompleto}
            onChange={(e) => setRecebidoCompleto(e.target.checked)}
          />
          <span>Recebido completo, sem falta ou avaria</span>
        </label>

        <label className="campo">
          <span className="campo-rotulo">
            Motivo da falha{motivoObrigatorio ? "" : " (se houve)"}
          </span>
          <select
            value={motivo}
            required={motivoObrigatorio}
            aria-describedby={motivoObrigatorio ? "motivo-razao" : undefined}
            onChange={(e) => setMotivo(e.target.value)}
          >
            <option value="">{motivoObrigatorio ? "Selecione" : "Nenhum"}</option>
            {MOTIVOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {motivoObrigatorio && (
            <span className="campo-ajuda" id="motivo-razao">
              Obrigatório porque {razoes.join(" e ")}.
            </span>
          )}
        </label>

        <label className="campo">
          <span className="campo-rotulo">Observação</span>
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
            {salvando ? "Salvando…" : "Salvar entrega"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
