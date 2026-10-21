"""Tela Comercial: pedidos do JUND com seus itens e indicadores de prazo.

Somente leitura, na mesma fonte do OTIF (JUND direto + jigadb). Nada daqui
grava no banco nem altera o calculo de OTIF.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..comercial import (
    ORDER_PADRAO,
    SORT_PADRAO,
    calcular_kpis,
    filtrar_linhas,
    montar_pedido_comercial,
    ordenar_linhas,
)
from ..database import get_db
from ..ordenacao import paginar
from ..otif import avaliar_pedido
from ..parametros import carregar_parametros
from ..queries import carregar_pedidos
from ..schemas import ComercialPage

router = APIRouter(prefix="/comercial", tags=["comercial"])


@router.get("/pedidos", response_model=ComercialPage)
def listar_pedidos_comercial(
    data_ini: date | None = Query(None, description="Data de digitacao (inicio)"),
    data_fim: date | None = Query(None, description="Data de digitacao (fim)"),
    cliente: str | None = Query(None, description="Filtro parcial por cliente"),
    status: str | None = Query(
        None, description="entregue | faturado | parcial | em_programacao"
    ),
    busca: str | None = Query(
        None, description="Texto livre: pedido, contrato, cliente, cod. cliente, NF"
    ),
    sort: str = Query(
        SORT_PADRAO,
        description="prazo | pedido | cliente | status | valor | itens | data_pedido | "
        "faturamento | prazo_contratado | folga",
    ),
    order: str = Query(ORDER_PADRAO, pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    force_refresh: bool = Query(False, description="Ignora o cache curto do JUND"),
    db: Session = Depends(get_db),
):
    pedidos = carregar_pedidos(
        db, data_ini, data_fim, cliente, force_refresh=force_refresh
    )
    dias_alerta = carregar_parametros(db).dias_alerta_prazo
    linhas = [
        montar_pedido_comercial(p, avaliar_pedido(p, dias_alerta=dias_alerta))
        for p in pedidos
    ]
    linhas = filtrar_linhas(linhas, status=status, busca=busca)
    kpis = calcular_kpis(linhas, dias_alerta)
    linhas = ordenar_linhas(linhas, sort, order)
    pagina, total, total_paginas = paginar(linhas, page, page_size)
    return ComercialPage(
        kpis=kpis,
        items=pagina,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_paginas,
    )
