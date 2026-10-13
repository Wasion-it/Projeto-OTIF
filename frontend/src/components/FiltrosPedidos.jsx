import { Funnel, MagnifyingGlass, X } from "@phosphor-icons/react";
import {
  filtrosPedidosIguais,
  normalizarFiltrosPedidos,
  temFiltrosPedidos,
} from "../lib/pedidosFiltros.js";
import { fmtDataIso } from "../lib/format.js";

// Status e situação do Contract Date saíram daqui: agora vivem na barra de
// segmentos, onde valem 1 clique. Sobra o refinamento — cliente e período de
// digitação — que precisa de um Aplicar explícito para não consultar a API a
// cada tecla digitada.
function descreverFiltros(filtros) {
  const ativos = [];
  if (filtros.data_ini || filtros.data_fim) {
    let valor;
    if (filtros.data_ini && filtros.data_fim) {
      valor = `${fmtDataIso(filtros.data_ini)} a ${fmtDataIso(filtros.data_fim)}`;
    } else if (filtros.data_ini) {
      valor = `desde ${fmtDataIso(filtros.data_ini)}`;
    } else {
      valor = `até ${fmtDataIso(filtros.data_fim)}`;
    }
    ativos.push({ chave: "periodo", rotulo: `Digitação: ${valor}` });
  }
  if (filtros.cliente) {
    ativos.push({ chave: "cliente", rotulo: `Cliente: ${filtros.cliente}` });
  }
  return ativos;
}

export default function FiltrosPedidos({
  filtros,
  rascunho,
  carregando = false,
  onRascunhoChange,
  onAplicar,
  onLimparTodos,
  onRemoverFiltro,
}) {
  const normalizado = normalizarFiltrosPedidos(rascunho);
  const alterado = !filtrosPedidosIguais(rascunho, filtros);
  const erroPeriodo =
    rascunho.data_ini && rascunho.data_fim && rascunho.data_ini > rascunho.data_fim
      ? "A data inicial não pode ser posterior à data final."
      : "";
  const filtrosAtivos = descreverFiltros(filtros);
  const haAlgoParaLimpar = temFiltrosPedidos(filtros) || temFiltrosPedidos(rascunho);

  function alterar(campo, valor) {
    onRascunhoChange({ ...rascunho, [campo]: valor });
  }

  function aplicar(event) {
    event.preventDefault();
    if (erroPeriodo || !alterado) return;
    onAplicar(normalizado);
  }

  return (
    <div className="filtros-barra">
      <form
        className="filtros-linha"
        onSubmit={aplicar}
        noValidate
        role="search"
        aria-label="Refinar pedidos por cliente e período de digitação"
      >
        <label className="filtro-campo filtro-cliente" htmlFor="filtro-cliente">
          Cliente
          <span className="campo-com-icone">
            <MagnifyingGlass className="ico" size={16} aria-hidden="true" />
            <input
              id="filtro-cliente"
              type="search"
              value={rascunho.cliente}
              placeholder="Nome ou parte do nome"
              autoComplete="off"
              onChange={(event) => alterar("cliente", event.target.value)}
            />
          </span>
        </label>

        <label className="filtro-campo" htmlFor="filtro-data-inicial">
          Digitação de
          <input
            id="filtro-data-inicial"
            type="date"
            value={rascunho.data_ini}
            max={rascunho.data_fim || undefined}
            aria-invalid={Boolean(erroPeriodo)}
            aria-describedby={erroPeriodo ? "filtro-periodo-erro" : undefined}
            onChange={(event) => alterar("data_ini", event.target.value)}
          />
        </label>

        <label className="filtro-campo" htmlFor="filtro-data-final">
          até
          <input
            id="filtro-data-final"
            type="date"
            value={rascunho.data_fim}
            min={rascunho.data_ini || undefined}
            aria-invalid={Boolean(erroPeriodo)}
            aria-describedby={erroPeriodo ? "filtro-periodo-erro" : undefined}
            onChange={(event) => alterar("data_fim", event.target.value)}
          />
        </label>

        <div className="filtros-acoes">
          <button type="submit" className="btn" disabled={!alterado || Boolean(erroPeriodo)}>
            <Funnel className="ico" size={16} weight="bold" aria-hidden="true" />
            Aplicar
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!haAlgoParaLimpar}
            onClick={onLimparTodos}
          >
            Limpar filtros
          </button>
        </div>
      </form>

      {erroPeriodo && (
        <div className="filtros-erro" id="filtro-periodo-erro" role="alert">
          {erroPeriodo}
        </div>
      )}

      {(filtrosAtivos.length > 0 || alterado) && (
        <div className="filtros-rodape">
          <div className="filtros-chips">
            {filtrosAtivos.map((filtro) => (
              <button
                type="button"
                className="filtro-chip"
                key={filtro.chave}
                aria-label={`Remover filtro ${filtro.rotulo}`}
                onClick={() => onRemoverFiltro(filtro.chave)}
              >
                <span>{filtro.rotulo}</span>
                <span className="filtro-chip-remover" aria-hidden="true">
                  <X size={12} weight="bold" />
                </span>
              </button>
            ))}
          </div>
          <span
            className={`filtros-estado ${alterado ? "pendente" : ""}`}
            role="status"
            aria-live="polite"
          >
            {alterado
              ? "Alterações ainda não aplicadas"
              : carregando
                ? "Atualizando resultados…"
                : ""}
          </span>
        </div>
      )}
    </div>
  );
}
