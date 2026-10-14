// Os poucos ícones do painel. Cada um carrega um significado (fechar,
// navegar, direção da ordenação, estado da etapa); nenhum é decorativo.
const CAMINHOS = {
  fechar: "M5 5l10 10M15 5L5 15",
  esquerda: "M12.5 4.5L7 10l5.5 5.5",
  direita: "M7.5 4.5L13 10l-5.5 5.5",
  abaixo: "M4.5 7.5L10 13l5.5-5.5",
  cima: "M10 15.5V4.5M5.5 9L10 4.5 14.5 9",
  baixo: "M10 4.5v11M5.5 11l4.5 4.5 4.5-4.5",
  check: "M4.5 10.5l3.5 3.5 7.5-8",
};

export default function Icone({ nome, tamanho = 16, className = "", titulo }) {
  return (
    <svg
      className={`icone ${className}`}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titulo ? undefined : "true"}
      role={titulo ? "img" : undefined}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
