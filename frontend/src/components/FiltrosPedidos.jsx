import { useState } from "react";
import Icone from "./Icone.jsx";
import {
  filtrosPedidosIguais,
  normalizarFiltrosPedidos,
  temFiltrosPedidos,
} from "../lib/pedidosFiltros.js";
import { fmtDataIso } from "../lib/format.js";

// Cliente e período de digitação precisam de um Aplicar explícito para não
// consultar a API a cada tecla. Etapa e situação ficam nas barras de 1 clique.
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
  // Em telas estreitas o formulário fica recolhido para a lista aparecer.
  const [abertoMobile, setAbertoMobile] = useState(false);
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
    <div className="filtros">
      <button
        type="button"
        className="btn btn-sec filtros-toggle"
        aria-expanded={abertoMobile}
        aria-controls="filtros-form"
        onClick={() => setAbertoMobile((v) => !v)}
      >
        Cliente e período{filtrosAtivos.length > 0 ? ` (${filtrosAtivos.length})` : ""}
        <Icone nome={abertoMobile ? "cima" : "abaixo"} tamanho={14} />
      </button>

      <form
        id="filtros-form"
        className={`filtros-form ${abertoMobile ? "aberto" : ""}`}
        onSubmit={aplicar}
        noValidate
        role="search"
        aria-label="Refinar pedidos por cliente e período de digitação"
      >
        <label className="campo campo-cliente">
          <span className="campo-rotulo">Cliente</span>
          <input
            type="search"
            value={rascunho.cliente}
            placeholder="Nome ou parte do nome"
            autoComplete="off"
            onChange={(event) => alterar("cliente", event.target.value)}
          />
        </label>

        <label className="campo">
          <span className="campo-rotulo">Digitação de</span>
          <input
            type="date"
            value={rascunho.data_ini}
            max={rascunho.data_fim || undefined}
            aria-invalid={Boolean(erroPeriodo)}
            aria-describedby={erroPeriodo ? "filtro-periodo-erro" : undefined}
            onChange={(event) => alterar("data_ini", event.target.value)}
          />
        </label>

        <label className="campo">
          <span className="campo-rotulo">até</span>
          <input
            type="date"
            value={rascunho.data_fim}
            min={rascunho.data_ini || undefined}
            aria-invalid={Boolean(erroPeriodo)}
            aria-describedby={erroPeriodo ? "filtro-periodo-erro" : undefined}
            onChange={(event) => alterar("data_fim", event.target.value)}
          />
        </label>

        <div className="filtros-acoes">
          <button type="submit" className="btn btn-sec" disabled={!alterado || Boolean(erroPeriodo)}>
            Aplicar
          </button>
          <button
            type="button"
            className="btn btn-texto"
            disabled={!haAlgoParaLimpar}
            onClick={onLimparTodos}
          >
            Limpar filtros
          </button>
        </div>
      </form>

      {erroPeriodo && (
        <p className="msg-erro" id="filtro-periodo-erro" role="alert">
          {erroPeriodo}
        </p>
      )}

      {(filtrosAtivos.length > 0 || alterado) && (
        <div className="filtros-rodape">
          {filtrosAtivos.map((filtro) => (
            <button
              type="button"
              className="chip"
              key={filtro.chave}
              aria-label={`Remover filtro ${filtro.rotulo}`}
              onClick={() => onRemoverFiltro(filtro.chave)}
            >
              {filtro.rotulo}
              <Icone nome="fechar" tamanho={12} />
            </button>
          ))}
          <span className="filtros-estado" role="status" aria-live="polite">
            {alterado ? "Alterações ainda não aplicadas" : carregando ? "Atualizando…" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
