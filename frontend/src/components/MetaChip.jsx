import { META_OTIF, fmtPct } from "../lib/format.js";

// Chip de meta com a distância até o alvo, em pontos percentuais.
export default function MetaChip({ pct }) {
  const diff = Math.round((pct - META_OTIF) * 10) / 10;
  const ok = diff >= 0;
  return (
    <span className={`meta ${ok ? "meta-ok" : "meta-bad"}`}>
      Meta ≥ {META_OTIF}% · {ok ? "+" : ""}
      {fmtPct(diff)} p.p.
    </span>
  );
}
