import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { useHashRoute } from "./hooks/useHashRoute.js";
import Sidebar from "./components/Sidebar.jsx";
import ConfirmacaoModal from "./components/ConfirmacaoModal.jsx";
import ItemDrawer from "./components/ItemDrawer.jsx";
import VisaoGeral from "./pages/VisaoGeral.jsx";
import Pedidos from "./pages/Pedidos.jsx";
import Confirmacoes from "./pages/Confirmacoes.jsx";

const META_ROTA = {
  "visao-geral": {
    titulo: "Visão geral",
    sub: "OTIF da operação — do recebimento do pedido à chegada no cliente",
  },
  pedidos: {
    titulo: "Pedidos",
    sub: "Todos os itens com status OTIF e situação de prazo",
  },
  confirmacoes: {
    titulo: "Confirmações",
    sub: "Registre a entrega dos itens em aberto, priorizando os vencidos",
  },
};

export default function App() {
  const { route, navigate } = useHashRoute();

  const [filtros, setFiltros] = useState({ data_ini: "", data_fim: "", cliente: "" });
  const [statusFiltro, setStatusFiltro] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("");

  const [metricas, setMetricas] = useState(null);
  const [tendencia, setTendencia] = useState([]);
  const [itens, setItens] = useState([]);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [itemAtivo, setItemAtivo] = useState(null); // modal de confirmação
  const [detalheItem, setDetalheItem] = useState(null); // drawer de detalhe
  const [info, setInfo] = useState(null);

  useEffect(() => {
    api.health().then(setInfo).catch(() => {});
  }, []);

  // Carregamento central: cada rota busca só o que precisa.
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      if (route === "pedidos") {
        const i = await api.itens({
          ...filtros,
          status: statusFiltro,
          situacao_prazo: situacaoFiltro,
        });
        setItens(i);
      } else if (route === "confirmacoes") {
        // Sempre carrega todos os pendentes; o filtro por situação é feito no cliente
        // (mantém a contagem dos chips correta e a troca instantânea).
        const i = await api.itens({ ...filtros, status: "pendente" });
        setItens(i);
      } else {
        const [m, t] = await Promise.all([api.metricas(filtros), api.tendencia(filtros)]);
        setMetricas(m);
        setTendencia(t);
      }
      setAtualizadoEm(new Date());
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [route, filtros, statusFiltro, situacaoFiltro]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshKey]);

  function aplicarFiltro(campo, valor) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
  }

  function limparFiltros() {
    setFiltros({ data_ini: "", data_fim: "", cliente: "" });
    setStatusFiltro("");
    setSituacaoFiltro("");
  }

  // Drill da Visão geral para a worklist de Confirmações, já filtrada pela situação.
  function drillSituacao(sit) {
    setSituacaoFiltro(sit);
    navigate("confirmacoes");
  }

  const temFiltros = Boolean(
    filtros.data_ini || filtros.data_fim || filtros.cliente || statusFiltro || situacaoFiltro
  );

  const horaAtualizacao = atualizadoEm
    ? atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const meta = META_ROTA[route] || META_ROTA["visao-geral"];

  return (
    <div className="shell">
      <Sidebar
        route={route}
        navigate={navigate}
        pendentesVencidos={metricas?.pendentes_vencidos ?? 0}
      />

      <div className="content">
        <div className="content-inner">
          <header className="topo">
            <div className="topo-titulo">
              <h1>{meta.titulo}</h1>
              <span className="topo-sub">
                {meta.sub}
                {info && ` · SLA On Time: ${info.prazo_entrega_dias} dias`}
              </span>
            </div>
            <div className="topo-acoes">
              {horaAtualizacao && (
                <span className="topo-atualizado">Atualizado às {horaAtualizacao}</span>
              )}
              <button className="btn-sec" onClick={carregar} disabled={carregando}>
                {carregando ? "Atualizando…" : "Atualizar"}
              </button>
            </div>
          </header>

          {erro && (
            <div className="erro" role="alert">
              Erro ao consultar a API: {erro}
            </div>
          )}

          {route === "visao-geral" && (
            <VisaoGeral
              metricas={metricas}
              tendencia={tendencia}
              carregando={carregando}
              info={info}
              onDrillSituacao={drillSituacao}
            />
          )}

          {route === "pedidos" && (
            <Pedidos
              filtros={filtros}
              onFiltro={aplicarFiltro}
              onLimpar={limparFiltros}
              temFiltros={temFiltros}
              statusFiltro={statusFiltro}
              setStatusFiltro={setStatusFiltro}
              situacaoFiltro={situacaoFiltro}
              setSituacaoFiltro={setSituacaoFiltro}
              itens={itens}
              carregando={carregando}
              onConfirmar={setItemAtivo}
              onDetalhe={setDetalheItem}
            />
          )}

          {route === "confirmacoes" && (
            <Confirmacoes
              filtros={filtros}
              onFiltro={aplicarFiltro}
              onLimpar={limparFiltros}
              temFiltros={temFiltros}
              situacaoFiltro={situacaoFiltro}
              setSituacaoFiltro={setSituacaoFiltro}
              itens={itens}
              carregando={carregando}
              onConfirmar={setItemAtivo}
              onDetalhe={setDetalheItem}
            />
          )}
        </div>
      </div>

      {detalheItem && (
        <ItemDrawer
          item={detalheItem}
          onClose={() => setDetalheItem(null)}
          onConfirmar={setItemAtivo}
        />
      )}

      {itemAtivo && (
        <ConfirmacaoModal
          item={itemAtivo}
          onClose={() => setItemAtivo(null)}
          onSaved={() => {
            setItemAtivo(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
