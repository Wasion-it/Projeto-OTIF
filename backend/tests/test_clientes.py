"""Testes do ranking OTIF por cliente com Contract Date."""
from __future__ import annotations

from datetime import date, timedelta

from app.otif import agregar_por_cliente, avaliar_pedido
from conftest import make_confirmacao, make_item, make_pedido


def _fechado(pedido_id, cliente, in_full=True, on_time=True):
    qtd_faturada = 100 if in_full else 50
    contract_date = date(2026, 2, 1)
    entrega = date(2026, 1, 20) if on_time else date(2026, 2, 10)
    return avaliar_pedido(
        make_pedido(
            pedido_id=pedido_id,
            cliente=cliente,
            data_solicitada=date(2025, 12, 15),
            contract_date=contract_date,
            itens=[make_item(100, qtd_faturada, date(2026, 1, 5))],
            confirmacao=make_confirmacao(entrega),
        )
    )


def test_contract_date_muda_on_time_sem_mudar_digitacao():
    dados = {
        "cliente": "Cliente A",
        "data_solicitada": date(2026, 1, 1),
        "itens": [make_item(100, 100, date(2026, 1, 3))],
    }
    prazo_longo = make_pedido(
        pedido_id=1,
        contract_date=date(2026, 2, 15),
        confirmacao=make_confirmacao(date(2026, 2, 10)),
        **dados,
    )
    prazo_curto = make_pedido(
        pedido_id=2,
        contract_date=date(2026, 2, 1),
        confirmacao=make_confirmacao(date(2026, 2, 10)),
        **dados,
    )

    assert avaliar_pedido(prazo_longo).on_time is True
    assert avaliar_pedido(prazo_curto).on_time is False


def test_ranking_pior_cliente_primeiro():
    resultados = [
        _fechado(1, "Alfa", in_full=True),
        _fechado(2, "Alfa", in_full=False),
        _fechado(3, "Bravo", in_full=True),
        _fechado(4, "Bravo", in_full=True),
    ]
    ranking = agregar_por_cliente(resultados)

    assert [cliente["cliente"] for cliente in ranking] == ["Alfa", "Bravo"]
    assert ranking[0]["otif_pct"] == 50.0
    assert ranking[1]["otif_pct"] == 100.0


def test_ranking_clientes_sem_avaliados_vao_para_o_fim():
    avaliado = _fechado(1, "ComDados", in_full=False)
    pendente = avaliar_pedido(
        make_pedido(
            pedido_id=2,
            cliente="SoPendente",
            contract_date=date.today() + timedelta(days=10),
        )
    )
    sem_contract_date = avaliar_pedido(
        make_pedido(
            pedido_id=3,
            cliente="SemData",
            contract_date=None,
        )
    )

    ranking = agregar_por_cliente([pendente, sem_contract_date, avaliado])

    assert ranking[0]["cliente"] == "ComDados"
    assert ranking[-1]["total_avaliados"] == 0
    sem_data = next(cliente for cliente in ranking if cliente["cliente"] == "SemData")
    assert sem_data["total_sem_contract_date"] == 1
    assert sem_data["total_pendentes"] == 0
