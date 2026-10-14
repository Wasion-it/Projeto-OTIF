"""Endpoints de metricas agregadas para o dashboard."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..avaliacao import carregar_e_avaliar
from ..database import get_db
from ..ordenacao import filtrar_resultados
from ..otif import agregar, agregar_por_cliente, agregar_processo
from ..schemas import ClienteOtif, MetricasOut, ProcessoMetricasOut, TendenciaMes

router = APIRouter(prefix="/metrics", tags=["metrics"])


def _avaliar(
    db: Session,
    data_ini: date | None,
    data_fim: date | None,
    cliente: str | None,
    force_refresh: bool,
):
    return carregar_e_avaliar(
        db,
        data_ini,
        data_fim,
        cliente,
        force_refresh=force_refresh,
    )


@router.get("/otif", response_model=MetricasOut)
def metricas_otif(
    data_ini: date | None = Query(None),
    data_fim: date | None = Query(None),
    cliente: str | None = Query(None),
    force_refresh: bool = Query(False),
    db: Session = Depends(get_db),
):
    return agregar(_avaliar(db, data_ini, data_fim, cliente, force_refresh))


@router.get("/clientes", response_model=list[ClienteOtif])
def metricas_por_cliente(
    data_ini: date | None = Query(None),
    data_fim: date | None = Query(None),
    cliente: str | None = Query(None),
    force_refresh: bool = Query(False),
    db: Session = Depends(get_db),
):
    return agregar_por_cliente(
        _avaliar(db, data_ini, data_fim, cliente, force_refresh)
    )


@router.get("/processo", response_model=ProcessoMetricasOut)
def metricas_processo(
    data_ini: date | None = Query(None),
    data_fim: date | None = Query(None),
    cliente: str | None = Query(None),
    status: str | None = Query(None, description="Mesmo filtro de /pedidos"),
    situacao_prazo: str | None = Query(None, description="Mesmo filtro de /pedidos"),
    force_refresh: bool = Query(False),
    db: Session = Depends(get_db),
):
    # Status e situacao sao opcionais: permitem que a contagem por etapa use o
    # mesmo recorte da lista de pedidos.
    return agregar_processo(
        filtrar_resultados(
            _avaliar(db, data_ini, data_fim, cliente, force_refresh),
            status=status,
            situacao_prazo=situacao_prazo,
        )
    )


@router.get("/tendencia", response_model=list[TendenciaMes])
def tendencia_mensal(
    data_ini: date | None = Query(None),
    data_fim: date | None = Query(None),
    cliente: str | None = Query(None),
    force_refresh: bool = Query(False),
    db: Session = Depends(get_db),
):
    resultados = _avaliar(db, data_ini, data_fim, cliente, force_refresh)
    por_mes: dict[str, list] = {}
    for resultado in resultados:
        mes = resultado.data_solicitada.strftime("%Y-%m")
        por_mes.setdefault(mes, []).append(resultado)

    saida: list[TendenciaMes] = []
    for mes in sorted(por_mes):
        metricas = agregar(por_mes[mes])
        saida.append(
            TendenciaMes(
                mes=mes,
                otif_pct=metricas["otif_pct"],
                on_time_pct=metricas["on_time_pct"],
                in_full_pct=metricas["in_full_pct"],
                total_avaliados=metricas["total_avaliados"],
            )
        )
    return saida
