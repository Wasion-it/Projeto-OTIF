"""Endpoints do input MANUAL do time comercial (confirmacao de entrega do pedido)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import get_settings
from ..models import ConfirmacaoEntrega, Pedido
from ..pedidos_direto import obter_pedido_erp
from ..schemas import ConfirmacaoCreate, ConfirmacaoOut
from ..validacoes import ValidacaoError, validar_confirmacao

router = APIRouter(prefix="/confirmacoes", tags=["confirmacoes"])
settings = get_settings()


@router.post("", response_model=ConfirmacaoOut, status_code=201)
def registrar_confirmacao(payload: ConfirmacaoCreate, db: Session = Depends(get_db)):
    """Cria ou atualiza a confirmacao de entrega de um pedido.

    Como cada pedido tem no maximo uma confirmacao, reenviar para o mesmo pedido
    faz um upsert (atualiza a existente).
    """
    pedido = db.get(Pedido, payload.pedido_id)
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado")

    data_pedido = pedido.data_pedido
    if (
        settings.erp_source == "sqlserver"
        and settings.erp_read_mode == "direct"
        and pedido.erp_id is not None
    ):
        dados_erp = obter_pedido_erp(
            pedido.erp_id,
            force_refresh=True,
            strict_refresh=True,
        )
        if dados_erp is None:
            raise HTTPException(
                status_code=409,
                detail="O pedido nao esta mais disponivel no recorte atual do JUND.",
            )
        data_pedido = dados_erp["data_pedido"]

    try:
        validar_confirmacao(
            data_entrega_real=payload.data_entrega_real,
            data_pedido=data_pedido,
        )
    except ValidacaoError as e:
        raise HTTPException(status_code=422, detail=str(e))

    conf = pedido.confirmacao or ConfirmacaoEntrega(pedido_id=pedido.id)
    conf.data_entrega_real = payload.data_entrega_real
    conf.recebido_completo = payload.recebido_completo
    conf.motivo_falha = payload.motivo_falha
    conf.observacao = payload.observacao
    conf.usuario = payload.usuario

    db.add(conf)
    db.commit()
    db.refresh(conf)
    return conf


@router.delete("/{pedido_id}", status_code=204)
def remover_confirmacao(pedido_id: int, db: Session = Depends(get_db)):
    pedido = db.get(Pedido, pedido_id)
    if pedido is None or pedido.confirmacao is None:
        raise HTTPException(status_code=404, detail="Confirmacao nao encontrada")
    if (
        settings.erp_source == "sqlserver"
        and settings.erp_read_mode == "direct"
        and pedido.erp_id is not None
        and obter_pedido_erp(
            pedido.erp_id,
            force_refresh=True,
            strict_refresh=True,
        ) is None
    ):
        raise HTTPException(
            status_code=409,
            detail="O pedido nao esta mais disponivel no recorte atual do JUND.",
        )
    db.delete(pedido.confirmacao)
    db.commit()
