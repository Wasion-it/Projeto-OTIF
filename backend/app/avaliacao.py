"""Carga e avaliacao dos pedidos usando o Contract Date informado no JUND.

Ponto unico reutilizado pelos endpoints de listagem e metricas. Em modo direto,
combina a leitura JUND com as relacoes manuais locais antes de avaliar.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from .otif import ResultadoPedido, avaliar_pedido
from .parametros import carregar_parametros
from .queries import carregar_pedidos


def carregar_e_avaliar(
    db: Session,
    data_ini: date | None = None,
    data_fim: date | None = None,
    cliente: str | None = None,
    *,
    force_refresh: bool = False,
) -> list[ResultadoPedido]:
    pedidos = carregar_pedidos(
        db,
        data_ini,
        data_fim,
        cliente,
        force_refresh=force_refresh,
    )
    dias_alerta = carregar_parametros(db).dias_alerta_prazo
    return [avaliar_pedido(p, dias_alerta=dias_alerta) for p in pedidos]
