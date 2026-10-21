import { useCallback, useEffect, useRef, useState } from "react";
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
import Comercial from "./pages/Comercial.jsx";
import { META_OTIF_PADRAO, fmtInteiro } from "./lib/format.js";
import { nomeEtapa } from "./lib/etapas.js";
import {
  FILTROS_PEDIDOS_VAZIOS,
  filtrosGerais,
  filtrosPedidosIguais,
  normalizarFiltrosPedidos,
  removerFiltroPedido,
  temFiltrosPedidos,
} from "./lib/pedidosFiltros.js";

const TITULO_ROTA = {
  pedidos: "Pedidos",
  comercial: "Comercial",
  "visao-geral": "Visão geral",
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

  // Ordenação e paginação da listagem são feitas no servidor.
  const [ordenacao, setOrdenacao] = useState({ sort: "prazo", order: "asc" });
  const [page, setPage] = useState(1);
  const [pageSizeSalvo, setPageSize] = usePreferencia("otif.tabela.pageSize", 25);
  const pageSize = TAMANHOS_PAGINA.includes(pageSizeSalvo) ? pageSizeSalvo : 25;
  const [totalItens, setTotalItens] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const [metricas, setMetricas] = useState(null);
  const [tendencia, setTendencia] = useState([]);
  const [clientesRanking, setClientesRanking] = useState([]);
  const [processo, setProcesso] = useState(null);
  const [itens, setItens] = useState([]);
  const [config, setConfig] = useState(null);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [itemAtivo, setItemAtivo] = useState(null); // modal de entrega
  const [etapaAtiva, setEtapaAtiva] = useState(null); // editor de todas as etapas
  const [etapaConfirmar, setEtapaConfirmar] = useState(null); // { item, etapa opcional }
  const [negativaProducao, setNegativaProducao] = useState(null);
  const [detalheItemId, setDetalheItemId] = useState(null); // pedido no drawer
  const [selecionados, setSelecionados] = useState(() => new Set()); // lote
  const carregarGeracaoRef = useRef(0);
  const carregandoRef = useRef(false);

  const detalheItem =
    detalheItemId == null
      ? null
      : itens.find((item) => item.pedido_id === detalheItemId) || null;
  const haModalAberto = Boolean(
    itemAtivo || etapaAtiva || etapaConfirmar || negativaProducao
  );
  // Seleção de lote em curso também segura a atualização automática: a lista
  // não pode mudar sob os pedidos marcados.
  const pausarAuto = haModalAberto || selecionados.size > 0;

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
        const [resp, proc] = await Promise.all([
          api.pedidos({
            ...filtrosAplicados,
            sort: ordenacao.sort,
            order: ordenacao.order,
            page,
            page_size: pageSize,
            force_refresh: force || undefined,
          }),
          // Contagem por etapa no mesmo recorte da lista, exceto a própria etapa.
          api.processo({
            ...filtrosGerais(filtrosAplicados),
            status: filtrosAplicados.status,
            situacao_prazo: filtrosAplicados.situacao_prazo,
          }),
        ]);
        if (geracao !== carregarGeracaoRef.current) return;

        const paginasDisponiveis = Math.max(1, resp.total_pages || 1);
        if (page > paginasDisponiveis) {
          setPage(paginasDisponiveis);
          return;
        }

        setItens(resp.items);
        setTotalItens(resp.total);
        setTotalPaginas(paginasDisponiveis);
        setProcesso(proc);
      } else if (route === "visao-geral") {
        const filtrosVisaoGeral = {
          ...filtrosGerais(filtrosAplicados),
          force_refresh: force || undefined,
        };
        const [m, t, c, p] = await Promise.all([
          api.metricas(filtrosVisaoGeral),
          api.tendencia(filtrosVisaoGeral),
          api.clientes(filtrosVisaoGeral),
          api.processo(filtrosGerais(filtrosAplicados)),
        ]);
        if (geracao !== carregarGeracaoRef.current) return;
        setMetricas(m);
        setTendencia(t);
        setClientesRanking(c);
        setProcesso(p);
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

  // Recarrega a cada 30 s. Suspende com aba oculta, modal aberto ou lote em
  // seleção para evitar tráfego e mudanças sob um formulário em edição.
  useEffect(() => {
    // Ajustes e Comercial não usam o carregamento central (Comercial se atualiza sozinho).
    if (route === "ajustes" || route === "comercial") return undefined;
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible" && !pausarAuto) carregar();
    }, INTERVALO_AUTO_MS);
    return () => window.clearInterval(intervalo);
  }, [carregar, pausarAuto, route]);

  useEffect(() => {
    if (haModalAberto) {
      // Respostas iniciadas antes do modal não podem substituir o objeto em edição.
      carregarGeracaoRef.current += 1;
    }
  }, [haModalAberto]);

  // A seleção de lote vale só para a página e o filtro em que foi feita.
  useEffect(() => {
    setSelecionados((atual) => (atual.size ? new Set() : atual));
  }, [route, filtrosAplicados, ordenacao, page, pageSize]);

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

  // Etapa e situação aplicam na hora (1 clique = 1 intenção) e preservam o
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

  // Mesma coluna inverte a direção; nova coluna começa crescente.
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

  function alternarSelecao(id, marcado) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (marcado) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }

  function selecionarPagina(ids, marcado) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      ids.forEach((id) => (marcado ? proximo.add(id) : proximo.delete(id)));
      return proximo;
    });
  }

  function loteConcluido({ ok, falhas }) {
    if (ok > 0) {
      toast.success(`${ok} ${ok === 1 ? "pedido registrado" : "pedidos registrados"}.`);
    }
    if (falhas.length > 0) {
      toast.error(
        `${falhas.length} não ${falhas.length === 1 ? "foi registrado" : "foram registrados"}: ` +
          falhas.map((f) => `${f.numero} (${f.mensagem})`).join("; "),
        { duration: 12000 }
      );
    }
    setSelecionados(new Set());
    setRefreshKey((k) => k + 1);
  }

  // Busca todas as páginas do filtro aplicado para não truncar o CSV em 1.000 linhas.
  async function carregarTodosPedidos() {
    const parametros = {
      ...filtrosAplicados,
      sort: ordenacao.sort,
      order: ordenacao.order,
      page_size: 1000,
    };
    const primeiraPagina = await api.pedidos({ ...parametros, page: 1 });
    const linhas = [...primeiraPagina.items];
    for (let paginaAtual = 2; paginaAtual <= primeiraPagina.total_pages; paginaAtual += 1) {
      const paginaExportacao = await api.pedidos({ ...parametros, page: paginaAtual });
      linhas.push(...paginaExportacao.items);
    }
    return linhas;
  }

  // Drill da Visão geral para Pedidos, já filtrado.
  function abrirPedidos(filtros) {
    aplicarFiltrosPedidos({ ...filtrosAplicados, etapa: "", status: "", situacao_prazo: "", ...filtros });
    navigate("pedidos");
  }

  const horaAtualizacao = atualizadoEm
    ? atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const metaOtif = config?.meta_otif ?? META_OTIF_PADRAO;

  function subtituloRota() {
    if (route === "pedidos") {
      if (carregando && itens.length === 0) return "Consultando o JUND…";
      const etapa = filtrosAplicados.etapa ? ` em ${nomeEtapa(filtrosAplicados.etapa)}` : "";
      return `${fmtInteiro(totalItens)} ${totalItens === 1 ? "pedido" : "pedidos"}${etapa}`;
    }
    if (route === "comercial") return "Pedidos, itens e acompanhamento comercial";
    if (route === "visao-geral") return `Meta de OTIF: ${metaOtif}%`;
    return "Parâmetros do painel";
  }

  const toastSalvo = (mensagem) => toast.success(mensagem);

  return (
    <div className="shell">
      <a className="pular" href="#conteudo">
        Ir para o conteúdo
      </a>
      <Sidebar route={route} navigate={navigate} />

      <main className="conteudo" id="conteudo">
        <header className="topo">
          <div>
            <h1>{TITULO_ROTA[route]}</h1>
            <p className="topo-sub">{subtituloRota()}</p>
          </div>
          {route !== "ajustes" && route !== "comercial" && (
            <div className="topo-acoes">
              {horaAtualizacao && (
                <span className="topo-hora" title="A tela recarrega sozinha a cada 30 segundos">
                  {carregando ? "Atualizando…" : `Atualizado às ${horaAtualizacao}`}
                </span>
              )}
              <button
                type="button"
                className="btn btn-sec"
                onClick={() => carregar({ force: true })}
                disabled={carregando}
              >
                Atualizar
              </button>
            </div>
          )}
        </header>

        {erro && (
          <div className="faixa-erro" role="alert">
            <span>
              {horaAtualizacao ? `Mostrando os dados das ${horaAtualizacao}. ` : ""}A API não
              respondeu: {erro}
            </span>
            <button type="button" className="btn btn-texto" onClick={() => carregar({ force: true })}>
              Tentar de novo
            </button>
          </div>
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
            processo={processo}
            itens={itens}
            carregando={carregando}
            ordenacao={ordenacao}
            onOrdenar={ordenarPor}
            onDefinirOrdenacao={(o) => {
              setOrdenacao(o);
              setPage(1);
            }}
            page={page}
            pageSize={pageSize}
            totalItens={totalItens}
            totalPaginas={totalPaginas}
            onPage={setPage}
            onPageSize={mudarPageSize}
            onExportCsv={carregarTodosPedidos}
            onConfirmar={setItemAtivo}
            onConfirmarEtapa={(item, etapa = null) => setEtapaConfirmar({ item, etapa })}
            onNegarProducao={setNegativaProducao}
            pedidoSelecionadoId={detalheItemId}
            onDetalhe={(item) => setDetalheItemId(item.pedido_id)}
            selecionados={selecionados}
            onAlternarSelecao={alternarSelecao}
            onSelecionarPagina={selecionarPagina}
            onLimparSelecao={() => setSelecionados(new Set())}
            onLoteConcluido={loteConcluido}
          />
        )}

        {route === "visao-geral" && (
          <VisaoGeral
            metricas={metricas}
            tendencia={tendencia}
            clientes={clientesRanking}
            processo={processo}
            carregando={carregando}
            filtros={filtrosAplicados}
            meta={metaOtif}
            diasAlerta={config?.dias_alerta_prazo ?? 7}
            onPeriodo={(datas) => aplicarFiltrosPedidos({ ...filtrosAplicados, ...datas })}
            onRemoverCliente={() => removerFiltroAtivo("cliente")}
            onAbrirPedidos={abrirPedidos}
            onAbrirAjustes={() => navigate("ajustes")}
          />
        )}

        {route === "comercial" && <Comercial />}

        {route === "ajustes" && <Ajustes onConfigChange={(cfg) => setConfig(cfg)} />}
      </main>

      {detalheItem && (
        <ItemDrawer
          item={detalheItem}
          metasDias={config?.metas_dias}
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
            toastSalvo(`Entrega do pedido ${itemAtivo.numero} registrada.`);
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
            toastSalvo(`Etapas do pedido ${etapaAtiva.numero} salvas.`);
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
            toastSalvo(
              etapa === "comercial"
                ? `Inspeção do pedido ${etapaConfirmar.item.numero} agendada.`
                : `${nomeEtapa(etapa)} do pedido ${etapaConfirmar.item.numero} confirmada.`
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
            toastSalvo(`Negativa de produção do pedido ${negativaProducao.numero} registrada.`);
            setNegativaProducao(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
