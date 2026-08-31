import { useEffect, useMemo, useState } from "react";
import { motivoLabel } from "../api.js";

const STATUS_RANK = { pendente: 0, falha: 1, otif: 2 };

// Colunas ordenáveis (a coluna de ação fica de fora).
const COLUMNS = [
  { key: "status", label: "Status", get: (it) => STATUS_RANK[it.status] ?? 9 },
  { key: "pedido", label: "Pedido", get: (it) => it.pedido_numero },
  { key: "cliente", label: "Cliente", get: (it) => (it.cliente || "").toLowerCase() },
  { key: "sku", label: "SKU", get: (it) => it.sku },
  { key: "solicitada", label: "Solicitada", get: (it) => it.data_solicitada },
  { key: "prazo", label: "Prazo", get: (it) => it.dias_restantes },
  { key: "faturamento", label: "Faturamento", get: (it) => it.data_faturamento },
  { key: "entrega", label: "Entrega", get: (it) => it.data_entrega_real },
  {
    key: "qtd",
    label: "Faturado / Pedido",
    num: true,
    get: (it) => (Number(it.qtd_pedida) ? Number(it.qtd_faturada) / Number(it.qtd_pedida) : 0),
  },
  { key: "atraso", label: "Atraso", get: (it) => it.dias_atraso },
  { key: "motivo", label: "Motivo", get: (it) => it.motivo_falha || "" },
];
const COLS_TOTAL = COLUMNS.length + 1; // + coluna de ação

function isVazio(v) {
  return v == null || v === "";
}

function compare(a, b, get, dir) {
  const va = get(a);
  const vb = get(b);
  // Nulos/vazios sempre por último, independente da direção.
  if (isVazio(va) && isVazio(vb)) return 0;
  if (isVazio(va)) return 1;
  if (isVazio(vb)) return -1;
  let r;
  if (typeof va === "number" && typeof vb === "number") r = va - vb;
  else r = String(va).localeCompare(String(vb), "pt-BR");
  return dir === "asc" ? r : -r;
}

function StatusBadge({ status }) {
  const map = {
    otif: { txt: "OTIF", cls: "badge-ok" },
    falha: { txt: "Falha", cls: "badge-fail" },
    pendente: { txt: "Pendente", cls: "badge-pend" },
  };
  const s = map[status] || map.pendente;
  return <span className={`badge ${s.cls}`}>{s.txt}</span>;
}

function PrazoCell({ it }) {
  if (it.status !== "pendente" || it.dias_restantes == null) {
    return <span className="prazo-neutro">-</span>;
  }
  const d = it.dias_restantes;
  const cls =
    it.situacao_prazo === "vencido"
      ? "prazo-vencido"
      : it.situacao_prazo === "atencao"
      ? "prazo-atencao"
      : "prazo-ok";
  let txt;
  if (d < 0) txt = `vencido há ${Math.abs(d)}d`;
  else if (d === 0) txt = "vence hoje";
  else txt = `faltam ${d}d`;
  return (
    <span className={cls} title={`Prazo: ${it.prazo_entrega}`}>
      {txt}
    </span>
  );
}

function QtdCell({ pedida, faturada }) {
  const p = Number(pedida) || 0;
  const f = Number(faturada) || 0;
  const pct = p > 0 ? Math.min(100, (f / p) * 100) : 0;
  const full = p > 0 && f >= p;
  return (
    <>
      <div className="qtd">
        {f} de {p}
      </div>
      <div className={`qtd-bar ${full ? "full" : ""}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function exportarCsv(linhas) {
  const cabecalho = [
    "Status",
    "Pedido",
    "Cliente",
    "SKU",
    "Descrição",
    "Solicitada",
    "Prazo",
    "Dias restantes",
    "Faturamento",
    "Entrega",
    "Qtd pedida",
    "Qtd faturada",
    "Dias atraso",
    "Origem atraso",
    "Motivo",
  ];
  const corpo = linhas.map((it) =>
    [
      it.status,
      it.pedido_numero,
      it.cliente,
      it.sku,
      it.descricao,
      it.data_solicitada,
      it.prazo_entrega,
      it.dias_restantes,
      it.data_faturamento,
      it.data_entrega_real,
      it.qtd_pedida,
      it.qtd_faturada,
      it.dias_atraso,
      it.origem_atraso,
      it.motivo_falha ? motivoLabel(it.motivo_falha) : "",
    ]
      .map(csvEscape)
      .join(";")
  );
  const conteudo = "\uFEFF" + [cabecalho.map(csvEscape).join(";"), ...corpo].join("\r\n");
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `otif-itens-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ItensTable({ itens, onConfirmar, onDetalhe, carregando = false }) {
  // Padrão: prazo ascendente = pendentes mais urgentes (vencidos) no topo, entregues por último.
  const [sortKey, setSortKey] = useState("prazo");
  const [sortDir, setSortDir] = useState("asc");
  const [densidade, setDensidade] = useState("confortavel");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  const col = COLUMNS.find((c) => c.key === sortKey) || COLUMNS[0];

  const ordenados = useMemo(() => {
    const arr = [...itens];
    arr.sort((a, b) => compare(a, b, col.get, sortDir));
    return arr;
  }, [itens, col, sortDir]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / pageSize));

  useEffect(() => {
    setPage(0);
  }, [itens, sortKey, sortDir, pageSize]);

  const inicio = page * pageSize;
  const paginaItens = ordenados.slice(inicio, inicio + pageSize);
  const vazio = !carregando && itens.length === 0;

  function ordenarPor(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Itens de pedido</h3>
        <span className="panel-hint">
          {carregando ? "carregando…" : `${itens.length} ${itens.length === 1 ? "item" : "itens"}`}
        </span>
      </div>

      <div className="tabela-toolbar">
        <div className="densidade-toggle" role="group" aria-label="Densidade da tabela">
          <button
            className={densidade === "confortavel" ? "ativo" : ""}
            onClick={() => setDensidade("confortavel")}
          >
            Confortável
          </button>
          <button
            className={densidade === "compacta" ? "ativo" : ""}
            onClick={() => setDensidade("compacta")}
          >
            Compacta
          </button>
        </div>
        <div className="toolbar-spacer" />
        <button
          className="btn-sec"
          onClick={() => exportarCsv(ordenados)}
          disabled={ordenados.length === 0}
        >
          Exportar CSV
        </button>
      </div>

      <div className="tabela-wrap">
        <table className={`tabela ${densidade === "compacta" ? "compacta" : ""}`}>
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const ativo = c.key === sortKey;
                return (
                  <th
                    key={c.key}
                    className={`sortable ${c.num ? "num" : ""}`}
                    onClick={() => ordenarPor(c.key)}
                    aria-sort={ativo ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span className="th-inner">
                      {c.label}
                      {ativo && <span className="sort-ind">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </span>
                  </th>
                );
              })}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {carregando &&
              itens.length === 0 &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {Array.from({ length: COLS_TOTAL }).map((__, j) => (
                    <td key={j}>
                      <div className="skeleton sk-line" style={{ marginBottom: 0 }} />
                    </td>
                  ))}
                </tr>
              ))}

            {vazio && (
              <tr>
                <td className="tabela-vazio" colSpan={COLS_TOTAL}>
                  Nenhum item encontrado com os filtros atuais.
                </td>
              </tr>
            )}

            {paginaItens.map((it) => (
              <tr
                key={it.item_id}
                className="clicavel"
                onClick={() => onDetalhe?.(it)}
                title="Ver detalhe"
              >
                <td>
                  <StatusBadge status={it.status} />
                </td>
                <td>{it.pedido_numero}</td>
                <td className="cliente" title={it.cliente}>
                  {it.cliente}
                </td>
                <td>{it.sku}</td>
                <td>{it.data_solicitada}</td>
                <td>
                  <PrazoCell it={it} />
                </td>
                <td>{it.data_faturamento || "-"}</td>
                <td>{it.data_entrega_real || "-"}</td>
                <td className="num">
                  <QtdCell pedida={it.qtd_pedida} faturada={it.qtd_faturada} />
                </td>
                <td className={it.dias_atraso > 0 ? "atraso" : ""}>
                  {it.dias_atraso == null
                    ? "-"
                    : it.dias_atraso > 0
                    ? `+${it.dias_atraso}d ${it.origem_atraso ? `(${it.origem_atraso})` : ""}`
                    : "no prazo"}
                </td>
                <td>{it.motivo_falha ? motivoLabel(it.motivo_falha) : "-"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn-link" onClick={() => onConfirmar(it)}>
                    {it.status === "pendente" ? "Confirmar" : "Editar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ordenados.length > 0 && (
        <div className="pager">
          <label>
            Linhas por página{" "}
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <span>
            {inicio + 1}–{Math.min(inicio + pageSize, ordenados.length)} de {ordenados.length}
          </span>
          <div className="pager-btns">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPaginas - 1, p + 1))}
              disabled={page >= totalPaginas - 1}
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
