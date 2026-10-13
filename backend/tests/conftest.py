"""Helpers para construir pedidos ORM transientes nos testes."""
from __future__ import annotations

from datetime import date, datetime

from app.models import (
    ConfirmacaoEntrega,
    EtapaProcesso,
    ItemPedido,
    MotivoFalha,
    Pedido,
)


def make_item(
    qtd_pedida,
    qtd_faturada,
    data_faturamento=None,
    item_numero=1,
    sku="SKU-1",
    descricao="Item",
):
    return ItemPedido(
        item_numero=item_numero,
        sku=sku,
        descricao=descricao,
        qtd_pedida=qtd_pedida,
        qtd_faturada=qtd_faturada,
        data_faturamento=data_faturamento,
    )


def make_pedido(
    *,
    pedido_id=1,
    numero="PED-1",
    cliente="Cliente X",
    data_pedido=date(2026, 1, 1),
    data_solicitada=date(2026, 1, 10),
    contract_date=date(2026, 1, 31),
    faturamento_em=None,
    embarque_em=None,
    nota_fiscal_numero=None,
    nota_fiscal_serie=None,
    itens=None,
    confirmacao=None,
    etapa=None,
):
    """Monta pedido com digitação e Contract Date independentes."""
    pedido = Pedido(
        id=pedido_id,
        erp_id=None,
        numero=numero,
        numero_interno=None,
        cliente=cliente,
        data_pedido=data_pedido,
        data_solicitada_cliente=data_solicitada,
        contract_date=contract_date,
        faturamento_em=faturamento_em,
        embarque_em=embarque_em,
        nota_fiscal_numero=nota_fiscal_numero,
        nota_fiscal_serie=nota_fiscal_serie,
    )
    pedido.itens = itens if itens is not None else [make_item(100, 100)]
    pedido.confirmacao = confirmacao
    pedido.etapa = etapa
    return pedido


def make_confirmacao(
    data_entrega_real,
    recebido_completo=True,
    motivo_falha: MotivoFalha | None = None,
    observacao=None,
    usuario="comercial",
):
    return ConfirmacaoEntrega(
        data_entrega_real=data_entrega_real,
        recebido_completo=recebido_completo,
        motivo_falha=motivo_falha,
        observacao=observacao,
        usuario=usuario,
    )


def make_etapa(**kwargs):
    return EtapaProcesso(**kwargs)
