"""Schemas Pydantic (contratos da API)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import MotivoFalha


class ConfirmacaoResumo(BaseModel):
    data_entrega_real: date
    recebido_completo: bool
    motivo_falha: str | None
    observacao: str | None
    usuario: str
    criado_em: datetime


class NegativaProducaoCreate(BaseModel):
    motivo: str = Field(min_length=1, max_length=2000)
    data_prevista: date
    usuario: str = Field(default="pcp", min_length=1, max_length=120)

    @field_validator("motivo")
    @classmethod
    def normalizar_motivo(cls, valor: str) -> str:
        normalizado = valor.strip()
        if not normalizado:
            raise ValueError("O motivo da negativa e obrigatorio.")
        return normalizado


class NegativaProducaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pedido_id: int
    motivo: str
    data_prevista: date
    usuario: str
    criado_em: datetime
    resolvida_em: datetime | None
    resolvida_por: str | None


class EtapaTimeline(BaseModel):
    """Uma etapa real e, quando aplicavel, seu compromisso planejado."""

    chave: str
    nome: str
    data: date | None
    data_hora: datetime | None = None
    concluida: bool
    dias: int | None
    obs: str | None = None
    data_agendada: date | None = None


class ProcessoResumo(BaseModel):
    """Situacao do pedido no processo interno + dados brutos para edicao."""

    etapa_atual: str
    etapa_atual_nome: str
    concluido: bool
    data_operacional: date
    dias_na_etapa_atual: int | None
    lem_aguardando_inicio: bool
    dias_ate_inicio_lem: int | None
    gargalo: str | None
    lead_time_dias: int | None
    etapas: list[EtapaTimeline]
    negativas_producao: list[NegativaProducaoOut] = Field(default_factory=list)
    negativas_abertas: int = 0
    pcp_data: date | None = None
    producao_plan_inicio: date | None = None
    producao_plan_fim: date | None = None
    producao_fim: date | None = None
    comercial_data: date | None = None
    inspecao_agendada_data: date | None = None
    inicio_lem_data: date | None = None
    lem_data: date | None = None
    faturamento_em: datetime | None = None
    embarque_em: datetime | None = None
    expedicao_data: date | None = None
    pcp_obs: str | None = None
    producao_obs: str | None = None
    comercial_obs: str | None = None
    lem_obs: str | None = None
    expedicao_obs: str | None = None
    observacao: str | None = None
    usuario: str | None = None
    atualizado_em: datetime | None = None


class ItemResumo(BaseModel):
    item_numero: int
    sku: str
    descricao: str
    qtd_pedida: float
    qtd_faturada: float
    data_faturamento: date | None
    in_full: bool


class ResultadoPedidoOut(BaseModel):
    pedido_id: int
    erp_id: int | None
    numero: str
    numero_interno: str | None
    cliente: str
    data_solicitada: date
    data_faturamento: date | None
    faturamento_em: datetime | None
    embarque_em: datetime | None
    nota_fiscal_numero: str | None
    nota_fiscal_serie: str | None
    data_entrega_real: date | None
    qtd_itens: int
    qtd_pedida_total: float
    qtd_faturada_total: float
    status: str
    on_time: bool | None
    in_full: bool | None
    dias_atraso: int | None
    origem_atraso: str | None
    motivo_falha: str | None
    contract_date: date | None
    prazo_entrega: date | None
    dias_restantes: int | None
    situacao_prazo: str | None
    itens: list[ItemResumo] = Field(default_factory=list)
    processo: ProcessoResumo | None = None
    confirmacao: ConfirmacaoResumo | None = None


class PedidosPage(BaseModel):
    items: list[ResultadoPedidoOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class MotivoFalhaCount(BaseModel):
    motivo: str
    quantidade: int


class MetricasOut(BaseModel):
    total_itens: int
    total_avaliados: int
    total_pendentes: int
    total_sem_contract_date: int
    otif_pct: float
    on_time_pct: float
    in_full_pct: float
    otif_ok: int
    falhas: int
    motivos_falha: list[MotivoFalhaCount]
    pendentes_no_prazo: int
    pendentes_atencao: int
    pendentes_vencidos: int


class TendenciaMes(BaseModel):
    mes: str
    otif_pct: float
    on_time_pct: float
    in_full_pct: float
    total_avaliados: int


class ClienteOtif(BaseModel):
    cliente: str
    total_pedidos: int
    total_avaliados: int
    total_pendentes: int
    total_sem_contract_date: int
    otif_ok: int
    falhas: int
    otif_pct: float
    on_time_pct: float
    in_full_pct: float


class ParametrosOut(BaseModel):
    meta_otif: float
    dias_alerta_prazo: int


class ParametrosUpdate(BaseModel):
    meta_otif: float = Field(ge=0, le=100)
    dias_alerta_prazo: int = Field(ge=0, le=365)


class ConfirmacaoCreate(BaseModel):
    pedido_id: int
    data_entrega_real: date
    recebido_completo: bool = True
    motivo_falha: MotivoFalha | None = None
    observacao: str | None = None
    usuario: str = Field(default="comercial", max_length=120)


class ConfirmacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pedido_id: int
    data_entrega_real: date
    recebido_completo: bool
    motivo_falha: MotivoFalha | None
    observacao: str | None
    usuario: str
    criado_em: datetime


class EtapaCreate(BaseModel):
    """Editor administrativo completo das etapas internas."""

    pcp_data: date | None = None
    producao_plan_inicio: date | None = None
    producao_plan_fim: date | None = None
    producao_fim: date | None = None
    comercial_data: date | None = None
    inspecao_agendada_data: date | None = None
    lem_data: date | None = None
    pcp_obs: str | None = None
    producao_obs: str | None = None
    comercial_obs: str | None = None
    lem_obs: str | None = None
    observacao: str | None = None
    usuario: str = Field(default="pcp", max_length=120)


class EtapaConfirmacaoCreate(BaseModel):
    """Confirmacao atomica de uma etapa operacional nao Comercial."""

    etapa: Literal["pcp", "producao", "lem"]
    data: date
    observacao: str | None = None
    usuario: str = Field(default="pcp", max_length=120)


class ComercialAgendamentoCreate(BaseModel):
    """Transicao operacional da Producao para o LEM."""

    inspecao_agendada_data: date
    observacao: str | None = None
    usuario: str = Field(default="comercial", max_length=120)


class EtapaProcessoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pedido_id: int
    pcp_data: date | None
    producao_plan_inicio: date | None
    producao_plan_fim: date | None
    producao_fim: date | None
    comercial_data: date | None
    inspecao_agendada_data: date | None
    lem_data: date | None
    expedicao_data: date | None
    pcp_obs: str | None
    producao_obs: str | None
    comercial_obs: str | None
    lem_obs: str | None
    expedicao_obs: str | None
    observacao: str | None
    usuario: str
    atualizado_em: datetime


class ProcessoEtapaMetrica(BaseModel):
    chave: str
    nome: str
    em_andamento: int
    concluidas: int
    dias_medio: float | None


class ProcessoMetricasOut(BaseModel):
    total_em_processo: int
    total_concluido: int
    gargalo: str | None
    etapas: list[ProcessoEtapaMetrica]
