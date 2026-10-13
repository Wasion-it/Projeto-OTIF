"""Endpoints de listagem de pedidos com o status OTIF calculado."""
from __future__ import annotations

from dataclasses import asdict
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..avaliacao import carregar_e_avaliar
from ..database import get_db
from ..ordenacao import ORDER_PADRAO, SORT_PADRAO, ordenar_resultados, paginar
from ..schemas import PedidosPage

router = APIRouter(prefix="/pedidos", tags=["pedidos"])


@router.get("", response_model=PedidosPage)
def listar_pedidos(
    data_ini: date | None = Query(None, description="Filtra pela data de digitacao (inicio)"),
    data_fim: date | None = Query(None, description="Filtra pela data de digitacao (fim)"),
    cliente: str | None = Query(None, description="Filtro parcial por cliente"),
    status: str | None = Query(
        None, description="pendente | otif | falha | sem_contract_date"
    ),
    situacao_prazo: str | None = Query(
        None, description="Filtra pendentes: no_prazo | atencao | vencido"
    ),
    sort: str = Query(SORT_PADRAO, description="Coluna de ordenacao"),
    order: str = Query(ORDER_PADRAO, pattern="^(asc|desc)$", description="asc | desc"),
    page: int = Query(1, ge=1, description="Pagina (1-indexada)"),
    page_size: int = Query(25, ge=1, le=1000, description="Itens por pagina"),
    force_refresh: bool = Query(False, description="Ignora o cache curto do JUND"),
    db: Session = Depends(get_db),
):
    """Lista pedidos com OTIF calculado exclusivamente pelo Contract Date.

    Periodo e cliente sao aplicados sobre a leitura direta do JUND. Status e
    situacao de prazo sao aplicados depois da avaliacao. O periodo continua baseado na digitacao.
    """
    resultados = carregar_e_avaliar(
        db,
        data_ini,
        data_fim,
        cliente,
        force_refresh=force_refresh,
    )

    if status:
        resultados = [r for r in resultados if r.status == status]
    if situacao_prazo:
        resultados = [r for r in resultados if r.situacao_prazo == situacao_prazo]

    resultados = ordenar_resultados(resultados, sort, order)
    pagina, total, total_paginas = paginar(resultados, page, page_size)

    return PedidosPage(
        items=[asdict(r) for r in pagina],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_paginas,
    )
