"""Endpoints de listagem de itens/pedidos com o status OTIF calculado."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..otif import avaliar_item
from ..queries import carregar_itens
from ..schemas import ResultadoItemOut

router = APIRouter(prefix="/pedidos", tags=["pedidos"])


@router.get("/itens", response_model=list[ResultadoItemOut])
def listar_itens(
    data_ini: date | None = Query(None, description="Filtra pela data solicitada (inicio)"),
    data_fim: date | None = Query(None, description="Filtra pela data solicitada (fim)"),
    cliente: str | None = Query(None, description="Filtro parcial por cliente"),
    status: str | None = Query(None, description="pendente | otif | falha"),
    situacao_prazo: str | None = Query(
        None, description="Filtra pendentes: no_prazo | atencao | vencido"
    ),
    db: Session = Depends(get_db),
):
    s = get_settings()
    itens = carregar_itens(db, data_ini, data_fim, cliente)
    resultados = [avaliar_item(i, s.prazo_entrega_dias, s.dias_alerta_prazo) for i in itens]
    if status:
        resultados = [r for r in resultados if r.status == status]
    if situacao_prazo:
        resultados = [r for r in resultados if r.situacao_prazo == situacao_prazo]
    return resultados
