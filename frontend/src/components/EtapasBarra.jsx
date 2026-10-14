import { ETAPAS_FILTRO } from "../lib/etapas.js";
import { fmtInteiro } from "../lib/format.js";

// Onde estão os pedidos do recorte, na ordem do processo. Cada etapa é um
// filtro de 1 clique (como os segmentos). "ERP" marca as etapas que andam
// sozinhas; as demais dependem de alguém registrar aqui.
export default function EtapasBarra({ processo, etapaAtiva, onSelecionar }) {
  const contagem = Object.fromEntries(
    (processo?.etapas || []).map((e) => [e.chave, e.em_andamento])
  );
  const concluidos = processo?.total_concluido;
  const total =
    processo != null ? (processo.total_em_processo || 0) + (concluidos || 0) : null;

  const opcoes = [
    { chave: "", nome: "Todas as etapas", n: total },
    ...ETAPAS_FILTRO.map((e) => ({
      chave: e.chave,
      nome: e.nome,
      erp: e.origem === "erp",
      n: processo ? contagem[e.chave] || 0 : null,
    })),
    { chave: "concluido", nome: "Concluídos", n: concluidos },
  ];

  return (
    <div className="etapas-barra" role="group" aria-label="Filtrar por etapa atual">
      {opcoes.map((opcao, indice) => {
        const ativo = (etapaAtiva || "") === opcao.chave;
        const sequencia = indice > 0 && indice < opcoes.length - 1;
        return (
          <button
            type="button"
            key={opcao.chave || "todas"}
            className={`etapa-opcao ${ativo ? "ativo" : ""} ${sequencia ? "seq" : ""} ${
              opcao.n === 0 ? "vazia" : ""
            }`}
            aria-pressed={ativo}
            onClick={() => onSelecionar(opcao.chave)}
          >
            <span className="etapa-opcao-nome">
              {opcao.nome}
              {opcao.erp && <span className="etapa-opcao-erp"> · ERP</span>}
            </span>
            <span className="etapa-opcao-n">{opcao.n == null ? "…" : fmtInteiro(opcao.n)}</span>
          </button>
        );
      })}
    </div>
  );
}
