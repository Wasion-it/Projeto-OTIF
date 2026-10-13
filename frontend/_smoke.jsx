// Smoke test temporário: renderiza as telas reformuladas com os payloads reais
// da API para pegar erros de render que o build não pega.
import { renderToString } from "react-dom/server";
import VisaoGeral from "./src/pages/VisaoGeral.jsx";
import Pedidos from "./src/pages/Pedidos.jsx";
import ItemDrawer from "./src/components/ItemDrawer.jsx";

const BASE = "http://localhost:8000";

globalThis.window = {
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
};

async function get(caminho) {
  const resposta = await fetch(`${BASE}${caminho}`);
  if (!resposta.ok) throw new Error(`${caminho} -> ${resposta.status}`);
  return resposta.json();
}

function checar(nome, elemento) {
  const html = renderToString(elemento);
  if (!html || html.length < 50) throw new Error(`${nome}: HTML suspeito (${html.length} bytes)`);
  console.log(`OK   ${nome} (${html.length} bytes)`);
  return html;
}

const filtrosVazios = {
  data_ini: "",
  data_fim: "",
  cliente: "",
  status: "",
  situacao_prazo: "",
};

const [metricas, tendencia, clientes, listagem, config] = await Promise.all([
  get("/metrics/otif"),
  get("/metrics/tendencia"),
  get("/metrics/clientes"),
  get("/pedidos?page=1&page_size=25"),
  get("/config"),
]);

const htmlVisao = checar(
  "VisaoGeral (com dados)",
  <VisaoGeral
    metricas={metricas}
    tendencia={tendencia}
    clientes={clientes}
    carregando={false}
    filtros={filtrosVazios}
    meta={config.meta_otif}
    diasAlerta={config.dias_alerta_prazo}
    onPeriodo={() => {}}
    onRemoverCliente={() => {}}
    onDrillSituacao={() => {}}
    onDrillSemContractDate={() => {}}
  />
);

checar(
  "VisaoGeral (carregando, sem métricas)",
  <VisaoGeral
    metricas={null}
    tendencia={[]}
    clientes={[]}
    carregando
    filtros={filtrosVazios}
    onPeriodo={() => {}}
    onRemoverCliente={() => {}}
    onDrillSituacao={() => {}}
    onDrillSemContractDate={() => {}}
  />
);

const propsPedidos = {
  filtros: filtrosVazios,
  filtrosRascunho: filtrosVazios,
  onFiltrosRascunho: () => {},
  onAplicarFiltros: () => {},
  onAplicarSegmento: () => {},
  onLimparFiltros: () => {},
  onRemoverFiltro: () => {},
  itens: listagem.items,
  carregando: false,
  ordenacao: { sort: "prazo", order: "asc" },
  onOrdenar: () => {},
  page: 1,
  pageSize: 25,
  totalItens: listagem.total,
  totalPaginas: listagem.total_pages,
  onPage: () => {},
  onPageSize: () => {},
  onExportCsv: async () => [],
  onConfirmar: () => {},
  onConfirmarEtapa: () => {},
  pedidoSelecionadoId: listagem.items[0]?.pedido_id ?? null,
  onDetalhe: () => {},
};

const htmlPedidos = checar("Pedidos (com linhas)", <Pedidos {...propsPedidos} />);
checar(
  "Pedidos (vazio)",
  <Pedidos {...propsPedidos} itens={[]} totalItens={0} totalPaginas={1} />
);

if (listagem.items[0]) {
  checar(
    "ItemDrawer",
    <ItemDrawer
      item={listagem.items[0]}
      onClose={() => {}}
      onConfirmar={() => {}}
      onConfirmarEtapa={() => {}}
      onNegarProducao={() => {}}
      onEtapa={() => {}}
    />
  );
}

// Asserções sobre o que a reformulação prometeu entregar.
const verificacoes = [
  ["barra de segmentos presente", htmlPedidos.includes('class="seg-barra"')],
  ["coluna de ações sticky presente", htmlPedidos.includes('class="col-acoes"')],
  ["densidade compacta é o padrão", htmlPedidos.includes("tabela compacta")],
  ["seletor de colunas presente", htmlPedidos.includes("Colunas")],
  [
    "colunas padrão reduzidas (sem Nota fiscal na visão inicial)",
    !htmlPedidos.includes(">Nota fiscal<"),
  ],
  ["recorte de período na Visão geral", htmlVisao.includes('class="recorte"')],
  // O SVG em si é desenhado após medir o container (client-only), então aqui
  // verificamos o container e os eixos; as barras antigas não devem existir.
  ["container do gráfico de linha presente", htmlVisao.includes('class="grafico-plot"')],
  ["eixo de meta ajustado ao domínio", htmlVisao.includes("grafico-y-meta")],
  ["gráfico de barras removido", !htmlVisao.includes("trend-bar")],
  ["tiles de risco são botões", htmlVisao.includes('<button type="button" class="metric')],
];

let falhou = false;
for (const [nome, ok] of verificacoes) {
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}`);
  if (!ok) falhou = true;
}
if (falhou) process.exit(1);
console.log("\nSmoke test concluido sem erros.");
