"""Schemas Pydantic (contratos da API)."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import MotivoFalha


class ConfirmacaoResumo(BaseModel):
    """Dados da confirmacao manual, embutidos no item para o drawer de detalhe."""

    data_entrega_real: date
    recebido_completo: bool
    motivo_falha: str | None
    observacao: str | None
    usuario: str
    criado_em: datetime


class ResultadoItemOut(BaseModel):
    item_id: int
    pedido_numero: str
    cliente: str
    sku: str
    descricao: str
    data_solicitada: date
    data_faturamento: date | None
    data_entrega_real: date | None
    qtd_pedida: float
    qtd_faturada: float
    status: str
    on_time: bool | None
    in_full: bool | None
    dias_atraso: int | None
    origem_atraso: str | None
    motivo_falha: str | None
    prazo_entrega: date
    dias_restantes: int | None
    situacao_prazo: str | None
    confirmacao: ConfirmacaoResumo | None = None


class MotivoFalhaCount(BaseModel):
    motivo: str
    quantidade: int


class MetricasOut(BaseModel):
    total_itens: int
    total_avaliados: int
    total_pendentes: int
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
    mes: str  # AAAA-MM
    otif_pct: float
    on_time_pct: float
    in_full_pct: float
    total_avaliados: int


class ConfirmacaoCreate(BaseModel):
    item_id: int
    data_entrega_real: date
    recebido_completo: bool = True
    motivo_falha: MotivoFalha | None = None
    observacao: str | None = None
    usuario: str = Field(default="comercial", max_length=120)


class ConfirmacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    data_entrega_real: date
    recebido_completo: bool
    motivo_falha: MotivoFalha | None
    observacao: str | None
    usuario: str
    criado_em: datetime
