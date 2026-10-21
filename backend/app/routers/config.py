"""Endpoints dos parametros ativos do painel."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..parametros import carregar_parametros, salvar_parametros
from ..schemas import ParametrosOut, ParametrosUpdate

router = APIRouter(prefix="/config", tags=["config"])


@router.get("", response_model=ParametrosOut)
def obter_parametros(db: Session = Depends(get_db)):
    parametros = carregar_parametros(db)
    return ParametrosOut(
        meta_otif=parametros.meta_otif,
        dias_alerta_prazo=parametros.dias_alerta_prazo,
        metas_dias=parametros.metas_dias,
    )


@router.put("", response_model=ParametrosOut)
def atualizar_parametros(payload: ParametrosUpdate, db: Session = Depends(get_db)):
    salvar_parametros(
        db,
        meta_otif=payload.meta_otif,
        dias_alerta_prazo=payload.dias_alerta_prazo,
        metas_dias=payload.metas_dias,
    )
    # Relê pelo carregador para devolver as metas já mescladas com os padrões.
    parametros = carregar_parametros(db)
    return ParametrosOut(
        meta_otif=parametros.meta_otif,
        dias_alerta_prazo=parametros.dias_alerta_prazo,
        metas_dias=parametros.metas_dias,
    )
