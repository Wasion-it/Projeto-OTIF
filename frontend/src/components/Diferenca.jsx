import { fmtDiferenca } from "../lib/format.js";

// Diferença em dias entre realizado e meta, arredondada a uma casa decimal.
export function diferenca(realizado, meta) {
  if (realizado == null || meta == null) return null;
  return Math.round((realizado - meta) * 10) / 10;
}

// O sinal e o texto para leitor de tela carregam o significado; a cor só reforça.
export default function Diferenca({ valor, destaque = false }) {
  if (valor == null) return <span className="txt-sec">—</span>;
  if (valor === 0) return <span className="txt-sec">0d</span>;
  const acima = valor > 0;
  return (
    <span className={`${acima ? "tom-erro" : "tom-ok"} ${destaque ? "peso-500" : ""}`}>
      {fmtDiferenca(valor)}
      <span className="sr-only">{acima ? " acima da meta" : " abaixo da meta"}</span>
    </span>
  );
}
