import { useEffect, useMemo, useState } from "react";
import PeriodoFiltro from "../components/PeriodoFiltro.jsx";

const ORDEM = { vencido: 0, atencao: 1, no_prazo: 2 };
const TOM = { vencido: "ruim", atencao: "medio", no_prazo: "bom" };

function textoPrazo(it) {
  const d = it.dias_restantes;
  if (d == null) return "-";
  if (d < 0) return `vencido há ${Math.abs(d)}d`;
  if (d === 0) return "vence hoje";
  return `faltam ${d}d`;
}

function WorklistItem({ it, onConfirmar, onDetalhe }) {
  const tom = TOM[it.situacao_prazo] || "bom";
  return (
    <div className={`wl-item wl-${tom}`}>
      <div className="wl-main" onClick={() => onDetalhe(it)} role="button" tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onDetalhe(it);
          }
        }}
      >
        <div className="wl-top">
          <span className={`wl-prazo prazo-${tom === "ruim" ? "vencido" : tom === "medio" ? "atencao" : "ok"}`}>
            {textoPrazo(it)}
          </span>
          <strong className="wl-cliente" title={it.cliente}>
            {it.cliente}
          </strong>
        </div>
        <div className="wl-sub" title={it.descricao}>
          {it.pedido_numero} · {it.sku} · {it.descricao}
        </div>
        <div className="wl-meta">
          Solicitada {it.data_solicitada} · Prazo {it.prazo_entrega} · {it.qtd_faturada} de{" "}
          {it.qtd_pedida} faturado
        </div>
      </div>
      <div className="wl-acoes">
        <button className="btn-link" onClick={() => onDetalhe(it)}>
          Detalhe
        </button>
        <button className="btn" onClick={() => onConfirmar(it)}>
          Confirmar entrega
        </button>
      </div>
    </div>
  );
}

export default function Confirmacoes({
  filtros,
  onFiltro,
  onLimpar,
  temFiltros,
  situacaoFiltro,
  setSituacaoFiltro,
  itens,
  carregando,
  onConfirmar,
  onDetalhe,
}) {
  const [limite, setLimite] = useState(50);

  const contagem = useMemo(() => {
    const c = { vencido: 0, atencao: 0, no_prazo: 0 };
    for (const it of itens) if (it.situacao_prazo in c) c[it.situacao_prazo] += 1;
    return c;
  }, [itens]);

  const ordenados = useMemo(() => {
    const arr = situacaoFiltro
      ? itens.filter((it) => it.situacao_prazo === situacaoFiltro)
      : [...itens];
    arr.sort(
      (a, b) =>
        (ORDEM[a.situacao_prazo] ?? 9) - (ORDEM[b.situacao_prazo] ?? 9) ||
        (a.dias_restantes ?? 0) - (b.dias_restantes ?? 0)
    );
    return arr;
  }, [itens, situacaoFiltro]);

  useEffect(() => {
    setLimite(50);
  }, [situacaoFiltro, itens]);

  const chips = [
    { id: "", label: "Todos", n: itens.length },
    { id: "vencido", label: "Vencidos", n: contagem.vencido },
    { id: "atencao", label: "Atenção", n: contagem.atencao },
    { id: "no_prazo", label: "No prazo", n: contagem.no_prazo },
  ];

  const visiveis = ordenados.slice(0, limite);

  return (
    <>
      <PeriodoFiltro
        filtros={filtros}
        onFiltro={onFiltro}
        onLimpar={onLimpar}
        temFiltros={temFiltros}
      />

      <div className="chips" role="group" aria-label="Filtrar por prazo">
        {chips.map((c) => (
          <button
            key={c.id || "todos"}
            className={`chip ${situacaoFiltro === c.id ? "ativo" : ""}`}
            onClick={() => setSituacaoFiltro(c.id)}
          >
            {c.label}
            <span className="chip-n">{c.n}</span>
          </button>
        ))}
      </div>

      {carregando && itens.length === 0 ? (
        <div className="wl">
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="wl-item" key={i}>
              <div className="wl-main">
                <div className="skeleton sk-line" style={{ width: "40%" }} />
                <div className="skeleton sk-line" style={{ width: "70%", marginBottom: 0 }} />
              </div>
            </div>
          ))}
        </div>
      ) : ordenados.length === 0 ? (
        <div className="panel">
          <p className="vazio" style={{ textAlign: "center", padding: "24px 0", margin: 0 }}>
            Nenhuma confirmação pendente com os filtros atuais.
          </p>
        </div>
      ) : (
        <>
          <div className="wl">
            {visiveis.map((it) => (
              <WorklistItem
                key={it.item_id}
                it={it}
                onConfirmar={onConfirmar}
                onDetalhe={onDetalhe}
              />
            ))}
          </div>
          {limite < ordenados.length && (
            <div className="wl-mais">
              <button className="btn-sec" onClick={() => setLimite((l) => l + 50)}>
                Ver mais ({ordenados.length - limite} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
