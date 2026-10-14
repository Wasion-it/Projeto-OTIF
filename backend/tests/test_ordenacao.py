"""Testes da ordenacao e paginacao server-side."""
from __future__ import annotations

from datetime import date

from app.ordenacao import ordenar_resultados, paginar
from app.otif import avaliar_pedido
from conftest import make_confirmacao, make_item, make_pedido

CONTRACT_DATE_PADRAO = date(2026, 3, 1)


def _resultado(
    pedido_id,
    numero,
    cliente,
    digitacao,
    conf=None,
    itens=None,
    contract_date=CONTRACT_DATE_PADRAO,
):
    pedido = make_pedido(
        pedido_id=pedido_id,
        numero=numero,
        cliente=cliente,
        data_solicitada=digitacao,
        contract_date=contract_date,
        itens=itens if itens is not None else [make_item(100, 100, digitacao)],
        confirmacao=conf,
    )
    return avaliar_pedido(pedido)


def test_ordenar_por_cliente_asc_e_desc():
    alfa = _resultado(1, "PED-1", "Alfa", date(2026, 1, 10))
    charlie = _resultado(2, "PED-2", "Charlie", date(2026, 1, 10))
    bravo = _resultado(3, "PED-3", "Bravo", date(2026, 1, 10))

    asc = ordenar_resultados([alfa, charlie, bravo], sort="cliente", order="asc")
    assert [resultado.cliente for resultado in asc] == ["Alfa", "Bravo", "Charlie"]

    desc = ordenar_resultados([alfa, charlie, bravo], sort="cliente", order="desc")
    assert [resultado.cliente for resultado in desc] == ["Charlie", "Bravo", "Alfa"]


def test_ordenar_por_status_usa_rank():
    sem_data = _resultado(
        1,
        "PED-1",
        "X",
        date.today(),
        contract_date=None,
    )
    pendente = _resultado(2, "PED-2", "X", date.today())
    otif = _resultado(
        3,
        "PED-3",
        "X",
        date(2026, 1, 10),
        conf=make_confirmacao(date(2026, 1, 20)),
    )
    falha = _resultado(
        4,
        "PED-4",
        "X",
        date(2026, 1, 10),
        itens=[make_item(100, 50, date(2026, 1, 5))],
        conf=make_confirmacao(date(2026, 1, 20)),
    )

    asc = ordenar_resultados(
        [otif, falha, pendente, sem_data],
        sort="status",
        order="asc",
    )
    assert [resultado.status for resultado in asc] == [
        "sem_contract_date",
        "pendente",
        "falha",
        "otif",
    ]


def test_ordenar_prazo_usa_contract_date_e_none_fica_no_fim():
    cedo = _resultado(
        1,
        "PED-1",
        "X",
        date(2026, 1, 10),
        contract_date=date(2026, 2, 1),
    )
    tarde = _resultado(
        2,
        "PED-2",
        "X",
        date(2025, 1, 1),
        contract_date=date(2026, 3, 1),
    )
    sem_data = _resultado(
        3,
        "PED-3",
        "X",
        date(2026, 1, 1),
        contract_date=None,
    )

    ordenados = ordenar_resultados([tarde, sem_data, cedo], sort="prazo", order="asc")
    assert [resultado.numero for resultado in ordenados] == ["PED-1", "PED-2", "PED-3"]


def test_valores_vazios_vao_para_o_fim_em_ambas_direcoes():
    pendente = _resultado(1, "PED-1", "X", date.today())
    fechado = _resultado(
        2,
        "PED-2",
        "X",
        date(2026, 1, 10),
        conf=make_confirmacao(date(2026, 1, 20)),
    )

    asc = ordenar_resultados([pendente, fechado], sort="atraso", order="asc")
    assert asc[-1].status == "pendente"
    desc = ordenar_resultados([pendente, fechado], sort="atraso", order="desc")
    assert desc[-1].status == "pendente"


def test_sort_desconhecido_cai_no_padrao():
    resultado = _resultado(1, "PED-1", "X", date(2026, 1, 10))
    assert ordenar_resultados([resultado], sort="inexistente", order="asc") == [resultado]


def test_paginar_primeira_pagina():
    seq = list(range(1, 26))
    itens, total, total_paginas = paginar(seq, page=1, page_size=10)
    assert total == 25
    assert total_paginas == 3
    assert itens == list(range(1, 11))


def test_paginar_ultima_pagina_parcial():
    seq = list(range(1, 26))
    itens, _, total_paginas = paginar(seq, page=3, page_size=10)
    assert itens == [21, 22, 23, 24, 25]
    assert total_paginas == 3


def test_paginar_fora_do_intervalo_retorna_vazio():
    seq = list(range(1, 26))
    itens, total, _ = paginar(seq, page=99, page_size=10)
    assert itens == []
    assert total == 25


def test_paginar_vazio():
    itens, total, total_paginas = paginar([], page=1, page_size=10)
    assert itens == []
    assert total == 0
    assert total_paginas == 1


def test_filtrar_por_etapa_atual():
    from app.ordenacao import filtrar_resultados
    from conftest import make_etapa

    no_pcp = _resultado(1, "PED-1", "X", date.today())
    pedido_producao = make_pedido(
        pedido_id=2,
        numero="PED-2",
        data_solicitada=date.today(),
        contract_date=CONTRACT_DATE_PADRAO,
        etapa=make_etapa(pcp_data=date(2026, 1, 2)),
    )
    na_producao = avaliar_pedido(pedido_producao)

    assert no_pcp.processo["etapa_atual"] == "pcp"
    assert na_producao.processo["etapa_atual"] == "producao"

    filtrados = filtrar_resultados([no_pcp, na_producao], etapa="producao")
    assert [r.numero for r in filtrados] == ["PED-2"]


def test_filtrar_etapa_desconhecida_e_ignorada():
    from app.ordenacao import filtrar_resultados

    resultado = _resultado(1, "PED-1", "X", date.today())
    assert filtrar_resultados([resultado], etapa="inexistente") == [resultado]
    assert filtrar_resultados([resultado], etapa=None) == [resultado]


def test_filtrar_combina_status_e_etapa():
    from app.ordenacao import filtrar_resultados

    pendente = _resultado(1, "PED-1", "X", date.today())
    otif = _resultado(
        2,
        "PED-2",
        "X",
        date(2026, 1, 10),
        conf=make_confirmacao(date(2026, 1, 20)),
    )
    assert filtrar_resultados([pendente, otif], status="otif", etapa="producao") == []
    assert filtrar_resultados([pendente, otif], status="pendente", etapa="pcp") == [
        pendente
    ]
