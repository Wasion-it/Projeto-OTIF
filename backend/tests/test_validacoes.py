"""Testes das validacoes de regras de negocio."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.validacoes import ValidacaoError, validar_confirmacao, validar_etapas


# ---------------------------------------------------------------------------
# Confirmacao de entrega
# ---------------------------------------------------------------------------
def test_confirmacao_valida_passa():
    validar_confirmacao(
        data_entrega_real=date(2026, 1, 20),
        data_pedido=date(2026, 1, 1),
        hoje=date(2026, 2, 1),
    )


def test_confirmacao_no_futuro_falha():
    amanha = date.today() + timedelta(days=1)
    with pytest.raises(ValidacaoError, match="futuro"):
        validar_confirmacao(data_entrega_real=amanha, data_pedido=date(2026, 1, 1))


def test_confirmacao_antes_do_pedido_falha():
    with pytest.raises(ValidacaoError, match="anterior"):
        validar_confirmacao(
            data_entrega_real=date(2026, 1, 1),
            data_pedido=date(2026, 1, 10),
            hoje=date(2026, 2, 1),
        )


def test_confirmacao_sem_data_pedido_ignora_regra_de_ordem():
    validar_confirmacao(
        data_entrega_real=date(2026, 1, 1),
        data_pedido=None,
        hoje=date(2026, 2, 1),
    )


# ---------------------------------------------------------------------------
# Etapas do processo
# ---------------------------------------------------------------------------
def test_etapas_validas_passam_com_comercial():
    validar_etapas(
        data_pedido=date(2026, 1, 1),
        pcp_data=date(2026, 1, 3),
        producao_plan_inicio=date(2026, 1, 4),
        producao_plan_fim=date(2026, 1, 15),
        producao_fim=date(2026, 1, 16),
        comercial_data=date(2026, 1, 17),
        inspecao_agendada_data=date(2026, 1, 18),
        lem_data=date(2026, 1, 18),
        faturamento_data=date(2026, 1, 19),
        embarque_data=date(2026, 1, 20),
        hoje=date(2026, 2, 1),
    )


def test_etapas_parciais_passam():
    validar_etapas(
        data_pedido=date(2026, 1, 1),
        pcp_data=date(2026, 1, 3),
        hoje=date(2026, 2, 1),
    )


def test_agendamento_da_inspecao_pode_estar_no_futuro():
    validar_etapas(
        data_pedido=date(2026, 1, 1),
        pcp_data=date(2026, 1, 3),
        producao_fim=date(2026, 1, 16),
        comercial_data=date(2026, 2, 1),
        inspecao_agendada_data=date(2026, 2, 10),
        hoje=date(2026, 2, 1),
    )


def test_comercial_sem_agendamento_falha():
    with pytest.raises(ValidacaoError, match="informadas juntas"):
        validar_etapas(
            data_pedido=date(2026, 1, 1),
            pcp_data=date(2026, 1, 3),
            producao_fim=date(2026, 1, 16),
            comercial_data=date(2026, 1, 17),
            hoje=date(2026, 2, 1),
        )


def test_agendamento_sem_conclusao_comercial_falha():
    with pytest.raises(ValidacaoError, match="informadas juntas"):
        validar_etapas(
            data_pedido=date(2026, 1, 1),
            pcp_data=date(2026, 1, 3),
            producao_fim=date(2026, 1, 16),
            inspecao_agendada_data=date(2026, 1, 18),
            hoje=date(2026, 2, 1),
        )


def test_lem_sem_comercial_falha():
    with pytest.raises(ValidacaoError, match="Comercial"):
        validar_etapas(
            data_pedido=date(2026, 1, 1),
            pcp_data=date(2026, 1, 3),
            producao_fim=date(2026, 1, 16),
            lem_data=date(2026, 1, 18),
            hoje=date(2026, 2, 1),
        )


def test_agendamento_antes_da_conclusao_comercial_falha():
    with pytest.raises(ValidacaoError, match="anterior a conclusao do Comercial"):
        validar_etapas(
            data_pedido=date(2026, 1, 1),
            pcp_data=date(2026, 1, 3),
            producao_fim=date(2026, 1, 16),
            comercial_data=date(2026, 1, 18),
            inspecao_agendada_data=date(2026, 1, 17),
            hoje=date(2026, 2, 1),
        )


def test_etapa_no_futuro_falha():
    amanha = date.today() + timedelta(days=1)
    with pytest.raises(ValidacaoError, match="futuro"):
        validar_etapas(data_pedido=date(2026, 1, 1), pcp_data=amanha)


def test_etapa_antes_do_pedido_falha():
    with pytest.raises(ValidacaoError, match="anterior a data do pedido"):
        validar_etapas(
            data_pedido=date(2026, 1, 10),
            pcp_data=date(2026, 1, 5),
            hoje=date(2026, 2, 1),
        )


def test_janela_planejada_invertida_falha():
    with pytest.raises(ValidacaoError, match="fim planejado"):
        validar_etapas(
            data_pedido=date(2026, 1, 1),
            producao_plan_inicio=date(2026, 1, 15),
            producao_plan_fim=date(2026, 1, 10),
            hoje=date(2026, 2, 1),
        )


def test_nao_pode_pular_pcp_para_producao():
    with pytest.raises(ValidacaoError, match="PCP"):
        validar_etapas(
            data_pedido=date(2026, 1, 1),
            producao_fim=date(2026, 1, 10),
            hoje=date(2026, 2, 1),
        )


def test_etapas_fora_de_ordem_falha():
    with pytest.raises(ValidacaoError, match="Conclua a Producao"):
        validar_etapas(
            data_pedido=date(2026, 1, 1),
            pcp_data=date(2026, 1, 3),
            comercial_data=date(2026, 1, 11),
            inspecao_agendada_data=date(2026, 1, 20),
            lem_data=date(2026, 1, 20),
            hoje=date(2026, 2, 1),
        )


def test_lem_antes_do_inicio_mais_tardio_falha():
    with pytest.raises(ValidacaoError, match="inicio do LEM"):
        validar_etapas(
            data_pedido=date(2026, 1, 1),
            pcp_data=date(2026, 1, 3),
            producao_fim=date(2026, 1, 20),
            comercial_data=date(2026, 1, 20),
            inspecao_agendada_data=date(2026, 1, 20),
            lem_data=date(2026, 1, 18),
            hoje=date(2026, 2, 1),
        )


def test_comercial_pode_agendar_sem_producao_concluida():
    validar_etapas(
        data_pedido=date(2026, 1, 1),
        comercial_data=date(2026, 1, 5),
        inspecao_agendada_data=date(2026, 1, 20),
        hoje=date(2026, 1, 10),
    )


def test_comercial_pode_ter_agendado_antes_do_fim_da_producao():
    validar_etapas(
        data_pedido=date(2026, 1, 1),
        pcp_data=date(2026, 1, 3),
        comercial_data=date(2026, 1, 5),
        inspecao_agendada_data=date(2026, 1, 20),
        producao_fim=date(2026, 1, 10),
        hoje=date(2026, 1, 15),
    )


def test_lem_nao_pode_iniciar_antes_da_producao_quando_ela_termina_depois():
    with pytest.raises(ValidacaoError, match="inicio do LEM"):
        validar_etapas(
            data_pedido=date(2026, 1, 1),
            pcp_data=date(2026, 1, 3),
            comercial_data=date(2026, 1, 5),
            inspecao_agendada_data=date(2026, 1, 10),
            producao_fim=date(2026, 1, 20),
            lem_data=date(2026, 1, 19),
            hoje=date(2026, 2, 1),
        )


def test_embarque_antes_do_faturamento_falha():
    with pytest.raises(ValidacaoError, match="nao pode ser anterior"):
        validar_etapas(
            data_pedido=date(2026, 1, 1),
            pcp_data=date(2026, 1, 2),
            producao_fim=date(2026, 1, 5),
            comercial_data=date(2026, 1, 6),
            inspecao_agendada_data=date(2026, 1, 10),
            lem_data=date(2026, 1, 12),
            faturamento_data=date(2026, 1, 15),
            embarque_data=date(2026, 1, 14),
            hoje=date(2026, 2, 1),
        )


def test_embarque_no_mesmo_dia_do_faturamento_passa():
    validar_etapas(
        data_pedido=date(2026, 1, 1),
        pcp_data=date(2026, 1, 2),
        producao_fim=date(2026, 1, 5),
        comercial_data=date(2026, 1, 6),
        inspecao_agendada_data=date(2026, 1, 10),
        lem_data=date(2026, 1, 12),
        faturamento_data=date(2026, 1, 15),
        embarque_data=date(2026, 1, 15),
        hoje=date(2026, 2, 1),
    )
