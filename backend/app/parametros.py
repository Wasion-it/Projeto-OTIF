"""Parametros funcionais do painel: meta de OTIF, janela de alerta e metas de dias.

O prazo oficial nao e configuravel nesta aplicacao: vem sempre do Contract Date
do pedido no JUND. Colunas antigas de SLA continuam fisicamente no banco apenas
para permitir rollback da primeira etapa da migracao.

As metas de dias por etapa sao globais (valem para todos os clientes) e ficam
em ``Parametros.metas_dias`` como JSON; etapas ausentes usam o padrao do codigo.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from .config import get_settings
from .models import Parametros
from .otif import METAS_DIAS_PADRAO

PARAMETROS_ID = 1
META_DIAS_MAX = 365


@dataclass
class ParametrosEfetivos:
    meta_otif: float
    dias_alerta_prazo: int
    metas_dias: dict[str, int] = field(default_factory=lambda: dict(METAS_DIAS_PADRAO))


def _metas_do_banco(bruto: str | None) -> dict[str, int]:
    """Mescla o JSON salvo com os padroes, ignorando chaves e valores invalidos."""
    metas = dict(METAS_DIAS_PADRAO)
    if not bruto:
        return metas
    try:
        salvo = json.loads(bruto)
    except ValueError:
        return metas
    if not isinstance(salvo, dict):
        return metas
    for chave, valor in salvo.items():
        if (
            chave in METAS_DIAS_PADRAO
            and isinstance(valor, int)
            and not isinstance(valor, bool)
            and 0 <= valor <= META_DIAS_MAX
        ):
            metas[chave] = valor
    return metas


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
        metas_dias=_metas_do_banco(row.metas_dias),
    )


def salvar_parametros(
    db: Session,
    *,
    meta_otif: float,
    dias_alerta_prazo: int,
    metas_dias: dict[str, int] | None = None,
) -> Parametros:
    """Atualiza somente os parametros ativos, sem tocar no legado de SLA.

    ``metas_dias`` ausente preserva as metas ja salvas; presente, substitui-as
    (chaves omitidas voltam ao padrao).
    """
    row = db.get(Parametros, PARAMETROS_ID) or Parametros(id=PARAMETROS_ID)
    row.meta_otif = meta_otif
    row.dias_alerta_prazo = dias_alerta_prazo
    if metas_dias is not None:
        row.metas_dias = json.dumps(metas_dias, sort_keys=True)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
