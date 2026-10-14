"""Testes do calculo OTIF baseado exclusivamente no Contract Date."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from app.models import MotivoFalha
from app.otif import (
    STATUS_FALHA,
    STATUS_OTIF,
    STATUS_PENDENTE,
    STATUS_SEM_CONTRACT_DATE,
    agregar,
    agregar_processo,
    avaliar_pedido,
)
from app.validacoes import data_operacional
from conftest import make_confirmacao, make_etapa, make_item, make_pedido


# ---------------------------------------------------------------------------
# Pendentes e qualidade do Contract Date
# ---------------------------------------------------------------------------
def test_pendente_no_prazo():
    hoje = date.today()
    contract_date = hoje + timedelta(days=60)
    pedido = make_pedido(
        data_pedido=hoje,
        data_solicitada=hoje,
        contract_date=contract_date,
    )
    resultado = avaliar_pedido(pedido, dias_alerta=7)

    assert resultado.status == STATUS_PENDENTE
    assert resultado.on_time is None
    assert resultado.contract_date == contract_date
    assert resultado.prazo_entrega == contract_date
    assert resultado.situacao_prazo == "no_prazo"
    assert resultado.dias_restantes == 60


def test_pendente_atencao():
    hoje = date.today()
    pedido = make_pedido(contract_date=hoje + timedelta(days=5))
    resultado = avaliar_pedido(pedido, dias_alerta=7)

    assert resultado.status == STATUS_PENDENTE
    assert resultado.situacao_prazo == "atencao"
    assert resultado.dias_restantes == 5


def test_pendente_vencido():
    hoje = date.today()
    pedido = make_pedido(contract_date=hoje - timedelta(days=3))
    resultado = avaliar_pedido(pedido, dias_alerta=7)

    assert resultado.status == STATUS_PENDENTE
    assert resultado.situacao_prazo == "vencido"
    assert resultado.dias_restantes == -3


def test_sem_contract_date_nao_fabrica_prazo():
    pedido = make_pedido(
        data_solicitada=date(2026, 1, 10),
        contract_date=None,
    )
    resultado = avaliar_pedido(pedido)

    assert resultado.status == STATUS_SEM_CONTRACT_DATE
    assert resultado.contract_date is None
    assert resultado.prazo_entrega is None
    assert resultado.on_time is None
    assert resultado.dias_restantes is None
    assert resultado.situacao_prazo is None


def test_sem_contract_date_continua_nao_avaliado_apos_confirmacao():
    pedido = make_pedido(
        contract_date=None,
        confirmacao=make_confirmacao(date(2026, 1, 20)),
    )
    resultado = avaliar_pedido(pedido)
    metricas = agregar([resultado])

    assert resultado.status == STATUS_SEM_CONTRACT_DATE
    assert resultado.data_entrega_real == date(2026, 1, 20)
    assert metricas["total_avaliados"] == 0
    assert metricas["total_pendentes"] == 0
    assert metricas["total_sem_contract_date"] == 1


# ---------------------------------------------------------------------------
# Pedidos fechados: OTIF, On Time e In Full
# ---------------------------------------------------------------------------
def test_otif_sucesso_no_contract_date():
    pedido = make_pedido(
        data_solicitada=date(2025, 12, 1),
        contract_date=date(2026, 1, 31),
        itens=[make_item(100, 100, data_faturamento=date(2026, 1, 5))],
        confirmacao=make_confirmacao(date(2026, 1, 20)),
    )
    resultado = avaliar_pedido(pedido)

    assert resultado.status == STATUS_OTIF
    assert resultado.on_time is True
    assert resultado.in_full is True
    assert resultado.motivo_falha is None
    assert resultado.dias_atraso == -11


def test_data_digitacao_nao_define_on_time():
    confirmacao = make_confirmacao(date(2026, 2, 1))
    cedo = make_pedido(
        pedido_id=1,
        data_solicitada=date(2025, 1, 1),
        contract_date=date(2026, 2, 1),
        confirmacao=confirmacao,
    )
    tarde = make_pedido(
        pedido_id=2,
        data_solicitada=date(2026, 1, 31),
        contract_date=date(2026, 2, 1),
        confirmacao=make_confirmacao(date(2026, 2, 1)),
    )

    assert avaliar_pedido(cedo).on_time is True
    assert avaliar_pedido(tarde).on_time is True


def test_falha_in_full_faturamento_parcial():
    pedido = make_pedido(
        contract_date=date(2026, 1, 31),
        itens=[make_item(100, 60, data_faturamento=date(2026, 1, 5))],
        confirmacao=make_confirmacao(date(2026, 1, 20), recebido_completo=True),
    )
    resultado = avaliar_pedido(pedido)

    assert resultado.status == STATUS_FALHA
    assert resultado.on_time is True
    assert resultado.in_full is False


def test_falha_in_full_recebido_incompleto():
    pedido = make_pedido(
        contract_date=date(2026, 1, 31),
        itens=[make_item(100, 100, data_faturamento=date(2026, 1, 5))],
        confirmacao=make_confirmacao(
            date(2026, 1, 20),
            recebido_completo=False,
            motivo_falha=MotivoFalha.AVARIA,
        ),
    )
    resultado = avaliar_pedido(pedido)

    assert resultado.status == STATUS_FALHA
    assert resultado.in_full is False
    assert resultado.motivo_falha == "avaria"


def test_falha_on_time_atraso_transporte():
    pedido = make_pedido(
        contract_date=date(2026, 3, 11),
        itens=[make_item(100, 100, data_faturamento=date(2026, 2, 1))],
        confirmacao=make_confirmacao(date(2026, 3, 20)),
    )
    resultado = avaliar_pedido(pedido)

    assert resultado.status == STATUS_FALHA
    assert resultado.on_time is False
    assert resultado.origem_atraso == "transporte"
    assert resultado.dias_atraso == 9


def test_falha_on_time_atraso_interno():
    pedido = make_pedido(
        contract_date=date(2026, 3, 11),
        itens=[make_item(100, 100, data_faturamento=date(2026, 4, 1))],
        confirmacao=make_confirmacao(date(2026, 4, 5)),
    )
    resultado = avaliar_pedido(pedido)

    assert resultado.status == STATUS_FALHA
    assert resultado.on_time is False
    assert resultado.origem_atraso == "interno"


# ---------------------------------------------------------------------------
# Motivo e casos de borda
# ---------------------------------------------------------------------------
def test_falha_sem_motivo_vira_nao_informado():
    pedido = make_pedido(
        itens=[make_item(100, 60, data_faturamento=date(2026, 1, 5))],
        confirmacao=make_confirmacao(date(2026, 1, 20)),
    )
    resultado = avaliar_pedido(pedido)

    assert resultado.status == STATUS_FALHA
    assert resultado.motivo_falha == "nao_informado"


def test_motivo_informado_e_respeitado():
    pedido = make_pedido(
        itens=[make_item(100, 60, data_faturamento=date(2026, 1, 5))],
        confirmacao=make_confirmacao(
            date(2026, 1, 20),
            recebido_completo=False,
            motivo_falha=MotivoFalha.RECUSA_CLIENTE,
        ),
    )
    assert avaliar_pedido(pedido).motivo_falha == "recusa_cliente"


def test_item_qtd_pedida_zero_nao_e_in_full():
    pedido = make_pedido(
        itens=[make_item(0, 0, data_faturamento=date(2026, 1, 5))],
        confirmacao=make_confirmacao(date(2026, 1, 20)),
    )
    resultado = avaliar_pedido(pedido)

    assert resultado.in_full is False
    assert resultado.status == STATUS_FALHA


# ---------------------------------------------------------------------------
# Agregacao
# ---------------------------------------------------------------------------
def test_agregar_percentuais_motivos_e_contract_date_ausente():
    contract_date = date(2026, 1, 31)
    faturamento = date(2026, 1, 5)
    otif1 = make_pedido(
        pedido_id=1,
        contract_date=contract_date,
        itens=[make_item(100, 100, faturamento)],
        confirmacao=make_confirmacao(date(2026, 1, 20)),
    )
    otif2 = make_pedido(
        pedido_id=2,
        contract_date=contract_date,
        itens=[make_item(50, 50, faturamento)],
        confirmacao=make_confirmacao(date(2026, 1, 21)),
    )
    falha = make_pedido(
        pedido_id=3,
        contract_date=contract_date,
        itens=[make_item(100, 40, faturamento)],
        confirmacao=make_confirmacao(date(2026, 1, 22)),
    )
    pendente = make_pedido(
        pedido_id=4,
        contract_date=date.today() + timedelta(days=10),
    )
    sem_data = make_pedido(pedido_id=5, contract_date=None)

    metricas = agregar(
        [avaliar_pedido(p) for p in (otif1, otif2, falha, pendente, sem_data)]
    )

    assert metricas["total_itens"] == 5
    assert metricas["total_avaliados"] == 3
    assert metricas["total_pendentes"] == 1
    assert metricas["total_sem_contract_date"] == 1
    assert metricas["otif_ok"] == 2
    assert metricas["falhas"] == 1
    assert metricas["otif_pct"] == 66.67
    assert metricas["on_time_pct"] == 100.0
    assert {"motivo": "nao_informado", "quantidade": 1} in metricas["motivos_falha"]


def test_agregar_vazio_nao_divide_por_zero():
    metricas = agregar([])
    assert metricas["otif_pct"] == 0.0
    assert metricas["total_avaliados"] == 0
    assert metricas["total_sem_contract_date"] == 0


# ---------------------------------------------------------------------------
# Processo
# ---------------------------------------------------------------------------
def test_processo_timeline_gargalo_e_lead_time():
    etapa = make_etapa(
        pcp_data=date(2026, 1, 3),
        producao_fim=date(2026, 1, 20),
        comercial_data=date(2026, 1, 21),
        inspecao_agendada_data=date(2026, 1, 22),
        lem_data=date(2026, 1, 22),
    )
    pedido = make_pedido(
        data_pedido=date(2026, 1, 1),
        contract_date=date(2026, 1, 31),
        faturamento_em=datetime(2026, 1, 23, 10, 30),
        embarque_em=datetime(2026, 1, 24, 8, 15),
        itens=[make_item(100, 100, date(2026, 1, 20))],
        confirmacao=make_confirmacao(date(2026, 1, 26)),
        etapa=etapa,
    )
    processo = avaliar_pedido(pedido).processo

    assert processo["concluido"] is True
    assert processo["gargalo"] == "producao"
    assert processo["lead_time_dias"] == 25


def test_processo_etapa_atual_quando_incompleto():
    etapa = make_etapa(pcp_data=date(2026, 1, 3))
    pedido = make_pedido(data_pedido=date(2026, 1, 1), etapa=etapa)
    resultado = avaliar_pedido(pedido)

    assert resultado.processo["concluido"] is False
    assert resultado.processo["etapa_atual"] == "producao"


def test_agregar_processo_encontra_gargalo():
    etapa = make_etapa(
        pcp_data=date(2026, 1, 3),
        producao_fim=date(2026, 1, 20),
        comercial_data=date(2026, 1, 21),
        inspecao_agendada_data=date(2026, 1, 22),
        lem_data=date(2026, 1, 22),
    )
    pedido = make_pedido(
        data_pedido=date(2026, 1, 1),
        faturamento_em=datetime(2026, 1, 23, 10, 30),
        embarque_em=datetime(2026, 1, 24, 8, 15),
        itens=[make_item(100, 100, date(2026, 1, 20))],
        confirmacao=make_confirmacao(date(2026, 1, 26)),
        etapa=etapa,
    )
    agregado = agregar_processo([avaliar_pedido(pedido)])

    assert agregado["total_concluido"] == 1
    assert agregado["gargalo"] == "producao"


def test_producao_concluida_avanca_para_comercial():
    hoje = date.today()
    etapa = make_etapa(
        pcp_data=hoje - timedelta(days=5),
        producao_fim=hoje - timedelta(days=2),
    )
    processo = avaliar_pedido(make_pedido(etapa=etapa)).processo

    assert processo["etapa_atual"] == "comercial"
    assert processo["inspecao_agendada_data"] is None


def test_comercial_com_agendamento_avanca_para_lem_em_espera():
    hoje = data_operacional()
    data_agendada = hoje + timedelta(days=10)
    etapa = make_etapa(
        pcp_data=hoje - timedelta(days=5),
        producao_fim=hoje - timedelta(days=2),
        comercial_data=hoje,
        inspecao_agendada_data=data_agendada,
        comercial_obs="Cliente confirmou a janela da inspeção",
    )
    processo = avaliar_pedido(make_pedido(etapa=etapa)).processo
    comercial = next(e for e in processo["etapas"] if e["chave"] == "comercial")
    lem = next(e for e in processo["etapas"] if e["chave"] == "lem")

    assert processo["etapa_atual"] == "lem"
    assert processo["lem_aguardando_inicio"] is True
    assert processo["dias_ate_inicio_lem"] == 10
    assert processo["dias_na_etapa_atual"] == 0
    assert processo["inspecao_agendada_data"] == data_agendada
    assert comercial["data"] == hoje
    assert comercial["data_agendada"] is None
    assert lem["data_agendada"] == data_agendada
    assert comercial["obs"] == "Cliente confirmou a janela da inspeção"


def test_primeira_lacuna_impede_pular_comercial():
    hoje = date.today()
    etapa = make_etapa(
        pcp_data=hoje - timedelta(days=5),
        producao_fim=hoje - timedelta(days=3),
        lem_data=hoje - timedelta(days=1),
    )
    processo = avaliar_pedido(make_pedido(etapa=etapa)).processo

    assert processo["etapa_atual"] == "comercial"
    assert processo["concluido"] is False


def test_lem_comeca_em_zero_no_dia_agendado():
    hoje = data_operacional()
    etapa = make_etapa(
        pcp_data=hoje - timedelta(days=10),
        producao_fim=hoje - timedelta(days=8),
        comercial_data=hoje - timedelta(days=7),
        inspecao_agendada_data=hoje,
    )
    processo = avaliar_pedido(make_pedido(etapa=etapa)).processo

    assert processo["etapa_atual"] == "lem"
    assert processo["lem_aguardando_inicio"] is False
    assert processo["dias_ate_inicio_lem"] is None
    assert processo["dias_na_etapa_atual"] == 0


def test_lem_conta_somente_dias_apos_agendamento():
    hoje = data_operacional()
    etapa = make_etapa(
        pcp_data=hoje - timedelta(days=15),
        producao_fim=hoje - timedelta(days=12),
        comercial_data=hoje - timedelta(days=10),
        inspecao_agendada_data=hoje - timedelta(days=3),
    )
    processo = avaliar_pedido(make_pedido(etapa=etapa)).processo

    assert processo["etapa_atual"] == "lem"
    assert processo["lem_aguardando_inicio"] is False
    assert processo["dias_na_etapa_atual"] == 3


def test_duracao_lem_concluido_usa_data_agendada():
    etapa = make_etapa(
        pcp_data=date(2026, 1, 2),
        producao_fim=date(2026, 1, 5),
        comercial_data=date(2026, 1, 6),
        inspecao_agendada_data=date(2026, 1, 20),
        lem_data=date(2026, 1, 23),
    )
    processo = avaliar_pedido(make_pedido(etapa=etapa)).processo
    lem = next(e for e in processo["etapas"] if e["chave"] == "lem")

    assert lem["dias"] == 3


def test_agendamento_antecipado_nao_conclui_producao():
    hoje = data_operacional()
    data_agendada = hoje + timedelta(days=5)
    etapa = make_etapa(
        pcp_data=hoje - timedelta(days=4),
        comercial_data=hoje,
        inspecao_agendada_data=data_agendada,
        comercial_obs="Agendado durante a produção",
    )
    processo = avaliar_pedido(make_pedido(etapa=etapa)).processo

    assert processo["etapa_atual"] == "producao"
    assert processo["inspecao_agendada_data"] == data_agendada
    assert processo["inicio_lem_data"] is None
    assert processo["lem_aguardando_inicio"] is False


def test_inicio_lem_usa_producao_quando_ela_termina_depois_da_agenda():
    hoje = data_operacional()
    data_agendada = hoje - timedelta(days=5)
    producao_fim = hoje - timedelta(days=2)
    etapa = make_etapa(
        pcp_data=hoje - timedelta(days=10),
        comercial_data=hoje - timedelta(days=8),
        inspecao_agendada_data=data_agendada,
        producao_fim=producao_fim,
    )
    processo = avaliar_pedido(make_pedido(etapa=etapa)).processo

    assert processo["etapa_atual"] == "lem"
    assert processo["inicio_lem_data"] == producao_fim
    assert processo["dias_na_etapa_atual"] == 2


def test_duracao_lem_concluido_usa_producao_se_for_mais_tardia():
    etapa = make_etapa(
        pcp_data=date(2026, 1, 2),
        comercial_data=date(2026, 1, 3),
        inspecao_agendada_data=date(2026, 1, 10),
        producao_fim=date(2026, 1, 20),
        lem_data=date(2026, 1, 23),
    )
    processo = avaliar_pedido(make_pedido(etapa=etapa)).processo
    lem = next(e for e in processo["etapas"] if e["chave"] == "lem")

    assert processo["inicio_lem_data"] == date(2026, 1, 20)
    assert lem["dias"] == 3


def test_lem_antecipado_conta_zero_dias_e_avanca_o_fluxo():
    etapa = make_etapa(
        pcp_data=date(2026, 1, 2),
        producao_fim=date(2026, 1, 10),
        comercial_data=date(2026, 1, 5),
        inspecao_agendada_data=date(2026, 1, 25),
        lem_data=date(2026, 1, 12),
    )
    processo = avaliar_pedido(make_pedido(etapa=etapa)).processo
    lem = next(e for e in processo["etapas"] if e["chave"] == "lem")

    assert processo["etapa_atual"] == "faturamento"
    assert lem["concluida"] is True
    assert lem["dias"] == 0
    assert processo["lem_aguardando_inicio"] is False


def test_lem_concluido_sem_faturamento_aguarda_erp():
    hoje = data_operacional()
    etapa = make_etapa(
        pcp_data=hoje - timedelta(days=12),
        producao_fim=hoje - timedelta(days=10),
        comercial_data=hoje - timedelta(days=9),
        inspecao_agendada_data=hoje - timedelta(days=7),
        lem_data=hoje - timedelta(days=3),
    )
    processo = avaliar_pedido(
        make_pedido(etapa=etapa, faturamento_em=None)
    ).processo

    assert processo["etapa_atual"] == "faturamento"
    assert processo["faturamento_em"] is None
    assert processo["dias_na_etapa_atual"] == 3


def test_faturamento_com_data_hora_inicia_estoque():
    faturamento_em = datetime(2026, 1, 23, 14, 35, 19)
    etapa = make_etapa(
        pcp_data=date(2026, 1, 2),
        producao_fim=date(2026, 1, 10),
        comercial_data=date(2026, 1, 11),
        inspecao_agendada_data=date(2026, 1, 20),
        lem_data=date(2026, 1, 22),
    )
    resultado = avaliar_pedido(
        make_pedido(etapa=etapa, faturamento_em=faturamento_em)
    )
    processo = resultado.processo
    faturamento = next(
        etapa_timeline
        for etapa_timeline in processo["etapas"]
        if etapa_timeline["chave"] == "faturamento"
    )

    assert processo["etapa_atual"] == "estoque"
    assert processo["faturamento_em"] == faturamento_em
    assert faturamento["data"] == date(2026, 1, 23)
    assert faturamento["data_hora"] == faturamento_em
    assert faturamento["dias"] == 1
    assert resultado.faturamento_em == faturamento_em
    assert resultado.data_faturamento == date(2026, 1, 23)


def test_embarque_com_data_hora_conclui_estoque_e_expedicao():
    """Expedicao e automatica: acontece junto com o Embarque do ERP, sem
    exigir confirmacao manual separada. O Estoque e o periodo de espera entre
    Faturamento e Embarque; a Expedicao e o proprio marco do Embarque.
    """
    faturamento_em = datetime(2026, 1, 23, 14, 35, 19)
    embarque_em = datetime(2026, 1, 25, 9, 10, 5)
    etapa = make_etapa(
        pcp_data=date(2026, 1, 2),
        producao_fim=date(2026, 1, 10),
        comercial_data=date(2026, 1, 11),
        inspecao_agendada_data=date(2026, 1, 20),
        lem_data=date(2026, 1, 22),
    )
    resultado = avaliar_pedido(
        make_pedido(
            etapa=etapa,
            faturamento_em=faturamento_em,
            embarque_em=embarque_em,
        )
    )
    processo = resultado.processo
    estoque = next(
        etapa_timeline
        for etapa_timeline in processo["etapas"]
        if etapa_timeline["chave"] == "estoque"
    )
    expedicao = next(
        etapa_timeline
        for etapa_timeline in processo["etapas"]
        if etapa_timeline["chave"] == "expedicao"
    )

    # Faturamento, Estoque e Expedicao ja concluidos automaticamente pelo ERP;
    # falta apenas a Entrega, confirmada manualmente.
    assert processo["etapa_atual"] == "entrega"
    assert processo["embarque_em"] == embarque_em

    assert estoque["data"] == date(2026, 1, 25)
    assert estoque["data_hora"] == embarque_em
    assert estoque["dias"] == 2

    assert expedicao["concluida"] is True
    assert expedicao["data"] == date(2026, 1, 25)
    assert expedicao["data_hora"] == embarque_em
    assert expedicao["dias"] == 0

    assert resultado.embarque_em == embarque_em
