"""Modelos do banco proprio da aplicacao.

Separacao importante:
- Pedido / ItemPedido: dados que VEM do ERP (Jundsoft). Sao somente-leitura na pratica;
  no mock sao gerados pelo seed, em producao seriam preenchidos pelo job de sync.
- ConfirmacaoEntrega: dado MANUAL, inserido pelo time comercial dentro desta aplicacao.

O resultado OTIF nao e persistido: e calculado sob demanda (ver otif.py) para
sempre refletir os dados mais recentes.
"""
from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class MotivoFalha(str, enum.Enum):
    """Lista fechada de causas raiz para pedidos que falham o OTIF."""

    FALTA_ESTOQUE = "falta_estoque"
    ATRASO_PRODUCAO = "atraso_producao"
    ATRASO_FATURAMENTO = "atraso_faturamento"
    ATRASO_TRANSPORTE = "atraso_transporte"
    RECUSA_CLIENTE = "recusa_cliente"
    ERRO_DOCUMENTO = "erro_documento"
    AVARIA = "avaria"
    OUTRO = "outro"


class Pedido(Base):
    __tablename__ = "pedido"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Chave do pedido no ERP (PV01_ID). Usada para sync idempotente. Nula no mock.
    erp_id: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True, index=True)
    # Numero exibido (PV01_NUMERO_CLIENTE). Nao e unico: o mesmo PO de cliente pode repetir.
    numero: Mapped[str] = mapped_column(String(60), index=True)
    cliente: Mapped[str] = mapped_column(String(160), index=True)
    data_pedido: Mapped[date] = mapped_column(Date)
    # "Data solicitada": timestamp de digitacao do pedido no ERP (PV01_DATA_DIGITACAO_H).
    data_solicitada_cliente: Mapped[date] = mapped_column(Date, index=True)
    origem: Mapped[str] = mapped_column(String(20), default="ERP")

    itens: Mapped[list[ItemPedido]] = relationship(
        back_populates="pedido", cascade="all, delete-orphan"
    )


class ItemPedido(Base):
    __tablename__ = "item_pedido"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id"), index=True)
    # Numero do item no pedido do ERP (PV02_ITEM). Usado no upsert idempotente.
    item_numero: Mapped[int] = mapped_column(Integer, default=0)
    sku: Mapped[str] = mapped_column(String(60), index=True)
    descricao: Mapped[str] = mapped_column(String(200))
    qtd_pedida: Mapped[float] = mapped_column(Numeric(14, 3))
    qtd_faturada: Mapped[float] = mapped_column(Numeric(14, 3), default=0)
    # Data da nota fiscal -> proxy da expedicao. Separa atraso interno x transporte.
    data_faturamento: Mapped[date | None] = mapped_column(Date, nullable=True)
    origem: Mapped[str] = mapped_column(String(20), default="ERP")

    pedido: Mapped[Pedido] = relationship(back_populates="itens")
    confirmacao: Mapped[ConfirmacaoEntrega | None] = relationship(
        back_populates="item", uselist=False, cascade="all, delete-orphan"
    )


class ConfirmacaoEntrega(Base):
    """Input MANUAL do time comercial: confirma a chegada no cliente."""

    __tablename__ = "confirmacao_entrega"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("item_pedido.id"), unique=True, index=True
    )
    data_entrega_real: Mapped[date] = mapped_column(Date)
    recebido_completo: Mapped[bool] = mapped_column(Boolean, default=True)
    motivo_falha: Mapped[MotivoFalha | None] = mapped_column(
        Enum(MotivoFalha), nullable=True
    )
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario: Mapped[str] = mapped_column(String(120), default="comercial")
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    item: Mapped[ItemPedido] = relationship(back_populates="confirmacao")
