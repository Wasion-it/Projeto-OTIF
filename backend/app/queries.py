"""Carga unificada de pedidos do ERP e dos dados manuais locais."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from .config import get_settings
from .models import Pedido


def _carregar_snapshot(
    db: Session,
    data_ini: date | None,
    data_fim: date | None,
    cliente: str | None,
) -> list[Pedido]:
    """Fallback legado para mock/rollback."""
    stmt = select(Pedido).options(
        joinedload(Pedido.itens),
        joinedload(Pedido.confirmacao),
        joinedload(Pedido.etapa),
        selectinload(Pedido.negativas_producao),
    )
    # Ancoras criadas no modo direto nao possuem snapshot de itens e nunca podem
    # contaminar um rollback. Um rollback exige rodar sync.py antes da troca.
    stmt = stmt.where(Pedido.origem != "ERP_ANCHOR")
    if data_ini is not None:
        stmt = stmt.where(Pedido.data_solicitada_cliente >= data_ini)
    if data_fim is not None:
        stmt = stmt.where(Pedido.data_solicitada_cliente <= data_fim)
    if cliente:
        stmt = stmt.where(Pedido.cliente.ilike(f"%{cliente}%"))
    stmt = stmt.order_by(Pedido.data_solicitada_cliente.desc(), Pedido.id)
    return list(db.execute(stmt).unique().scalars().all())


def carregar_pedidos(
    db: Session,
    data_ini: date | None = None,
    data_fim: date | None = None,
    cliente: str | None = None,
    *,
    force_refresh: bool = False,
) -> list:
    settings = get_settings()
    if settings.erp_source == "sqlserver" and settings.erp_read_mode == "direct":
        # Import tardio evita ciclo e dependencia pyodbc no modo mock.
        from .pedidos_direto import carregar_pedidos_direto

        return carregar_pedidos_direto(
            db,
            data_ini,
            data_fim,
            cliente,
            force_refresh=force_refresh,
        )
    return _carregar_snapshot(db, data_ini, data_fim, cliente)
