import { CalendarBlank, X } from "@phosphor-icons/react";
import { fmtDataIso, isoLocal } from "../lib/format.js";

// O recorte é o estado global de consulta (o mesmo da tela de Pedidos), então
// fica visível e trocável em 1 clique: um KPI sem período não informa nada.
const PRESETS = [
  { id: "tudo", label: "Todo o histórico", dias: null },
  { id: "30", label: "30 dias", dias: 30 },
  { id: "90", label: "90 dias", dias: 90 },
  { id: "365", label: "12 meses", dias: 365 },
];

function intervaloDe(dias) {
  if (dias == null) return { data_ini: "", data_fim: "" };
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - (dias - 1));
  return { data_ini: isoLocal(inicio), data_fim: isoLocal(fim) };
}

function presetAtivo(filtros) {
  if (!filtros.data_ini && !filtros.data_fim) return "tudo";
  const encontrado = PRESETS.find((preset) => {
    if (preset.dias == null) return false;
    const intervalo = intervaloDe(preset.dias);
    return (
      intervalo.data_ini === filtros.data_ini && intervalo.data_fim === filtros.data_fim
    );
  });
  return encontrado?.id || "personalizado";
}

function descreverPeriodo(filtros) {
  if (filtros.data_ini && filtros.data_fim) {
    return `Digitação de ${fmtDataIso(filtros.data_ini)} a ${fmtDataIso(filtros.data_fim)}`;
  }
  if (filtros.data_ini) return `Digitação desde ${fmtDataIso(filtros.data_ini)}`;
  if (filtros.data_fim) return `Digitação até ${fmtDataIso(filtros.data_fim)}`;
  return "Todos os pedidos digitados";
}

export default function PeriodoRapido({ filtros, onPeriodo, onRemoverCliente }) {
  const ativo = presetAtivo(filtros);

  return (
    <div className="recorte">
      <span className="recorte-rotulo">
        <CalendarBlank size={16} aria-hidden="true" />
        Período
      </span>

      <div className="seg-grupo" role="group" aria-label="Período de digitação">
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            className={`seg ${ativo === preset.id ? "ativo" : ""}`}
            aria-pressed={ativo === preset.id}
            onClick={() => onPeriodo(intervaloDe(preset.dias))}
          >
            {preset.label}
          </button>
        ))}
        {ativo === "personalizado" && (
          <span className="seg ativo seg-estatico">Personalizado</span>
        )}
      </div>

      <span className="recorte-info">{descreverPeriodo(filtros)}</span>

      {filtros.cliente && (
        <button
          type="button"
          className="filtro-chip"
          aria-label={`Remover filtro de cliente ${filtros.cliente}`}
          onClick={onRemoverCliente}
        >
          <span>Cliente: {filtros.cliente}</span>
          <span className="filtro-chip-remover" aria-hidden="true">
            <X size={12} weight="bold" />
          </span>
        </button>
      )}
    </div>
  );
}
