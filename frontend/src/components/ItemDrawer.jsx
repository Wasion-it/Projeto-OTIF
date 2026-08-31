import { useEffect, useRef } from "react";
import { motivoLabel } from "../api.js";

function Flag({ estado, label }) {
  // estado: true = ok, false = falhou, null/undefined = não avaliado
  if (estado == null) return <span className="flag flag-neutro">{label}: —</span>;
  return (
    <span className={`flag ${estado ? "flag-ok" : "flag-bad"}`}>
      {estado ? "✓" : "✗"} {label}
    </span>
  );
}

function StatusFlag({ status }) {
  const map = {
    otif: { txt: "OTIF", cls: "flag-ok" },
    falha: { txt: "Falha", cls: "flag-bad" },
    pendente: { txt: "Pendente", cls: "flag-neutro" },
  };
  const s = map[status] || map.pendente;
  return <span className={`flag ${s.cls}`}>{s.txt}</span>;
}

function fmtDataHora(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function textoPrazo(it) {
  if (it.status !== "pendente" || it.dias_restantes == null) return null;
  const d = it.dias_restantes;
  if (d < 0) return `vencido há ${Math.abs(d)}d`;
  if (d === 0) return "vence hoje";
  return `faltam ${d}d`;
}

export default function ItemDrawer({ item, onClose, onConfirmar }) {
  const painelRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    painelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const conf = item.confirmacao;
  const prazoTxt = textoPrazo(item);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-label="Detalhe do item"
        tabIndex={-1}
        ref={painelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <h3>Pedido {item.pedido_numero}</h3>
            <div className="drawer-sub">
              {item.sku} · {item.cliente}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <div className="drawer-section-titulo">Resultado</div>
            <div className="flags">
              <StatusFlag status={item.status} />
              <Flag estado={item.on_time} label="On Time" />
              <Flag estado={item.in_full} label="In Full" />
            </div>
          </div>

          <div className="drawer-section">
            <div className="drawer-section-titulo">Produto</div>
            <dl className="kv">
              <dt>SKU</dt>
              <dd>{item.sku}</dd>
              <dt>Descrição</dt>
              <dd>{item.descricao}</dd>
              <dt>Faturado / Pedido</dt>
              <dd>
                {item.qtd_faturada} de {item.qtd_pedida}
              </dd>
            </dl>
          </div>

          <div className="drawer-section">
            <div className="drawer-section-titulo">Datas</div>
            <dl className="kv">
              <dt>Solicitada</dt>
              <dd>{item.data_solicitada}</dd>
              <dt>Prazo (SLA)</dt>
              <dd>
                {item.prazo_entrega}
                {prazoTxt && ` · ${prazoTxt}`}
              </dd>
              <dt>Faturamento</dt>
              <dd>{item.data_faturamento || "-"}</dd>
              <dt>Entrega</dt>
              <dd>{item.data_entrega_real || "-"}</dd>
            </dl>
          </div>

          {item.dias_atraso != null && item.dias_atraso > 0 && (
            <div className="drawer-section">
              <div className="drawer-section-titulo">Atraso</div>
              <dl className="kv">
                <dt>Dias de atraso</dt>
                <dd>+{item.dias_atraso}d</dd>
                <dt>Origem</dt>
                <dd>{item.origem_atraso || "-"}</dd>
                {item.motivo_falha && (
                  <>
                    <dt>Motivo</dt>
                    <dd>{motivoLabel(item.motivo_falha)}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          <div className="drawer-section">
            <div className="drawer-section-titulo">Confirmação de entrega</div>
            {conf ? (
              <>
                <dl className="kv">
                  <dt>Entregue em</dt>
                  <dd>{conf.data_entrega_real}</dd>
                  <dt>Recebido completo</dt>
                  <dd>{conf.recebido_completo ? "Sim" : "Não"}</dd>
                  <dt>Registrado por</dt>
                  <dd>{conf.usuario}</dd>
                  <dt>Registrado em</dt>
                  <dd>{fmtDataHora(conf.criado_em)}</dd>
                </dl>
                {conf.observacao && (
                  <div className="obs-box" style={{ marginTop: 8 }}>
                    {conf.observacao}
                  </div>
                )}
              </>
            ) : (
              <p className="vazio">Ainda não confirmado.</p>
            )}
          </div>
        </div>

        <div className="drawer-foot">
          <button className="btn-sec" onClick={onClose}>
            Fechar
          </button>
          <button
            className="btn"
            onClick={() => {
              onConfirmar(item);
              onClose();
            }}
          >
            {item.status === "pendente" ? "Confirmar entrega" : "Editar confirmação"}
          </button>
        </div>
      </aside>
    </div>
  );
}
