"""Testes da tela Comercial: parsers do JUND, status, prazos, filtros e API."""
from __future__ import annotations

from datetime import date, datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import comercial as com
from app.database import Base, get_db
from app.erp_sync import (
    _total_item as total_item,
    extrair_cod_cliente,
    extrair_contrato,
    extrair_seriais,
)
from app.models import Pedido
from app.otif import avaliar_pedido
from app.routers import comercial as router_comercial
from conftest import make_confirmacao, make_item, make_pedido

OBS_NF = (
    "**Dados Bancarios para Deposito:  Banco X, AG. 0007, C/C: 14.109475-9 "
    "**Vencimento: 60 dias apos a data de entrega. "
    "**Numero de Serial Item 10: 15145001 à 15145960; Serial Item 20: "
    "25727311 à 25731810.  **CONTRATO: 4600092216."
)


# ---------------------------------------------------------------------------
# Parsers do texto livre do JUND
# ---------------------------------------------------------------------------
def test_extrai_contrato():
    assert extrair_contrato(OBS_NF) == "4600092216"
    assert extrair_contrato("**Nº CONTRATO: 4600092216.") == "4600092216"
    assert extrair_contrato("sem nada") is None
    assert extrair_contrato(None) is None


def test_extrai_seriais_por_item_do_cliente():
    assert extrair_seriais(OBS_NF) == {
        10: "15145001 à 15145960",
        20: "25727311 à 25731810",
    }
    assert extrair_seriais("") == {}
    assert extrair_seriais(None) == {}


@pytest.mark.parametrize(
    "aplicacao",
    [" - ITEM 30 - CÓD.: 50-00-030-988", " - ITEM 30 - CËD.: 50-00-030-988"],
)
def test_extrai_cod_cliente_tolera_encoding(aplicacao):
    assert extrair_cod_cliente(aplicacao) == "50-00-030-988"


def test_cod_cliente_ausente():
    assert extrair_cod_cliente("sem codigo") is None
    assert extrair_cod_cliente(None) is None


# ---------------------------------------------------------------------------
# Montagem da linha e status
# ---------------------------------------------------------------------------
def _item_jund(numero, nf=None, entrega=None, valor_total=None, **extra):
    return SimpleNamespace(
        item_numero=numero,
        sku=f"SKU-{numero}",
        descricao=f"Medidor {numero}",
        qtd_pedida=100,
        qtd_faturada=100 if nf else 0,
        data_faturamento=None,
        item_cliente=numero * 10,
        cod_cliente=f"50-{numero}",
        valor_unitario=10.0 if valor_total else None,
        valor_total=valor_total,
        serial=None,
        nf_numero=nf,
        nf_serie="1" if nf else None,
        nf_emissao=datetime(2026, 5, 1, 10, 0) if nf else None,
        nf_embarque=None,
        nf_entrega=entrega,
        **extra,
    )


def _linha(itens, confirmacao=None):
    # Espelha o SimpleNamespace da leitura direta (itens com campos extras).
    pedido = SimpleNamespace(
        id=1,
        erp_id=100,
        numero="4200205640",
        numero_interno="4288",
        cliente="CPFL",
        data_pedido=date(2026, 1, 20),
        data_solicitada_cliente=date(2026, 1, 20),
        contract_date=date(2026, 5, 22),
        faturamento_em=None,
        embarque_em=None,
        nota_fiscal_numero=None,
        nota_fiscal_serie=None,
        contrato="4600092216",
        itens=itens,
        confirmacao=confirmacao,
        etapa=None,
        negativas_producao=[],
    )
    resultado = avaliar_pedido(pedido)
    return com.montar_pedido_comercial(pedido, resultado)


def test_status_por_item_e_pedido():
    linha = _linha(
        [
            _item_jund(1, nf="11015", entrega=date(2026, 5, 20), valor_total=100.0),
            _item_jund(2, nf="11113", valor_total=50.0),
            _item_jund(3),
        ]
    )
    assert [i["status"] for i in linha["itens"]] == [
        "entregue",
        "faturado",
        "em_programacao",
    ]
    assert linha["status"] == "parcial"
    assert linha["valor_total"] == 150.0
    assert linha["contrato"] == "4600092216"


def test_confirmacao_do_pedido_entrega_somente_itens_faturados():
    linha = _linha(
        [_item_jund(1, nf="11015"), _item_jund(2)],
        confirmacao=make_confirmacao(date(2026, 5, 25)),
    )
    faturado, programado = linha["itens"]
    assert faturado["status"] == "entregue"
    assert faturado["entrega_cliente"] == date(2026, 5, 25)
    assert programado["status"] == "em_programacao"
    assert programado["entrega_cliente"] is None
    assert linha["status"] == "parcial"


def test_pedido_sem_nf_esta_em_programacao_e_sem_valor():
    linha = _linha([_item_jund(1), _item_jund(2)])
    assert linha["status"] == "em_programacao"
    assert linha["valor_total"] is None


def test_todos_faturados_sem_entrega():
    linha = _linha([_item_jund(1, nf="1"), _item_jund(2, nf="2")])
    assert linha["status"] == "faturado"


def test_total_do_item_e_preco_vezes_quantidade():
    # PV02_VALOR_TOTAL do JUND inclui IPI/frete; o total da tela e preco x qtde.
    assert total_item(203.27, 1410) == 286610.70
    assert total_item(1.9804, 600) == 1188.24
    assert total_item(None, 10) is None
    assert total_item(10, None) is None


def test_item_orm_sem_campos_extras_nao_quebra():
    pedido = make_pedido(itens=[make_item(10, 10, item_numero=1)])
    linha = com.montar_pedido_comercial(pedido, avaliar_pedido(pedido))
    item = linha["itens"][0]
    assert item["nf_numero"] is None
    assert item["valor_total"] is None
    assert item["status"] == "em_programacao"


# ---------------------------------------------------------------------------
# Prazos e KPIs
# ---------------------------------------------------------------------------
HOJE = date(2026, 10, 21)


def test_prazos_apos_faturamento():
    prazo, folga, tipo = com.calcular_prazos(
        date(2026, 4, 28), date(2026, 5, 22), datetime(2026, 4, 29, 10, 0), HOJE
    )
    assert prazo == 24  # data do pedido ate o Contract Date
    assert folga == 23  # emissao da NF ate o Contract Date
    assert tipo == "apos_faturamento"


def test_folga_negativa_quando_fatura_depois_do_prazo():
    _, folga, _ = com.calcular_prazos(
        date(2026, 4, 1), date(2026, 4, 10), datetime(2026, 4, 15, 9, 0), HOJE
    )
    assert folga == -5


def test_pedido_nao_faturado_conta_a_folga_de_hoje():
    prazo, folga, tipo = com.calcular_prazos(date(2026, 10, 1), date(2026, 10, 30), None, HOJE)
    assert (prazo, folga, tipo) == (29, 9, "ate_hoje")


def test_sem_contract_date_nada_e_calculado():
    assert com.calcular_prazos(date(2026, 4, 28), None, datetime(2026, 4, 29), HOJE) == (
        None,
        None,
        None,
    )


def _linha_prazo(prazo, folga, tipo, contract=True):
    return {
        "contract_date": date(2026, 6, 1) if contract else None,
        "prazo_contratado_dias": prazo,
        "folga_dias": folga,
        "folga_tipo": tipo,
    }


def test_kpis_somam_so_pedidos_com_contract_date_e_faturados():
    linhas = [
        _linha_prazo(20, 18, "apos_faturamento"),
        _linha_prazo(10, 2, "apos_faturamento"),
        _linha_prazo(30, -4, "apos_faturamento"),
        _linha_prazo(15, 9, "ate_hoje"),  # nao faturado: fora da folga apos faturar
        _linha_prazo(None, None, None, contract=False),
    ]
    k = com.calcular_kpis(linhas, dias_alerta=7)
    assert (k["total_pedidos"], k["com_contract_date"], k["sem_contract_date"]) == (5, 4, 1)
    assert k["prazo_contratado"] == {"n": 4, "media": 18.8, "mediana": 17.5}
    assert k["folga_apos_faturamento"] == {"n": 3, "media": 5.3, "mediana": 2.0}
    assert k["faturados_fora_do_prazo"] == 1
    assert k["folga_curta"] == 1  # folga 2 (0..7)


def test_kpis_excluem_contract_date_anterior_ao_pedido_da_media():
    linhas = [
        _linha_prazo(20, 10, "apos_faturamento"),
        _linha_prazo(-62, -62, "apos_faturamento"),
    ]
    k = com.calcular_kpis(linhas, dias_alerta=7)
    assert k["contract_date_inconsistente"] == 1
    assert k["prazo_contratado"]["n"] == 1
    assert k["prazo_contratado"]["media"] == 20.0


def test_kpis_vazios():
    k = com.calcular_kpis([], dias_alerta=7)
    assert k["prazo_contratado"] == {"n": 0, "media": None, "mediana": None}
    assert k["folga_curta"] == 0


# ---------------------------------------------------------------------------
# Filtros e ordenacao
# ---------------------------------------------------------------------------
def _linhas_exemplo():
    a = _linha([_item_jund(1, nf="1", entrega=date(2026, 5, 1))])
    a.update(numero="A-1", cliente="CPFL", contract_date=date(2026, 6, 10))
    b = _linha([_item_jund(1)])
    b.update(numero="B-2", cliente="Outra", contract_date=None)
    c = _linha([_item_jund(1)])
    c.update(numero="C-3", cliente="CPFL", contract_date=date(2026, 5, 1))
    return [a, b, c]


def test_filtra_por_status_e_busca():
    linhas = _linhas_exemplo()
    assert [l["numero"] for l in com.filtrar_linhas(linhas, status="entregue")] == ["A-1"]
    assert len(com.filtrar_linhas(linhas, status="invalido")) == 3
    assert [l["numero"] for l in com.filtrar_linhas(linhas, busca="outra")] == ["B-2"]
    # Busca tambem enxerga contrato e codigo do cliente dentro dos itens.
    assert len(com.filtrar_linhas(linhas, busca="4600092216")) == 3
    assert len(com.filtrar_linhas(linhas, busca="50-1")) == 3


def test_ordena_com_vazios_no_fim():
    linhas = _linhas_exemplo()
    assert [l["numero"] for l in com.ordenar_linhas(linhas, "prazo", "asc")] == [
        "C-3",
        "A-1",
        "B-2",
    ]
    assert [l["numero"] for l in com.ordenar_linhas(linhas, "prazo", "desc")] == [
        "A-1",
        "C-3",
        "B-2",
    ]


# ---------------------------------------------------------------------------
# Endpoints (chamados direto, sem TestClient: httpx nao faz parte das deps)
# ---------------------------------------------------------------------------
@pytest.fixture
def db(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sessao = sessionmaker(bind=engine, autoflush=False)()

    sessao.add(
        make_pedido(
            pedido_id=7, numero="4200205640", itens=[make_item(100, 100, item_numero=1)]
        )
    )
    sessao.commit()

    monkeypatch.setattr(
        router_comercial,
        "carregar_pedidos",
        lambda db, *args, **kwargs: list(db.query(Pedido).all()),
    )
    yield sessao
    sessao.close()


def _listar(db, **filtros):
    parametros = dict(
        data_ini=None,
        data_fim=None,
        cliente=None,
        status=None,
        busca=None,
        sort="prazo",
        order="asc",
        page=1,
        page_size=25,
        force_refresh=False,
        db=db,
    )
    parametros.update(filtros)
    return router_comercial.listar_pedidos_comercial(**parametros)


def test_api_lista_os_pedidos(db):
    pagina = _listar(db)
    assert pagina.total == 1
    assert pagina.items[0].numero == "4200205640"


def test_api_devolve_kpis_junto_da_pagina(db):
    kpis = _listar(db).kpis
    assert kpis.total_pedidos == 1
    assert kpis.dias_alerta >= 0


def test_api_filtra_por_status_e_busca(db):
    assert _listar(db, status="em_programacao").total == 1
    assert _listar(db, status="entregue").total == 0
    assert _listar(db, busca="nao-existe").total == 0
    assert _listar(db, busca="4200205640").total == 1
