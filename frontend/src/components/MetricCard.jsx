import { CaretRight } from "@phosphor-icons/react";

export default function MetricCard({
  titulo,
  icone = null,
  valor,
  sufixo = "",
  tom = "neutro",
  rodape,
  onClick,
  ativo = false,
  hero = false,
  className = "",
}) {
  const clicavel = typeof onClick === "function";
  const cls = [
    "metric",
    `metric-${tom}`,
    hero ? "metric-hero" : "",
    ativo ? "metric-ativo" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const conteudo = (
    <>
      <div className="metric-titulo">
        {icone}
        {titulo}
      </div>
      <div className="metric-valor">
        {valor}
        {sufixo && <span className="metric-sufixo">{sufixo}</span>}
      </div>
      {rodape && <div className="metric-rodape">{rodape}</div>}
      {clicavel && (
        <CaretRight className="risk-abrir" size={16} weight="bold" aria-hidden="true" />
      )}
    </>
  );

  // Um tile que navega é um botão de verdade: teclado, foco e semântica nativos.
  if (clicavel) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-current={ativo || undefined}>
        {conteudo}
      </button>
    );
  }

  return <div className={cls}>{conteudo}</div>;
}
