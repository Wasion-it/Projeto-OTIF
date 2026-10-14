// Triagem por situação em 1 clique. A cor fica só no texto de status quando o
// segmento está ativo; a palavra sempre diz o que é.
const GRUPOS = [
  [{ id: "todos", label: "Todas as situações", status: "", situacao: "" }],
  [
    { id: "pendente", label: "Pendentes", status: "pendente", situacao: "" },
    { id: "vencido", label: "Vencidos", status: "pendente", situacao: "vencido" },
    { id: "atencao", label: "Atenção", status: "pendente", situacao: "atencao" },
    { id: "no_prazo", label: "No prazo", status: "pendente", situacao: "no_prazo" },
  ],
  [
    { id: "otif", label: "OTIF", status: "otif", situacao: "" },
    { id: "falha", label: "Falha", status: "falha", situacao: "" },
    { id: "sem_contract_date", label: "Sem Contract Date", status: "sem_contract_date", situacao: "" },
  ],
];

// O auto-refresh não desabilita os segmentos: o token de geração no App já
// descarta respostas antigas com segurança.
export default function SegmentosPedidos({ filtros, onSelecionar }) {
  const statusAtual = filtros.status || "";
  const situacaoAtual = filtros.situacao_prazo || "";

  return (
    <div className="segmentos" role="group" aria-label="Filtrar pedidos por situação">
      {GRUPOS.map((grupo) => (
        <div className="seg-grupo" key={grupo[0].id}>
          {grupo.map((segmento) => {
            const ativo =
              segmento.status === statusAtual && segmento.situacao === situacaoAtual;
            return (
              <button
                type="button"
                key={segmento.id}
                className={`seg ${ativo ? "ativo" : ""}`}
                aria-pressed={ativo}
                onClick={() =>
                  onSelecionar({ status: segmento.status, situacao_prazo: segmento.situacao })
                }
              >
                {segmento.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
