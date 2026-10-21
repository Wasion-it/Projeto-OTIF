"""Testes da Inspecao LEM automatica (inicio/fim vindos do jigadb)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from app import jigadb_lem
from app.config import Settings
from app.jigadb_lem import (
    JigadbIndisponivelError,
    _padrao_like,
    agregar_por_pedido,
    buscar_inspecoes_por_pedido,
    limpar_cache,
)
from app.otif import avaliar_pedido
from app.routers.etapas import _etapa_interna_atual, _valores
from conftest import make_etapa, make_pedido


# ---------------------------------------------------------------------------
# Agregacao por pedido: inicio do primeiro lote, fim do ultimo
# ---------------------------------------------------------------------------
def test_pedido_com_varios_lotes_usa_primeiro_inicio_e_ultimo_fim():
    inspecoes = {
        10: (datetime(2026, 3, 5, 8), datetime(2026, 3, 6, 17)),
        11: (datetime(2026, 3, 1, 9), datetime(2026, 3, 2, 16)),
        12: (datetime(2026, 3, 9, 7), datetime(2026, 3, 12, 18)),
    }
    pedido_por_op = {10: 500, 11: 500, 12: 500}

    assert agregar_por_pedido(inspecoes, pedido_por_op) == {
        500: (datetime(2026, 3, 1, 9), datetime(2026, 3, 12, 18))
    }


def test_ops_de_pedidos_diferentes_ficam_separadas_e_op_sem_pedido_e_ignorada():
    inspecoes = {
        1: (datetime(2026, 1, 1), datetime(2026, 1, 2)),
        2: (datetime(2026, 2, 1), datetime(2026, 2, 2)),
        3: (datetime(2026, 4, 1), datetime(2026, 4, 2)),
    }
    resultado = agregar_por_pedido(inspecoes, {1: 100, 2: 200})

    assert resultado == {
        100: (datetime(2026, 1, 1), datetime(2026, 1, 2)),
        200: (datetime(2026, 2, 1), datetime(2026, 2, 2)),
    }


def test_padrao_like_escapa_curingas_do_prefixo():
    assert _padrao_like("insp") == "INSP\\_%"
    assert _padrao_like(" ") == "INSP\\_%"
    assert _padrao_like("a_b%") == "A\\_B\\%\\_%"


# ---------------------------------------------------------------------------
# Cache e falhas do jigadb
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _cache_limpo():
    limpar_cache()
    yield
    limpar_cache()


def test_cache_evita_nova_consulta_dentro_do_ttl(monkeypatch):
    chamadas = []

    def falso(meses):
        chamadas.append(meses)
        return {1: (datetime(2026, 1, 1), datetime(2026, 1, 2))}

    monkeypatch.setattr(jigadb_lem, "_carregar", falso)

    primeiro = buscar_inspecoes_por_pedido(12)
    segundo = buscar_inspecoes_por_pedido(12)

    assert primeiro == segundo
    assert chamadas == [12]


def test_falha_reaproveita_ultima_leitura(monkeypatch):
    estado = {"falhar": False}

    def falso(meses):
        if estado["falhar"]:
            raise OSError("jigadb fora")
        return {1: (datetime(2026, 1, 1), datetime(2026, 1, 2))}

    monkeypatch.setattr(jigadb_lem, "_carregar", falso)
    monkeypatch.setattr(
        jigadb_lem, "get_settings", lambda: Settings(jigadb_cache_ttl_seconds=0)
    )

    bom = buscar_inspecoes_por_pedido(12)
    estado["falhar"] = True

    assert buscar_inspecoes_por_pedido(12) == bom


def test_falha_sem_leitura_anterior_levanta_erro_e_nao_devolve_vazio(monkeypatch):
    def falso(meses):
        raise OSError("jigadb fora")

    monkeypatch.setattr(jigadb_lem, "_carregar", falso)

    with pytest.raises(JigadbIndisponivelError):
        buscar_inspecoes_por_pedido(12)


def test_lem_automatico_exige_jigadb_e_jund_direto():
    # producao_source explicito: o .env local pode ligar a Producao automatica,
    # que exige LEM_SOURCE=jigadb.
    assert not Settings(
        lem_source="manual", producao_source="manual", erp_source="sqlserver"
    ).lem_automatico
    assert not Settings(lem_source="jigadb", erp_source="mock").lem_automatico
    assert not Settings(
        lem_source="jigadb", erp_source="sqlserver", erp_read_mode="snapshot"
    ).lem_automatico
    assert Settings(
        lem_source="jigadb", erp_source="sqlserver", erp_read_mode="direct"
    ).lem_automatico


# ---------------------------------------------------------------------------
# Processo do pedido
# ---------------------------------------------------------------------------
def _pedido_auto(inicio=None, fim=None, **etapa_kwargs):
    pedido = make_pedido(etapa=make_etapa(**etapa_kwargs))
    pedido.lem_automatico = True
    pedido.lem_inicio_em = inicio
    pedido.lem_fim_em = fim
    return pedido


def _lem(processo):
    return next(e for e in processo["etapas"] if e["chave"] == "lem")


def test_lem_automatico_usa_inicio_e_fim_do_jigadb_e_ignora_data_manual():
    pedido = _pedido_auto(
        inicio=datetime(2026, 1, 12, 8, 30),
        fim=datetime(2026, 1, 15, 17, 0),
        pcp_data=date(2026, 1, 3),
        producao_fim=date(2026, 1, 8),
        comercial_data=date(2026, 1, 5),
        inspecao_agendada_data=date(2026, 1, 10),
        lem_data=date(2026, 1, 9),  # manual: deve ser ignorada
    )

    processo = avaliar_pedido(pedido).processo
    lem = _lem(processo)

    assert processo["lem_automatico"] is True
    assert processo["lem_data"] == date(2026, 1, 15)
    assert processo["lem_inicio_em"] == datetime(2026, 1, 12, 8, 30)
    assert processo["lem_fim_em"] == datetime(2026, 1, 15, 17, 0)
    assert processo["inicio_lem_data"] == date(2026, 1, 12)
    assert lem["concluida"] is True
    assert lem["dias"] == 3  # do inicio real (12/01) ao fim real (15/01)
    assert lem["data_hora"] == datetime(2026, 1, 15, 17, 0)
    assert lem["data_inicio_hora"] == datetime(2026, 1, 12, 8, 30)


def test_lem_automatico_sem_os_fica_pendente_mesmo_com_data_manual():
    pedido = _pedido_auto(
        pcp_data=date(2026, 1, 3),
        producao_fim=date(2026, 1, 8),
        comercial_data=date(2026, 1, 5),
        inspecao_agendada_data=date(2026, 1, 10),
        lem_data=date(2026, 1, 9),
    )

    processo = avaliar_pedido(pedido).processo

    assert processo["etapa_atual"] == "lem"
    assert processo["lem_data"] is None
    assert processo["lem_fim_em"] is None
    # Sem inspecao real vale o marco previsto: max(agenda, fim da producao).
    assert processo["inicio_lem_data"] == date(2026, 1, 10)


def test_lem_manual_nao_muda():
    pedido = make_pedido(
        etapa=make_etapa(
            pcp_data=date(2026, 1, 3),
            producao_fim=date(2026, 1, 8),
            comercial_data=date(2026, 1, 5),
            inspecao_agendada_data=date(2026, 1, 10),
            lem_data=date(2026, 1, 12),
        )
    )

    processo = avaliar_pedido(pedido).processo

    assert processo["lem_automatico"] is False
    assert processo["lem_data"] == date(2026, 1, 12)
    assert processo["lem_inicio_em"] is None
    assert _lem(processo)["dias"] == 2  # 10/01 -> 12/01


# ---------------------------------------------------------------------------
# Etapa interna usada pelas confirmacoes
# ---------------------------------------------------------------------------
def test_etapa_interna_considera_lem_concluido_pelo_jigadb():
    etapa = make_etapa(
        pcp_data=date(2026, 1, 3),
        producao_fim=date(2026, 1, 8),
        comercial_data=date(2026, 1, 5),
        inspecao_agendada_data=date(2026, 1, 10),
    )

    assert _etapa_interna_atual(etapa) == "lem"
    assert _etapa_interna_atual(etapa, lem_automatico=True) == "lem"
    assert (
        _etapa_interna_atual(
            etapa, lem_automatico=True, lem_fim_em=datetime.now() - timedelta(days=1)
        )
        == "faturamento"
    )


def test_valores_ignoram_lem_manual_no_modo_automatico():
    etapa = make_etapa(
        pcp_data=date(2026, 1, 3),
        producao_fim=date(2026, 1, 8),
        lem_data=date(2026, 1, 9),
    )

    assert _valores(etapa)["lem_data"] == date(2026, 1, 9)
    assert _valores(etapa, lem_automatico=True)["lem_data"] is None
