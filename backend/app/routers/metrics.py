"""Endpoints de metricas agregadas para o dashboard."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..otif import agregar, avaliar_item
from ..queries import carregar_itens
from ..schemas import MetricasOut, TendenciaMes

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/otif", response_model=MetricasOut)
def metricas_otif(
    data_ini: date | None = Query(None),
    data_fim: date | None = Query(None),
    cliente: str | None = Query(None),
    db: Session = Depends(get_db),
):
    s = get_settings()
    itens = carregar_itens(db, data_ini, data_fim, cliente)
    resultados = [avaliar_item(i, s.prazo_entrega_dias, s.dias_alerta_prazo) for i in itens]
    return agregar(resultados)


@router.get("/tendencia", response_model=list[TendenciaMes])
def tendencia_mensal(
    data_ini: date | None = Query(None),
    data_fim: date | None = Query(None),
    cliente: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """OTIF por mes (agrupado pela data solicitada pelo cliente)."""
    s = get_settings()
    itens = carregar_itens(db, data_ini, data_fim, cliente)
    resultados = [avaliar_item(i, s.prazo_entrega_dias, s.dias_alerta_prazo) for i in itens]

    por_mes: dict[str, list] = {}
    for r in resultados:
        mes = r.data_solicitada.strftime("%Y-%m")
        por_mes.setdefault(mes, []).append(r)

    saida: list[TendenciaMes] = []
    for mes in sorted(por_mes.keys()):
        m = agregar(por_mes[mes])
        saida.append(
            TendenciaMes(
                mes=mes,
                otif_pct=m["otif_pct"],
                on_time_pct=m["on_time_pct"],
                in_full_pct=m["in_full_pct"],
                total_avaliados=m["total_avaliados"],
            )
        )
    return saida
