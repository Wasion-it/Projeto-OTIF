import { useState } from "react";
import { api } from "../api.js";
import { ETAPAS_LOTE, hojeIso } from "../lib/etapas.js";

// Confirma a mesma etapa, com a mesma data, para vários pedidos. O backend
// não tem endpoint de lote: as chamadas são feitas uma a uma e o resultado de
// cada pedido é relatado, porque a validação é individual.
export default function LoteBarra({ etapa, pedidos, dataOperacional, onCancelar, onConcluido }) {
  const config = ETAPAS_LOTE[etapa];
  const hoje = dataOperacional || hojeIso();
  const [data, setData] = useState(hoje);
  const [usuario, setUsuario] = useState(etapa === "comercial" ? "comercial" : "pcp");
  const [executando, setExecutando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  if (!config) return null;
  const n = pedidos.length;
  const rotulo = `${config.verbo} de ${n} ${n === 1 ? "pedido" : "pedidos"}`;

  async function executar(event) {
    event.preventDefault();
    setExecutando(true);
    setProgresso(0);
    const falhas = [];
    let ok = 0;
    for (const pedido of pedidos) {
      try {
        if (etapa === "comercial") {
          await api.agendarInspecao(pedido.pedido_id, {
            inspecao_agendada_data: data,
            observacao: null,
            usuario: usuario.trim() || "comercial",
          });
        } else {
          await api.confirmarEtapa(pedido.pedido_id, {
            etapa,
            data,
            observacao: null,
            usuario: usuario.trim() || "pcp",
          });
        }
        ok += 1;
      } catch (erro) {
        falhas.push({ numero: pedido.numero, mensagem: erro.message });
      }
      setProgresso((p) => p + 1);
    }
    setExecutando(false);
    onConcluido({ ok, falhas });
  }

  return (
    <form className="lote" onSubmit={executar} aria-label="Ação em lote">
      <span className="lote-n">
        {n} {n === 1 ? "selecionado" : "selecionados"}
      </span>
      <label className="campo campo-inline">
        <span className="campo-rotulo">{config.campoData}</span>
        <input
          type="date"
          value={data}
          required
          min={config.limite === "min" ? hoje : undefined}
          max={config.limite === "max" ? hoje : undefined}
          onChange={(event) => setData(event.target.value)}
          disabled={executando}
        />
      </label>
      <label className="campo campo-inline">
        <span className="campo-rotulo">Usuário</span>
        <input
          value={usuario}
          required
          size={10}
          onChange={(event) => setUsuario(event.target.value)}
          disabled={executando}
        />
      </label>
      <button type="submit" className="btn btn-pri" disabled={executando || n === 0 || !data}>
        {executando ? `Registrando ${progresso} de ${n}…` : rotulo}
      </button>
      <button type="button" className="btn btn-texto" onClick={onCancelar} disabled={executando}>
        Cancelar
      </button>
    </form>
  );
}
