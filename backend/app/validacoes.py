"""Validacoes puras dos inputs manuais da operacao."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone


# Data operacional da empresa (horario de Brasilia, atualmente UTC-03).
# Usar um relogio unico evita que navegador e servidor discordem na virada do dia.
_FUSO_NEGOCIO = timezone(timedelta(hours=-3))


class ValidacaoError(ValueError):
    """Erro de regra de negocio convertido em HTTP 422 pelos routers."""


def data_operacional() -> date:
    return datetime.now(_FUSO_NEGOCIO).date()


def _hoje(hoje: date | None) -> date:
    return hoje if hoje is not None else data_operacional()


def validar_negativa_producao(
    *,
    motivo: str,
    data_prevista: date,
    hoje: date | None = None,
) -> str:
    """Valida a recusa do PCP e devolve o motivo normalizado."""
    motivo_normalizado = motivo.strip()
    if not motivo_normalizado:
        raise ValidacaoError("O motivo da negativa de Producao e obrigatorio.")
    hoje = _hoje(hoje)
    if data_prevista < hoje:
        raise ValidacaoError(
            f"A data prevista ({data_prevista}) nao pode ser anterior a data "
            f"operacional ({hoje})."
        )
    return motivo_normalizado


def validar_confirmacao(
    *,
    data_entrega_real: date,
    data_pedido: date | None,
    hoje: date | None = None,
) -> None:
    """Impede entrega futura ou anterior ao pedido."""
    hoje = _hoje(hoje)
    if data_entrega_real > hoje:
        raise ValidacaoError(
            f"A data de entrega ({data_entrega_real}) nao pode estar no futuro."
        )
    if data_pedido is not None and data_entrega_real < data_pedido:
        raise ValidacaoError(
            f"A data de entrega ({data_entrega_real}) nao pode ser anterior a "
            f"data do pedido ({data_pedido})."
        )


# Datas reais que continuam sequenciais. O Comercial pode agendar em paralelo,
# inclusive antes de PCP/Producao; por isso nao pertence a esta lista.
# Expedicao nao entra aqui: e automatica e igual ao Embarque do ERP.
_SEQUENCIA_ETAPAS: list[tuple[str, str]] = [
    ("pcp_data", "PCP"),
    ("producao_fim", "Producao"),
    ("lem_data", "Inspecao LEM"),
]

_ROTULOS_ETAPA: dict[str, str] = {
    "pcp_data": "PCP",
    "producao_plan_inicio": "inicio planejado da producao",
    "producao_plan_fim": "fim planejado da producao",
    "producao_fim": "fim da producao",
    "comercial_data": "conclusao do Comercial",
    "inspecao_agendada_data": "agendamento da inspecao",
    "lem_data": "Inspecao LEM",
    "faturamento_data": "Faturamento",
    "embarque_data": "Embarque",
}


def validar_etapas(
    *,
    data_pedido: date | None,
    pcp_data: date | None = None,
    producao_plan_inicio: date | None = None,
    producao_plan_fim: date | None = None,
    producao_fim: date | None = None,
    comercial_data: date | None = None,
    inspecao_agendada_data: date | None = None,
    lem_data: date | None = None,
    faturamento_data: date | None = None,
    embarque_data: date | None = None,
    hoje: date | None = None,
) -> None:
    """Valida a sequencia real e o compromisso criado pelo Comercial.

    A data agendada pode estar no futuro e o Comercial pode registrá-la antes
    do fim da Producao. Todas as demais datas representam fatos concluidos e
    nao podem estar no futuro. O LEM exige agenda e Producao concluida, mas a
    inspecao pode acontecer antes ou depois da data agendada.
    """
    hoje = _hoje(hoje)

    campos = {
        "pcp_data": pcp_data,
        "producao_plan_inicio": producao_plan_inicio,
        "producao_plan_fim": producao_plan_fim,
        "producao_fim": producao_fim,
        "comercial_data": comercial_data,
        "lem_data": lem_data,
        "faturamento_data": faturamento_data,
        "embarque_data": embarque_data,
    }
    etapas_reais = {
        "pcp_data": pcp_data,
        "producao_fim": producao_fim,
        "lem_data": lem_data,
    }

    # Datas realizadas/planejadas existentes mantem a regra atual de nao futuro.
    # O agendamento da inspecao e deliberadamente tratado fora deste laco.
    for campo, valor in campos.items():
        if valor is None:
            continue
        rotulo = _ROTULOS_ETAPA[campo]
        if valor > hoje:
            raise ValidacaoError(
                f"A data de {rotulo} ({valor}) nao pode estar no futuro."
            )
        if data_pedido is not None and valor < data_pedido:
            raise ValidacaoError(
                f"A data de {rotulo} ({valor}) nao pode ser anterior a data do "
                f"pedido ({data_pedido})."
            )

    if (
        producao_plan_inicio is not None
        and producao_plan_fim is not None
        and producao_plan_fim < producao_plan_inicio
    ):
        raise ValidacaoError(
            f"O fim planejado da producao ({producao_plan_fim}) nao pode ser "
            f"anterior ao inicio planejado ({producao_plan_inicio})."
        )

    if (comercial_data is None) != (inspecao_agendada_data is None):
        raise ValidacaoError(
            "A conclusao do Comercial e a data agendada da inspecao devem ser "
            "informadas juntas."
        )

    if inspecao_agendada_data is not None:
        if data_pedido is not None and inspecao_agendada_data < data_pedido:
            raise ValidacaoError(
                f"A data de agendamento da inspecao ({inspecao_agendada_data}) "
                f"nao pode ser anterior a data do pedido ({data_pedido})."
            )
        if comercial_data is not None and inspecao_agendada_data < comercial_data:
            raise ValidacaoError(
                f"A data agendada da inspecao ({inspecao_agendada_data}) nao "
                f"pode ser anterior a conclusao do Comercial ({comercial_data})."
            )

    if lem_data is not None:
        if inspecao_agendada_data is None:
            raise ValidacaoError(
                "Agende a inspecao pelo Comercial antes de concluir o LEM."
            )
        if producao_fim is None:
            raise ValidacaoError(
                "Conclua a Producao antes de concluir o LEM."
            )
        # A inspecao pode ser antecipada em relacao a data agendada, mas nao
        # pode acontecer antes do fim da Producao.
        if lem_data < producao_fim:
            raise ValidacaoError(
                f"A data da Inspecao LEM ({lem_data}) nao pode ser anterior ao "
                f"fim da Producao ({producao_fim})."
            )

    if embarque_data is not None:
        if faturamento_data is None:
            raise ValidacaoError(
                "O Embarque do ERP nao pode existir sem Faturamento."
            )
        if embarque_data < faturamento_data:
            raise ValidacaoError(
                f"A data do Embarque ({embarque_data}) nao pode ser anterior "
                f"ao Faturamento ({faturamento_data})."
            )

    # PCP, Producao e LEM continuam sequenciais. O Comercial pode aparecer
    # preenchido antes de qualquer uma delas. Expedicao nao entra aqui: e
    # automatica e igual ao Embarque do ERP.
    primeira_pendente: tuple[str, str] | None = None
    for campo, rotulo in _SEQUENCIA_ETAPAS:
        valor = etapas_reais[campo]
        if valor is None and primeira_pendente is None:
            primeira_pendente = (campo, rotulo)
        elif valor is not None and primeira_pendente is not None:
            raise ValidacaoError(
                f"Preencha {primeira_pendente[1]} antes de registrar {rotulo}."
            )

    presentes = [
        (rotulo, etapas_reais[campo])
        for campo, rotulo in _SEQUENCIA_ETAPAS
        if etapas_reais[campo] is not None
    ]
    for (rotulo_ant, data_ant), (rotulo_pos, data_pos) in zip(
        presentes, presentes[1:]
    ):
        if data_pos < data_ant:
            raise ValidacaoError(
                f"A data de {rotulo_pos} ({data_pos}) nao pode ser anterior a de "
                f"{rotulo_ant} ({data_ant})."
            )
