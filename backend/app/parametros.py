"""Parametros funcionais do painel: meta de OTIF e janela de alerta.

O prazo oficial nao e configuravel nesta aplicacao: vem sempre do Contract Date
do pedido no JUND. Colunas antigas de SLA continuam fisicamente no banco apenas
para permitir rollback da primeira etapa da migracao.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from .config import get_settings
from .models import Parametros

PARAMETROS_ID = 1


@dataclass
class ParametrosEfetivos:
    meta_otif: float
    dias_alerta_prazo: int


def carregar_parametros(db: Session) -> ParametrosEfetivos:
    """Retorna a linha do banco ou os defaults do ambiente."""
    row = db.get(Parametros, PARAMETROS_ID)
    if row is None:
        settings = get_settings()
        return ParametrosEfetivos(
            meta_otif=float(settings.meta_otif),
            dias_alerta_prazo=settings.dias_alerta_prazo,
        )
    return ParametrosEfetivos(
        meta_otif=float(row.meta_otif),
        dias_alerta_prazo=int(row.dias_alerta_prazo),
    )


def salvar_parametros(
    db: Session,
    *,
    meta_otif: float,
    dias_alerta_prazo: int,
) -> Parametros:
    """Atualiza somente os parametros ativos, sem tocar no legado de SLA."""
    row = db.get(Parametros, PARAMETROS_ID) or Parametros(id=PARAMETROS_ID)
    row.meta_otif = meta_otif
    row.dias_alerta_prazo = dias_alerta_prazo
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
