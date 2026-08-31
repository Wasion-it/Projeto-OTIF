"""Popula o banco proprio com dados fake para o esqueleto.

Faz duas coisas:
1) "Sincroniza" pedidos/itens vindos do ERP (mock) -> tabelas pedido/item_pedido.
2) Gera confirmacoes de entrega MANUAIS para parte dos itens ja vencidos,
   deixando os mais recentes como PENDENTES (a preencher pelo comercial).

Uso:
    python -m app.seed            # popula (mantendo o que ja existe)
    python -m app.seed --reset    # apaga tudo e recria
"""
from __future__ import annotations

import argparse
import random
from datetime import date, timedelta

from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .models import ConfirmacaoEntrega, ItemPedido, MotivoFalha, Pedido
from .sync import sincronizar_pedidos


def _gerar_confirmacoes(db) -> int:
    """Cria confirmacoes manuais para itens cujo prazo ja passou.

    ~85% dos itens vencidos recebem confirmacao; o restante fica pendente,
    junto com os itens cujo prazo ainda nao chegou.
    """
    random.seed(7)
    hoje = date.today()
    itens = db.execute(select(ItemPedido)).scalars().all()
    criadas = 0

    for item in itens:
        if item.confirmacao is not None:
            continue
        prazo = item.pedido.data_solicitada_cliente

        # Prazo ainda no futuro -> ninguem confirmou entrega ainda.
        if prazo >= hoje:
            continue
        # Deixa uma fracao dos vencidos como pendente (comercial ainda vai lancar).
        if random.random() < 0.15:
            continue

        # Data de entrega: baseada no faturamento (proxy de expedicao) + transito.
        base = item.data_faturamento or prazo
        transito = random.randint(2, 7)
        entrega = base + timedelta(days=transito)
        if entrega > hoje:
            entrega = hoje

        recebido_completo = float(item.qtd_faturada) >= float(item.qtd_pedida)

        # Avaria eventual mesmo com faturamento completo.
        if recebido_completo and random.random() < 0.05:
            recebido_completo = False

        on_time = entrega <= prazo
        motivo = None
        if not recebido_completo:
            motivo = random.choice([MotivoFalha.FALTA_ESTOQUE, MotivoFalha.AVARIA])
        elif not on_time:
            if item.data_faturamento and item.data_faturamento > prazo:
                motivo = random.choice(
                    [MotivoFalha.ATRASO_FATURAMENTO, MotivoFalha.ATRASO_PRODUCAO]
                )
            else:
                motivo = MotivoFalha.ATRASO_TRANSPORTE

        db.add(
            ConfirmacaoEntrega(
                item_id=item.id,
                data_entrega_real=entrega,
                recebido_completo=recebido_completo,
                motivo_falha=motivo,
                observacao=None,
                usuario=random.choice(["ana.comercial", "bruno.comercial", "carla.comercial"]),
            )
        )
        criadas += 1

    db.commit()
    return criadas


def seed(reset: bool = False) -> None:
    if reset:
        print("Apagando e recriando tabelas...")
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        novos, _ = sincronizar_pedidos(db)
        confirmadas = _gerar_confirmacoes(db)
        total_pedidos = db.execute(select(Pedido)).scalars().all()
        total_itens = db.execute(select(ItemPedido)).scalars().all()

    print(f"Pedidos sincronizados do ERP (novos): {novos}")
    print(f"Confirmacoes manuais geradas: {confirmadas}")
    print(f"Total no banco -> pedidos: {len(total_pedidos)}, itens: {len(total_itens)}")
    print("Seed concluido.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Popula o banco com dados fake de OTIF.")
    parser.add_argument("--reset", action="store_true", help="Apaga tudo antes de popular.")
    args = parser.parse_args()
    seed(reset=args.reset)
