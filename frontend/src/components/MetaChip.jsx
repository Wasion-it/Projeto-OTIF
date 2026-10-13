import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { META_OTIF_PADRAO, fmtPct } from "../lib/format.js";

// Distância até a meta, em pontos percentuais.
export default function MetaChip({ pct, meta = META_OTIF_PADRAO }) {
  const diff = Math.round((pct - meta) * 10) / 10;
  const ok = diff >= 0;
  const Icone = ok ? CheckCircle : WarningCircle;
  return (
    <span className={`meta ${ok ? "meta-ok" : "meta-bad"}`}>
      <Icone size={14} weight="fill" aria-hidden="true" />
      {ok ? "Na meta" : "Abaixo da meta"}, {ok ? "+" : ""}
      {fmtPct(diff)} p.p.
    </span>
  );
}
