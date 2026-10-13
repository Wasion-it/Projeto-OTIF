"""Popula o banco proprio com dados do ERP (mock) para o esqueleto.

Sincroniza pedidos/itens vindos do ERP (mock) -> tabelas pedido/item_pedido.

As confirmacoes de entrega e as etapas de processo (PCP, Producao, LEM,
Expedicao) sao inputs 100% MANUAIS e NAO sao populadas aqui: entram pelas telas
da aplicacao (ou, no futuro, por sync das fontes reais quando existirem).

Uso:
    python -m app.seed            # popula (mantendo o que ja existe)
    python -m app.seed --reset    # apaga tudo e recria
"""
from __future__ import annotations

import argparse

from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .models import ItemPedido, Pedido
from .sync import sincronizar_pedidos


def seed(reset: bool = False) -> None:
    if reset:
        print("Apagando e recriando tabelas...")
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        novos, _ = sincronizar_pedidos(db)
        total_pedidos = db.execute(select(Pedido)).scalars().all()
        total_itens = db.execute(select(ItemPedido)).scalars().all()

    com_contract_date = sum(1 for pedido in total_pedidos if pedido.contract_date is not None)
    sem_contract_date = len(total_pedidos) - com_contract_date

    print(f"Pedidos sincronizados do ERP (novos): {novos}")
    print(
        "Contract Date -> "
        f"informado: {com_contract_date}, ausente/invalido: {sem_contract_date}."
    )
    print("Confirmacoes de entrega: nenhuma gerada (input 100% manual).")
    print("Etapas de processo: nenhuma gerada (input 100% manual).")
    print(f"Total no banco -> pedidos: {len(total_pedidos)}, itens: {len(total_itens)}")
    print("Seed concluido.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Popula o banco com pedidos do ERP (mock).")
    parser.add_argument("--reset", action="store_true", help="Apaga tudo antes de popular.")
    args = parser.parse_args()
    seed(reset=args.reset)
