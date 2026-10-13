import { fmtPct } from "../lib/format.js";

// Régua 0–100% com a marca da meta. Mostra de relance a distância até o alvo,
// sem precisar ler o número: a barra passa ou não passa da marca.
export default function Regua({ valor, meta, tom = "neutro" }) {
  const v = Math.max(0, Math.min(100, Number(valor) || 0));
  const m = Math.max(0, Math.min(100, Number(meta) || 0));

  return (
    <div className={`regua regua-${tom}`} aria-hidden="true">
      <span
        className={`regua-meta-rotulo ${m > 75 ? "a-esquerda" : ""}`}
        style={{ left: `${m}%` }}
      >
        meta {fmtPct(m)}%
      </span>
      <div className="regua-trilho">
        <span className="regua-valor" style={{ width: `${v}%` }} />
      </div>
      <span className="regua-meta" style={{ left: `${m}%` }} />
    </div>
  );
}
