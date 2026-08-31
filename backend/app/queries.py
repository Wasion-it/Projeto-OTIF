"""Consultas reutilizadas pelos routers.

Centraliza o carregamento de itens (com pedido + confirmacao) aplicando os
filtros de periodo/cliente usados tanto na listagem quanto nas metricas.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .models import ItemPedido, Pedido


def carregar_itens(
    db: Session,
    data_ini: date | None = None,
    data_fim: date | None = None,
    cliente: str | None = None,
) -> list[ItemPedido]:
    """Carrega itens com pedido e confirmacao, filtrando pela data solicitada."""
    stmt = (
        select(ItemPedido)
        .join(ItemPedido.pedido)
        .options(
            joinedload(ItemPedido.pedido),
            joinedload(ItemPedido.confirmacao),
        )
    )
    if data_ini is not None:
        stmt = stmt.where(Pedido.data_solicitada_cliente >= data_ini)
    if data_fim is not None:
        stmt = stmt.where(Pedido.data_solicitada_cliente <= data_fim)
    if cliente:
        stmt = stmt.where(Pedido.cliente.ilike(f"%{cliente}%"))

    stmt = stmt.order_by(Pedido.data_solicitada_cliente.desc(), ItemPedido.id)
    return list(db.execute(stmt).unique().scalars().all())
