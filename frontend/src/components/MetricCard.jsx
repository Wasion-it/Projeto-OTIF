export default function MetricCard({
  titulo,
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

  const handleKey = clicavel
    ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  return (
    <div
      className={cls}
      onClick={onClick}
      onKeyDown={handleKey}
      role={clicavel ? "button" : undefined}
      tabIndex={clicavel ? 0 : undefined}
      aria-pressed={clicavel ? ativo : undefined}
    >
      <div className="metric-titulo">{titulo}</div>
      <div className="metric-valor">
        {valor}
        {sufixo && <span className="metric-sufixo">{sufixo}</span>}
      </div>
      {rodape && <div className="metric-rodape">{rodape}</div>}
    </div>
  );
}
