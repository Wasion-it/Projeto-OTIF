"""Testes da Producao automatica (inicio/fim da lacracao vindos do jigadb)."""
from __future__ import annotations

from datetime import date, datetime

import pytest

from app import jigadb_producao
from app.config import Settings
from app.jigadb_lem import JigadbIndisponivelError
from app.jigadb_producao import (
    LoteProducao,
    agregar_por_pedido,
    buscar_producao_por_pedido,
    limpar_cache,
)
from app.otif import avaliar_pedido
from app.routers.etapas import _etapa_interna_atual, _valores
from conftest import make_etapa, make_pedido


def _lote(id_op, quantidade, produzidos, inicio=None, fim=None):
    return LoteProducao(
        id_op=id_op,
        quantidade=quantidade,
        produzidos=produzidos,
        inicio=inicio,
        fim=fim,
    )


# ---------------------------------------------------------------------------
# Agregacao por pedido
# ---------------------------------------------------------------------------
def test_lote_completo_define_inicio_e_fim():
    lotes = [_lote(10, 100, 100, datetime(2026, 3, 2, 8), datetime(2026, 3, 4, 17))]

    assert agregar_por_pedido(lotes, {10: 500}) == {
        500: (datetime(2026, 3, 2, 8), datetime(2026, 3, 4, 17))
    }


def test_lote_parcial_tem_inicio_mas_sem_fim():
    lotes = [_lote(10, 100, 40, datetime(2026, 3, 2, 8), datetime(2026, 3, 3, 10))]

    assert agregar_por_pedido(lotes, {10: 500}) == {
        500: (datetime(2026, 3, 2, 8), None)
    }


def test_pedido_com_varios_lotes_usa_primeiro_inicio_e_ultimo_fim():
    lotes = [
        _lote(10, 50, 50, datetime(2026, 3, 5, 8), datetime(2026, 3, 6, 17)),
        _lote(11, 50, 50, datetime(2026, 3, 1, 9), datetime(2026, 3, 2, 16)),
        _lote(12, 80, 80, datetime(2026, 3, 9, 7), datetime(2026, 3, 12, 18)),
    ]

    assert agregar_por_pedido(lotes, {10: 500, 11: 500, 12: 500}) == {
        500: (datetime(2026, 3, 1, 9), datetime(2026, 3, 12, 18))
    }


def test_um_lote_incompleto_impede_o_fim_do_pedido():
    lotes = [
        _lote(10, 50, 50, datetime(2026, 3, 1, 9), datetime(2026, 3, 2, 16)),
        _lote(11, 50, 20, datetime(2026, 3, 5, 8), datetime(2026, 3, 5, 12)),
    ]

    assert agregar_por_pedido(lotes, {10: 500, 11: 500}) == {
        500: (datetime(2026, 3, 1, 9), None)
    }


def test_lote_sem_lacracao_nao_conclui_nem_inicia():
    lotes = [_lote(10, 50, 0)]

    assert agregar_por_pedido(lotes, {10: 500}) == {500: (None, None)}


def test_lote_sem_quantidade_nunca_e_considerado_concluido():
    lotes = [
        _lote(10, None, 30, datetime(2026, 3, 1), datetime(2026, 3, 2)),
        _lote(11, 0, 30, datetime(2026, 3, 1), datetime(2026, 3, 2)),
    ]

    assert agregar_por_pedido(lotes, {10: 500, 11: 600}) == {
        500: (datetime(2026, 3, 1), None),
        600: (datetime(2026, 3, 1), None),
    }


def test_producao_acima_da_quantidade_conta_como_concluida():
    lotes = [_lote(10, 100, 102, datetime(2026, 3, 1), datetime(2026, 3, 3))]

    assert agregar_por_pedido(lotes, {10: 500})[500][1] == datetime(2026, 3, 3)


def test_op_sem_pedido_e_ignorada_e_pedidos_ficam_separados():
    lotes = [
        _lote(1, 10, 10, datetime(2026, 1, 1), datetime(2026, 1, 2)),
        _lote(2, 10, 10, datetime(2026, 2, 1), datetime(2026, 2, 2)),
        _lote(3, 10, 10, datetime(2026, 4, 1), datetime(2026, 4, 2)),
    ]

    assert agregar_por_pedido(lotes, {1: 100, 2: 200}) == {
        100: (datetime(2026, 1, 1), datetime(2026, 1, 2)),
        200: (datetime(2026, 2, 1), datetime(2026, 2, 2)),
    }


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

    monkeypatch.setattr(jigadb_producao, "_carregar", falso)

    assert buscar_producao_por_pedido(12) == buscar_producao_por_pedido(12)
    assert chamadas == [12]


def test_falha_reaproveita_ultima_leitura(monkeypatch):
    estado = {"falhar": False}

    def falso(meses):
        if estado["falhar"]:
            raise OSError("jigadb fora")
        return {1: (datetime(2026, 1, 1), datetime(2026, 1, 2))}

    monkeypatch.setattr(jigadb_producao, "_carregar", falso)
    monkeypatch.setattr(
        jigadb_producao, "get_settings", lambda: Settings(jigadb_cache_ttl_seconds=0)
    )

    bom = buscar_producao_por_pedido(12)
    estado["falhar"] = True

    assert buscar_producao_por_pedido(12) == bom


def test_falha_sem_leitura_anterior_levanta_erro_e_nao_devolve_vazio(monkeypatch):
    def falso(meses):
        raise OSError("jigadb fora")

    monkeypatch.setattr(jigadb_producao, "_carregar", falso)

    with pytest.raises(JigadbIndisponivelError):
        buscar_producao_por_pedido(12)


# ---------------------------------------------------------------------------
# Configuracao
# ---------------------------------------------------------------------------
def test_producao_automatica_exige_jigadb_e_jund_direto():
    base = dict(lem_source="jigadb", erp_source="sqlserver", erp_read_mode="direct")

    assert not Settings(**{**base, "producao_source": "manual"}).producao_automatica
    assert not Settings(**{**base, "producao_source": "jigadb", "erp_source": "mock"}).producao_automatica
    assert not Settings(
        **{**base, "producao_source": "jigadb", "erp_read_mode": "snapshot"}
    ).producao_automatica
    assert Settings(**{**base, "producao_source": "jigadb"}).producao_automatica


def test_producao_jigadb_sem_lem_jigadb_e_rejeitada():
    with pytest.raises(ValueError, match="LEM_SOURCE=jigadb"):
        Settings(producao_source="jigadb", lem_source="manual")


# ---------------------------------------------------------------------------
# Processo do pedido
# ---------------------------------------------------------------------------
def _pedido_auto(inicio=None, fim=None, **etapa_kwargs):
    pedido = make_pedido(etapa=make_etapa(**etapa_kwargs))
    pedido.producao_automatica = True
    pedido.producao_inicio_em = inicio
    pedido.producao_fim_em = fim
    return pedido


def _etapa(processo, chave):
    return next(e for e in processo["etapas"] if e["chave"] == chave)


def test_producao_automatica_usa_lacracao_e_ignora_data_manual():
    pedido = _pedido_auto(
        inicio=datetime(2026, 1, 6, 8, 0),
        fim=datetime(2026, 1, 9, 17, 0),
        pcp_data=date(2026, 1, 3),
        producao_fim=date(2026, 1, 20),  # manual: deve ser ignorada
    )

    processo = avaliar_pedido(pedido).processo
    producao = _etapa(processo, "producao")

    assert processo["producao_automatica"] is True
    assert processo["producao_fim"] == date(2026, 1, 9)
    assert processo["producao_inicio_em"] == datetime(2026, 1, 6, 8, 0)
    assert processo["producao_fim_em"] == datetime(2026, 1, 9, 17, 0)
    assert producao["concluida"] is True
    assert producao["data"] == date(2026, 1, 9)
    assert producao["data_hora"] == datetime(2026, 1, 9, 17, 0)
    assert producao["data_inicio_hora"] == datetime(2026, 1, 6, 8, 0)
    # Do inicio real (06/01) ao fim real (09/01); a espera desde o PCP nao conta.
    assert producao["dias"] == 3
    assert processo["etapa_atual"] == "comercial"


def test_producao_em_andamento_fica_na_etapa_com_dias_desde_o_inicio():
    pedido = _pedido_auto(
        inicio=datetime(2026, 1, 6, 8, 0),
        fim=None,
        pcp_data=date(2026, 1, 3),
        producao_fim=date(2026, 1, 8),  # manual: ignorada, nao conclui
    )

    processo = avaliar_pedido(pedido).processo
    hoje = processo["data_operacional"]

    assert processo["etapa_atual"] == "producao"
    assert processo["producao_fim"] is None
    assert _etapa(processo, "producao")["concluida"] is False
    assert processo["dias_na_etapa_atual"] == (hoje - date(2026, 1, 6)).days


def test_producao_sem_lacracao_conta_dias_desde_o_pcp():
    pedido = _pedido_auto(pcp_data=date(2026, 1, 3))

    processo = avaliar_pedido(pedido).processo
    hoje = processo["data_operacional"]

    assert processo["etapa_atual"] == "producao"
    assert processo["producao_inicio_em"] is None
    assert processo["dias_na_etapa_atual"] == (hoje - date(2026, 1, 3)).days


def test_producao_automatica_define_o_marco_zero_do_lem():
    pedido = _pedido_auto(
        inicio=datetime(2026, 1, 6, 8, 0),
        fim=datetime(2026, 1, 9, 17, 0),
        pcp_data=date(2026, 1, 3),
        comercial_data=date(2026, 1, 4),
        inspecao_agendada_data=date(2026, 1, 7),
    )

    # max(agenda 07/01, fim da producao 09/01)
    assert avaliar_pedido(pedido).processo["inicio_lem_data"] == date(2026, 1, 9)


def test_producao_pode_terminar_antes_do_pcp_registrado_sem_quebrar_o_processo():
    pedido = _pedido_auto(
        inicio=datetime(2026, 1, 2, 8, 0),
        fim=datetime(2026, 1, 3, 17, 0),
    )

    processo = avaliar_pedido(pedido).processo

    assert processo["etapa_atual"] == "pcp"
    assert _etapa(processo, "producao")["concluida"] is True
    # PCP pendente: a duracao nao e calculada fora de um fluxo contiguo.
    assert _etapa(processo, "producao")["dias"] is None


def test_producao_manual_nao_muda():
    pedido = make_pedido(
        etapa=make_etapa(pcp_data=date(2026, 1, 3), producao_fim=date(2026, 1, 8))
    )

    processo = avaliar_pedido(pedido).processo
    producao = _etapa(processo, "producao")

    assert processo["producao_automatica"] is False
    assert processo["producao_fim"] == date(2026, 1, 8)
    assert processo["producao_inicio_em"] is None
    assert producao["dias"] == 5  # 03/01 -> 08/01
    assert producao["data_hora"] is None
    assert producao["data_inicio_hora"] is None


# ---------------------------------------------------------------------------
# Etapa interna e validacao usadas pelas confirmacoes
# ---------------------------------------------------------------------------
def test_etapa_interna_considera_producao_concluida_pelo_jigadb():
    etapa = make_etapa(pcp_data=date(2026, 1, 3), producao_fim=date(2026, 1, 8))

    # Manual: a data gravada conclui a producao.
    assert _etapa_interna_atual(etapa) == "comercial"
    # Automatica: so o fim do jigadb conclui, a data manual e ignorada.
    assert _etapa_interna_atual(etapa, producao_automatica=True) == "producao"
    assert (
        _etapa_interna_atual(
            etapa,
            producao_automatica=True,
            producao_fim_em=datetime(2026, 1, 9, 17),
        )
        == "comercial"
    )


def test_valores_ignoram_producao_manual_no_modo_automatico():
    etapa = make_etapa(pcp_data=date(2026, 1, 3), producao_fim=date(2026, 1, 8))

    assert _valores(etapa)["producao_fim"] == date(2026, 1, 8)
    assert _valores(etapa, producao_automatica=True)["producao_fim"] is None
