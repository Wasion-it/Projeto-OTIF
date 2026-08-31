"""Sincronizacao ERP -> banco proprio (idempotente).

Puxa os pedidos de `buscar_pedidos_erp()` (mock ou SQL Server, conforme
ERP_SOURCE) e faz upsert em pedido/item_pedido.

Preserva os dados MANUAIS: ao reprocessar um pedido ja existente, os itens sao
casados por numero e apenas os campos vindos do ERP sao atualizados; as
confirmacoes de entrega (input do comercial) nunca sao apagadas.

Uso:
    python -m app.sync                # sincroniza (respeita ERP_SOURCE do .env)
    python -m app.sync --meses 6      # janela de 6 meses (apenas SQL Server)
"""
from __future__ import annotations

import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine
from .erp_sync import buscar_pedidos_erp
from .models import ItemPedido, Pedido


def _achar_pedido(db: Session, p: dict) -> Pedido | None:
    if p.get("erp_id") is not None:
        return db.execute(
            select(Pedido).where(Pedido.erp_id == p["erp_id"])
        ).scalar_one_or_none()
    return db.execute(
        select(Pedido).where(Pedido.numero == p["numero"])
    ).scalar_one_or_none()


def _upsert_itens(pedido: Pedido, itens: list[dict]) -> None:
    """Atualiza itens existentes (por item_numero) e adiciona novos.
    Nunca remove itens, para preservar confirmacoes ja lancadas."""
    por_numero = {it.item_numero: it for it in pedido.itens}
    for it in itens:
        existente = por_numero.get(it["item_numero"])
        if existente is None:
            pedido.itens.append(
                ItemPedido(
                    item_numero=it["item_numero"],
                    sku=it["sku"],
                    descricao=it["descricao"],
                    qtd_pedida=it["qtd_pedida"],
                    qtd_faturada=it["qtd_faturada"],
                    data_faturamento=it["data_faturamento"],
                    origem="ERP",
                )
            )
        else:
            # So os campos vindos do ERP; a confirmacao (relacao) fica intacta.
            existente.sku = it["sku"]
            existente.descricao = it["descricao"]
            existente.qtd_pedida = it["qtd_pedida"]
            existente.qtd_faturada = it["qtd_faturada"]
            existente.data_faturamento = it["data_faturamento"]


def sincronizar_pedidos(db: Session, meses: int = 12) -> tuple[int, int]:
    """Retorna (novos, atualizados)."""
    pedidos = buscar_pedidos_erp(meses=meses)
    novos = atualizados = 0

    for p in pedidos:
        pedido = _achar_pedido(db, p)
        if pedido is None:
            pedido = Pedido(erp_id=p.get("erp_id"))
            db.add(pedido)
            novos += 1
        else:
            atualizados += 1
        pedido.numero = p["numero"]
        pedido.cliente = p["cliente"]
        pedido.data_pedido = p["data_pedido"]
        pedido.data_solicitada_cliente = p["data_solicitada_cliente"]
        pedido.origem = "ERP"
        _upsert_itens(pedido, p["itens"])

    db.commit()
    return novos, atualizados


def main() -> None:
    parser = argparse.ArgumentParser(description="Sincroniza pedidos do ERP.")
    parser.add_argument("--meses", type=int, default=12, help="Janela em meses (SQL Server).")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        novos, atualizados = sincronizar_pedidos(db, meses=args.meses)
        total = db.execute(select(Pedido)).scalars().all()
        itens = db.execute(select(ItemPedido)).scalars().all()
    print(f"Sync concluido. Novos: {novos}, atualizados: {atualizados}.")
    print(f"Total no banco -> pedidos: {len(total)}, itens: {len(itens)}.")


if __name__ == "__main__":
    main()
