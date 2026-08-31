"""Endpoints do input MANUAL do time comercial (confirmacao de entrega)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ConfirmacaoEntrega, ItemPedido
from ..schemas import ConfirmacaoCreate, ConfirmacaoOut

router = APIRouter(prefix="/confirmacoes", tags=["confirmacoes"])


@router.post("", response_model=ConfirmacaoOut, status_code=201)
def registrar_confirmacao(payload: ConfirmacaoCreate, db: Session = Depends(get_db)):
    """Cria ou atualiza a confirmacao de entrega de um item.

    Como cada item tem no maximo uma confirmacao, reenviar para o mesmo item
    faz um upsert (atualiza a existente).
    """
    item = db.get(ItemPedido, payload.item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item de pedido nao encontrado")

    conf = item.confirmacao or ConfirmacaoEntrega(item_id=item.id)
    conf.data_entrega_real = payload.data_entrega_real
    conf.recebido_completo = payload.recebido_completo
    conf.motivo_falha = payload.motivo_falha
    conf.observacao = payload.observacao
    conf.usuario = payload.usuario

    db.add(conf)
    db.commit()
    db.refresh(conf)
    return conf


@router.delete("/{item_id}", status_code=204)
def remover_confirmacao(item_id: int, db: Session = Depends(get_db)):
    item = db.get(ItemPedido, item_id)
    if item is None or item.confirmacao is None:
        raise HTTPException(status_code=404, detail="Confirmacao nao encontrada")
    db.delete(item.confirmacao)
    db.commit()
