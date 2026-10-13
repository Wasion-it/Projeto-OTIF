// Triagem em 1 clique. Risco de prazo é o filtro que a operação usa o tempo
// todo, então ele fica visível em vez de escondido em dois selects acoplados
// (status + situação do Contract Date, que dependiam um do outro).
const GRUPOS = [
  [{ id: "todos", label: "Todos", status: "", situacao: "" }],
  [
    { id: "pendente", label: "Pendentes", status: "pendente", situacao: "" },
    { id: "vencido", label: "Vencidos", status: "pendente", situacao: "vencido", tom: "ruim" },
    { id: "atencao", label: "Atenção", status: "pendente", situacao: "atencao", tom: "medio" },
    { id: "no_prazo", label: "No prazo", status: "pendente", situacao: "no_prazo", tom: "bom" },
  ],
  [
    { id: "otif", label: "OTIF", status: "otif", situacao: "", tom: "bom" },
    { id: "falha", label: "Falha", status: "falha", situacao: "", tom: "ruim" },
    {
      id: "sem_contract_date",
      label: "Sem Contract Date",
      status: "sem_contract_date",
      situacao: "",
      tom: "medio",
    },
  ],
];

// O auto-refresh de 30 s não desabilita os segmentos: piscar a barra inteira a
// cada ciclo é mais custoso do que um clique durante a consulta, que o token de
// geração no App já descarta com segurança.
export default function SegmentosPedidos({ filtros, onSelecionar }) {
  const statusAtual = filtros.status || "";
  const situacaoAtual = filtros.situacao_prazo || "";

  return (
    <div className="seg-barra" role="group" aria-label="Filtrar pedidos por situação">
      {GRUPOS.map((grupo, indiceGrupo) => (
        <div className="seg-grupo" key={grupo[0].id}>
          {indiceGrupo > 0 && <span className="seg-divisor" aria-hidden="true" />}
          {grupo.map((segmento) => {
            const ativo =
              segmento.status === statusAtual && segmento.situacao === situacaoAtual;
            return (
              <button
                type="button"
                key={segmento.id}
                className={`seg ${segmento.tom ? `seg-${segmento.tom}` : ""} ${
                  ativo ? "ativo" : ""
                }`}
                aria-pressed={ativo}
                onClick={() =>
                  onSelecionar({
                    status: segmento.status,
                    situacao_prazo: segmento.situacao,
                  })
                }
              >
                {segmento.tom && <span className="seg-ponto" aria-hidden="true" />}
                {segmento.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
