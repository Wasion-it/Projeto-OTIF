import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api } from "./api.js";
import { useHashRoute } from "./hooks/useHashRoute.js";
import { usePreferencia } from "./hooks/usePreferencia.js";
import Sidebar from "./components/Sidebar.jsx";
import ConfirmacaoModal from "./components/ConfirmacaoModal.jsx";
import EtapaModal from "./components/EtapaModal.jsx";
import ConfirmarEtapaModal from "./components/ConfirmarEtapaModal.jsx";
import NegarProducaoModal from "./components/NegarProducaoModal.jsx";
import ItemDrawer from "./components/ItemDrawer.jsx";
import VisaoGeral from "./pages/VisaoGeral.jsx";
import Pedidos from "./pages/Pedidos.jsx";
import Ajustes from "./pages/Ajustes.jsx";
import { META_OTIF_PADRAO, fmtInteiro } from "./lib/format.js";
import {
  FILTROS_PEDIDOS_VAZIOS,
  filtrosGerais,
  filtrosPedidosIguais,
  normalizarFiltrosPedidos,
  removerFiltroPedido,
  temFiltrosPedidos,
} from "./lib/pedidosFiltros.js";

const TITULO_ROTA = {
  "visao-geral": "Visão geral",
  pedidos: "Pedidos",
  ajustes: "Ajustes",
};

const TAMANHOS_PAGINA = [25, 50, 100, 200];
const INTERVALO_AUTO_MS = 30000;

export default function App() {
  const { route, navigate } = useHashRoute();

  const [filtrosAplicados, setFiltrosAplicados] = useState(() => ({
    ...FILTROS_PEDIDOS_VAZIOS,
  }));
  const [filtrosRascunho, setFiltrosRascunho] = useState(() => ({
    ...FILTROS_PEDIDOS_VAZIOS,
  }));

  // Ordenacao e paginacao da listagem de pedidos (agora feitas no servidor).
  const [ordenacao, setOrdenacao] = useState({ sort: "prazo", order: "asc" });
  const [page, setPage] = useState(1);
  const [pageSizeSalvo, setPageSize] = usePreferencia("otif.tabela.pageSize", 25);
  const pageSize = TAMANHOS_PAGINA.includes(pageSizeSalvo) ? pageSizeSalvo : 25;
  const [totalItens, setTotalItens] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const [metricas, setMetricas] = useState(null);
  const [tendencia, setTendencia] = useState([]);
  const [clientesRanking, setClientesRanking] = useState([]);
  const [itens, setItens] = useState([]);
  const [config, setConfig] = useState(null);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [itemAtivo, setItemAtivo] = useState(null); // modal de confirmação de entrega
  const [etapaAtiva, setEtapaAtiva] = useState(null); // modal de edição de todas as etapas
  const [etapaConfirmar, setEtapaConfirmar] = useState(null); // { item, etapa opcional }
  const [negativaProducao, setNegativaProducao] = useState(null);
  const [detalheItemId, setDetalheItemId] = useState(null); // pedido selecionado no drawer
  const carregarGeracaoRef = useRef(0);
  const carregandoRef = useRef(false);

  const detalheItem =
    detalheItemId == null
      ? null
      : itens.find((item) => item.pedido_id === detalheItemId) || null;
  const haModalAberto = Boolean(
    itemAtivo || etapaAtiva || etapaConfirmar || negativaProducao
  );

  useEffect(() => {
    api.config().then(setConfig).catch(() => {});
  }, []);

  // Carregamento central: cada rota busca só o que precisa. O token impede
  // respostas antigas de sobrescreverem filtros ou dados recém-salvos.
  const carregar = useCallback(async ({ force = false } = {}) => {
    if (carregandoRef.current) return;
    carregandoRef.current = true;
    const geracao = ++carregarGeracaoRef.current;
    setCarregando(true);
    setErro(null);
    try {
      if (route === "pedidos") {
        const resp = await api.pedidos({
          ...filtrosAplicados,
          sort: ordenacao.sort,
          order: ordenacao.order,
          page,
          page_size: pageSize,
          force_refresh: force || undefined,
        });
        if (geracao !== carregarGeracaoRef.current) return;

        const paginasDisponiveis = Math.max(1, resp.total_pages || 1);
        if (page > paginasDisponiveis) {
          setPage(paginasDisponiveis);
          return;
        }

        setItens(resp.items);
        setTotalItens(resp.total);
        setTotalPaginas(paginasDisponiveis);
      } else if (route === "visao-geral") {
        const filtrosVisaoGeral = {
          ...filtrosGerais(filtrosAplicados),
          force_refresh: force || undefined,
        };
        const [m, t, c] = await Promise.all([
          api.metricas(filtrosVisaoGeral),
          api.tendencia(filtrosVisaoGeral),
          api.clientes(filtrosVisaoGeral),
        ]);
        if (geracao !== carregarGeracaoRef.current) return;
        setMetricas(m);
        setTendencia(t);
        setClientesRanking(c);
      }
      if (geracao === carregarGeracaoRef.current) setAtualizadoEm(new Date());
    } catch (e) {
      if (geracao === carregarGeracaoRef.current) setErro(e.message);
    } finally {
      carregandoRef.current = false;
      setCarregando(false);
    }
  }, [route, filtrosAplicados, ordenacao, page, pageSize]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshKey]);

  // O painel consulta o JUND automaticamente. Suspende com aba oculta ou modal
  // aberto para evitar tráfego e mudanças sob um formulário em edição.
  useEffect(() => {
    if (route === "ajustes") return undefined;
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible" && !haModalAberto) carregar();
    }, INTERVALO_AUTO_MS);
    return () => window.clearInterval(intervalo);
  }, [carregar, haModalAberto, route]);

  useEffect(() => {
    if (haModalAberto) {
      // Respostas iniciadas antes do modal nao podem substituir o objeto sendo editado.
      carregarGeracaoRef.current += 1;
    }
  }, [haModalAberto]);

  // Mantém o drawer ligado ao objeto mais recente da listagem. Se uma ação
  // retirar o pedido do filtro/página atual, o detalhe é fechado sem ficar obsoleto.
  useEffect(() => {
    if (route !== "pedidos") {
      setDetalheItemId(null);
      setItemAtivo(null);
      setEtapaAtiva(null);
      setEtapaConfirmar(null);
      setNegativaProducao(null);
      return;
    }
    if (!carregando && detalheItemId != null && !detalheItem) {
      setDetalheItemId(null);
    }
  }, [route, carregando, detalheItemId, detalheItem]);

  // Rascunhos não aplicados são descartados ao sair da tela de Pedidos.
  useEffect(() => {
    if (route !== "pedidos") setFiltrosRascunho({ ...filtrosAplicados });
  }, [route, filtrosAplicados]);

  // O formulário edita um rascunho. Somente Aplicar, chips e Limpar filtros
  // alteram o snapshot usado nas consultas.
  function aplicarFiltrosPedidos(proximosFiltros) {
    const normalizados = normalizarFiltrosPedidos(proximosFiltros);
    setFiltrosRascunho(normalizados);
    if (filtrosPedidosIguais(normalizados, filtrosAplicados)) return;
    setFiltrosAplicados(normalizados);
    setPage(1);
  }

  // A barra de segmentos aplica na hora (1 clique = 1 intenção) e preserva o
  // que estiver digitado em cliente/período sem aplicar.
  function aplicarSegmentoPedidos(segmento) {
    const proximos = normalizarFiltrosPedidos({ ...filtrosAplicados, ...segmento });
    setFiltrosRascunho((rascunho) =>
      normalizarFiltrosPedidos({ ...rascunho, ...segmento })
    );
    if (filtrosPedidosIguais(proximos, filtrosAplicados)) return;
    setFiltrosAplicados(proximos);
    setPage(1);
  }

  function limparFiltrosPedidos() {
    const vazios = { ...FILTROS_PEDIDOS_VAZIOS };
    setFiltrosRascunho(vazios);
    if (!temFiltrosPedidos(filtrosAplicados)) return;
    setFiltrosAplicados(vazios);
    setPage(1);
  }

  function removerFiltroAtivo(chave) {
    const proximosAplicados = removerFiltroPedido(filtrosAplicados, chave);
    const proximoRascunho = removerFiltroPedido(filtrosRascunho, chave);
    setFiltrosRascunho(proximoRascunho);
    if (filtrosPedidosIguais(proximosAplicados, filtrosAplicados)) return;
    setFiltrosAplicados(proximosAplicados);
    setPage(1);
  }

  // Alterna a ordenacao: mesma coluna inverte a direcao; nova coluna comeca asc.
  function ordenarPor(sort) {
    setOrdenacao((o) =>
      o.sort === sort ? { sort, order: o.order === "asc" ? "desc" : "asc" } : { sort, order: "asc" }
    );
    setPage(1);
  }

  function mudarPageSize(size) {
    setPageSize(size);
    setPage(1);
  }

  // Busca todas as páginas do filtro aplicado para não truncar o CSV em 1.000 linhas.
  async function carregarTodosPedidos() {
    const pageSizeExportacao = 1000;
    const parametros = {
      ...filtrosAplicados,
      sort: ordenacao.sort,
      order: ordenacao.order,
      page_size: pageSizeExportacao,
    };
    const primeiraPagina = await api.pedidos({ ...parametros, page: 1 });
    const linhas = [...primeiraPagina.items];

    for (let paginaAtual = 2; paginaAtual <= primeiraPagina.total_pages; paginaAtual += 1) {
      const paginaExportacao = await api.pedidos({ ...parametros, page: paginaAtual });
      linhas.push(...paginaExportacao.items);
    }
    return linhas;
  }

  // Drill da Visão geral para a lista de Pedidos, já filtrada pela situação do Contract Date.
  function drillSituacao(situacao) {
    aplicarFiltrosPedidos({
      ...filtrosAplicados,
      status: "pendente",
      situacao_prazo: situacao,
    });
    navigate("pedidos");
  }

  function drillSemContractDate() {
    aplicarFiltrosPedidos({
      ...filtrosAplicados,
      status: "sem_contract_date",
      situacao_prazo: "",
    });
    navigate("pedidos");
  }

  const horaAtualizacao = atualizadoEm
    ? atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const metaOtif = config?.meta_otif ?? META_OTIF_PADRAO;

  // Subtítulo carrega dado, não descrição do produto.
  function subtituloRota() {
    if (route === "visao-geral") {
      if (!metricas) return `Meta ≥ ${metaOtif}%`;
      return `Meta ≥ ${metaOtif}% · ${fmtInteiro(
        metricas.total_avaliados
      )} avaliados · ${fmtInteiro(metricas.total_pendentes)} pendentes`;
    }
    if (route === "pedidos") {
      if (carregando && itens.length === 0) return "consultando o JUND…";
      return `${fmtInteiro(totalItens)} ${
        totalItens === 1 ? "pedido" : "pedidos"
      } no recorte atual`;
    }
    return "Meta de OTIF e alerta de proximidade do Contract Date";
  }

  return (
    <div className="shell">
      <Sidebar route={route} navigate={navigate} apiOk={!erro} />

      <div className="content">
        <div className="content-inner">
          <header className="topo">
            <div className="topo-titulo">
              <h1>{TITULO_ROTA[route] || TITULO_ROTA["visao-geral"]}</h1>
              <span className="topo-sub">{subtituloRota()}</span>
            </div>
            <div className="topo-acoes">
              {horaAtualizacao && (
                <span
                  className={`topo-atualizado ${carregando ? "carregando" : ""}`}
                  title={
                    route === "ajustes"
                      ? undefined
                      : "A tela recarrega sozinha a cada 30 segundos"
                  }
                >
                  <span className="pulso" aria-hidden="true" />
                  Atualizado às {horaAtualizacao}
                  {route !== "ajustes" && ", recarrega a cada 30 s"}
                </span>
              )}
              <button
                className="btn-sec"
                onClick={() => carregar({ force: true })}
                disabled={carregando}
              >
                <ArrowClockwise
                  className={`ico ${carregando ? "gira" : ""}`}
                  size={16}
                  weight="bold"
                  aria-hidden="true"
                />
                {carregando ? "Atualizando…" : "Atualizar"}
              </button>
            </div>
          </header>

          {erro && (
            <div className="erro" role="alert">
              <WarningCircle className="ico" size={18} weight="fill" aria-hidden="true" />
              <span>
                Não foi possível consultar a API: {erro}. Verifique a conexão com o JUND e
                use Atualizar.
              </span>
            </div>
          )}

          {route === "visao-geral" && (
            <VisaoGeral
              metricas={metricas}
              tendencia={tendencia}
              clientes={clientesRanking}
              carregando={carregando}
              filtros={filtrosAplicados}
              meta={metaOtif}
              diasAlerta={config?.dias_alerta_prazo}
              onPeriodo={(datas) => aplicarFiltrosPedidos({ ...filtrosAplicados, ...datas })}
              onRemoverCliente={() => removerFiltroAtivo("cliente")}
              onDrillSituacao={drillSituacao}
              onDrillSemContractDate={drillSemContractDate}
            />
          )}

          {route === "pedidos" && (
            <Pedidos
              filtros={filtrosAplicados}
              filtrosRascunho={filtrosRascunho}
              onFiltrosRascunho={setFiltrosRascunho}
              onAplicarFiltros={aplicarFiltrosPedidos}
              onAplicarSegmento={aplicarSegmentoPedidos}
              onLimparFiltros={limparFiltrosPedidos}
              onRemoverFiltro={removerFiltroAtivo}
              itens={itens}
              carregando={carregando}
              ordenacao={ordenacao}
              onOrdenar={ordenarPor}
              page={page}
              pageSize={pageSize}
              totalItens={totalItens}
              totalPaginas={totalPaginas}
              onPage={setPage}
              onPageSize={mudarPageSize}
              onExportCsv={carregarTodosPedidos}
              onConfirmar={setItemAtivo}
              onConfirmarEtapa={(item, etapa = null) => setEtapaConfirmar({ item, etapa })}
              pedidoSelecionadoId={detalheItemId}
              onDetalhe={(item) => setDetalheItemId(item.pedido_id)}
            />
          )}

          {route === "ajustes" && <Ajustes onConfigChange={(cfg) => setConfig(cfg)} />}
        </div>
      </div>

      {detalheItem && (
        <ItemDrawer
          item={detalheItem}
          suspenso={haModalAberto}
          onClose={() => setDetalheItemId(null)}
          onConfirmar={setItemAtivo}
          onConfirmarEtapa={(item, etapa = null) => setEtapaConfirmar({ item, etapa })}
          onNegarProducao={setNegativaProducao}
          onEtapa={setEtapaAtiva}
        />
      )}

      {itemAtivo && (
        <ConfirmacaoModal
          item={itemAtivo}
          onClose={() => setItemAtivo(null)}
          onSaved={() => {
            toast.success(`Entrega do pedido ${itemAtivo.numero} salva.`);
            setItemAtivo(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {etapaAtiva && (
        <EtapaModal
          item={etapaAtiva}
          onClose={() => setEtapaAtiva(null)}
          onSaved={() => {
            toast.success(`Etapas do pedido ${etapaAtiva.numero} salvas.`);
            setEtapaAtiva(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {etapaConfirmar && (
        <ConfirmarEtapaModal
          item={etapaConfirmar.item}
          etapaForcada={etapaConfirmar.etapa}
          onClose={() => setEtapaConfirmar(null)}
          onSaved={() => {
            const etapa = etapaConfirmar.etapa || etapaConfirmar.item.processo?.etapa_atual;
            toast.success(
              etapa === "comercial"
                ? `Inspeção do pedido ${etapaConfirmar.item.numero} agendada.`
                : `Etapa do pedido ${etapaConfirmar.item.numero} confirmada.`
            );
            setEtapaConfirmar(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {negativaProducao && (
        <NegarProducaoModal
          item={negativaProducao}
          onClose={() => setNegativaProducao(null)}
          onSaved={() => {
            toast.success(`Negativa de produção do pedido ${negativaProducao.numero} registrada.`);
            setNegativaProducao(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
