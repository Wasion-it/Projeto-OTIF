"""Nucleo de calculo do OTIF, avaliado por pedido.

Regras:
- A unidade do OTIF e o pedido; uma entrega vale para todos os seus itens.
- On Time: data de entrega real <= Contract Date informado no pedido do JUND.
- In Full: todos os itens faturados completos e confirmados como recebidos.
- OTIF: On Time e In Full.
- A data de digitacao nunca e usada para fabricar um prazo.

Sem confirmacao, um pedido com Contract Date fica pendente. Sem Contract Date,
o estado e ``sem_contract_date`` e o pedido nao entra como sucesso, falha ou no
denominador das taxas ate o cadastro ser corrigido no JUND.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from .models import MotivoFalha, Pedido
from .validacoes import data_operacional

STATUS_SEM_CONTRACT_DATE = "sem_contract_date"
STATUS_PENDENTE = "pendente"
STATUS_OTIF = "otif"
STATUS_FALHA = "falha"

ETAPAS_PROCESSO: list[tuple[str, str]] = [
    ("pedido", "Pedido"),
    ("pcp", "PCP / Planejamento"),
    ("producao", "Produção"),
    ("comercial", "Comercial / Agendamento"),
    ("lem", "Inspeção LEM"),
    ("faturamento", "Faturamento"),
    ("estoque", "Estoque"),
    ("expedicao", "Expedição"),
    ("entrega", "Entrega"),
]
NOMES_ETAPAS = dict(ETAPAS_PROCESSO)
ETAPA_CONCLUIDO = "concluido"

SIT_NO_PRAZO = "no_prazo"
SIT_ATENCAO = "atencao"
SIT_VENCIDO = "vencido"


@dataclass
class ResultadoPedido:
    pedido_id: int
    erp_id: int | None
    numero: str
    numero_interno: str | None
    cliente: str
    data_solicitada: date
    data_faturamento: date | None
    faturamento_em: datetime | None
    embarque_em: datetime | None
    nota_fiscal_numero: str | None
    nota_fiscal_serie: str | None
    data_entrega_real: date | None
    qtd_itens: int
    qtd_pedida_total: float
    qtd_faturada_total: float
    status: str
    on_time: bool | None
    in_full: bool | None
    dias_atraso: int | None
    origem_atraso: str | None
    motivo_falha: str | None
    contract_date: date | None
    # Alias temporario para preservar o contrato antigo da API.
    prazo_entrega: date | None
    dias_restantes: int | None
    situacao_prazo: str | None
    itens: list[dict] = field(default_factory=list)
    processo: dict | None = None
    confirmacao: dict | None = None


def _confirmacao_resumo(conf) -> dict | None:
    if conf is None:
        return None
    return {
        "data_entrega_real": conf.data_entrega_real,
        "recebido_completo": conf.recebido_completo,
        "motivo_falha": conf.motivo_falha.value if conf.motivo_falha else None,
        "observacao": conf.observacao,
        "usuario": conf.usuario,
        "criado_em": conf.criado_em,
    }


def avaliar_processo(pedido: Pedido, conf) -> dict:
    """Monta a linha do tempo sequencial e identifica o gargalo.

    A etapa atual e sempre a primeira lacuna do fluxo. Isso impede que uma data
    posterior preenchida por engano pule Comercial ou qualquer etapa anterior.
    O agendamento Comercial pode acontecer antes da Producao. O marco zero da
    contagem do LEM e a data mais tardia entre o agendamento e o fim real da
    Producao; toda espera anterior fica fora dos dias no LEM e do gargalo. A
    inspecao pode ser registrada antes desse marco (antecipada): nesse caso o
    LEM conta 0 dias. `lem_aguardando_inicio` apenas informa que a data
    agendada ainda nao chegou; nao bloqueia o registro.
    """
    etapa = pedido.etapa
    hoje = data_operacional()
    faturamento_em = pedido.faturamento_em
    faturamento_data = faturamento_em.date() if faturamento_em else None
    embarque_em = pedido.embarque_em
    embarque_data = embarque_em.date() if embarque_em else None

    datas: dict[str, date | None] = {
        "pedido": pedido.data_pedido,
        "pcp": etapa.pcp_data if etapa else None,
        "producao": etapa.producao_fim if etapa else None,
        "comercial": etapa.comercial_data if etapa else None,
        "lem": etapa.lem_data if etapa else None,
        "faturamento": faturamento_data,
        # "Estoque" nao e um evento; e o tempo parado entre Faturamento e
        # Embarque. Sua "data" e a do Embarque para fechar a duracao do
        # periodo, mas quem representa o marco de Expedicao e essa mesma data.
        "estoque": embarque_data,
        "expedicao": embarque_data,
        "entrega": conf.data_entrega_real if conf else None,
    }
    observacoes: dict[str, str | None] = {
        "pedido": None,
        "pcp": etapa.pcp_obs if etapa else None,
        "producao": etapa.producao_obs if etapa else None,
        "comercial": etapa.comercial_obs if etapa else None,
        "lem": etapa.lem_obs if etapa else None,
        "faturamento": None,
        "estoque": None,
        "expedicao": None,
        "entrega": conf.observacao if conf else None,
    }
    inspecao_agendada = etapa.inspecao_agendada_data if etapa else None
    producao_fim = etapa.producao_fim if etapa else None
    inicio_lem = (
        max(inspecao_agendada, producao_fim)
        if inspecao_agendada is not None and producao_fim is not None
        else None
    )
    negativas = sorted(
        list(pedido.negativas_producao),
        key=lambda negativa: (
            negativa.criado_em or datetime.min,
            negativa.id or 0,
        ),
        reverse=True,
    )
    negativas_detalhe = [
        {
            "id": negativa.id,
            "pedido_id": negativa.pedido_id or pedido.id,
            "motivo": negativa.motivo,
            "data_prevista": negativa.data_prevista,
            "usuario": negativa.usuario,
            "criado_em": negativa.criado_em,
            "resolvida_em": negativa.resolvida_em,
            "resolvida_por": negativa.resolvida_por,
        }
        for negativa in negativas
    ]

    timeline: list[dict] = []
    primeira_pendente_idx: int | None = None
    gargalo_chave: str | None = None
    gargalo_dias = -1
    prev_data: date | None = None
    fluxo_contiguo = True

    for idx, (chave, nome) in enumerate(ETAPAS_PROCESSO):
        data_etapa = datas[chave]
        concluida = data_etapa is not None
        if not concluida:
            fluxo_contiguo = False
            if primeira_pendente_idx is None:
                primeira_pendente_idx = idx

        base_duracao = inicio_lem if chave == "lem" else prev_data
        dias = (
            max(0, (data_etapa - base_duracao).days)
            if concluida and fluxo_contiguo and base_duracao is not None
            else None
        )
        if dias is not None and dias > gargalo_dias:
            gargalo_dias = dias
            gargalo_chave = chave

        timeline.append(
            {
                "chave": chave,
                "nome": nome,
                "data": data_etapa,
                "data_hora": (
                    faturamento_em
                    if chave == "faturamento"
                    else embarque_em if chave in ("estoque", "expedicao") else None
                ),
                "concluida": concluida,
                "dias": dias,
                "obs": observacoes[chave],
                "data_agendada": inspecao_agendada if chave == "lem" else None,
            }
        )
        prev_data = data_etapa

    concluido = primeira_pendente_idx is None
    lem_aguardando_inicio = False
    dias_ate_inicio_lem: int | None = None
    if concluido:
        etapa_atual_chave = ETAPA_CONCLUIDO
        etapa_atual_nome = "Concluído"
        dias_na_etapa_atual = None
    else:
        etapa_atual_chave = ETAPAS_PROCESSO[primeira_pendente_idx][0]
        etapa_atual_nome = NOMES_ETAPAS[etapa_atual_chave]

        if etapa_atual_chave == "lem" and inicio_lem is not None:
            lem_aguardando_inicio = hoje < inicio_lem
            dias_ate_inicio_lem = (
                (inicio_lem - hoje).days if lem_aguardando_inicio else None
            )
            dias_na_etapa_atual = max(0, (hoje - inicio_lem).days)
        else:
            data_anterior = (
                datas[ETAPAS_PROCESSO[primeira_pendente_idx - 1][0]]
                if primeira_pendente_idx > 0
                else None
            )
            dias_na_etapa_atual = (
                max(0, (hoje - data_anterior).days) if data_anterior else None
            )

    lead_time = None
    if datas["entrega"] and datas["pedido"]:
        lead_time = (datas["entrega"] - datas["pedido"]).days

    return {
        "etapa_atual": etapa_atual_chave,
        "etapa_atual_nome": etapa_atual_nome,
        "concluido": concluido,
        "data_operacional": hoje,
        "dias_na_etapa_atual": dias_na_etapa_atual,
        "lem_aguardando_inicio": lem_aguardando_inicio,
        "dias_ate_inicio_lem": dias_ate_inicio_lem,
        "gargalo": gargalo_chave,
        "lead_time_dias": lead_time,
        "etapas": timeline,
        "negativas_producao": negativas_detalhe,
        "negativas_abertas": sum(
            1 for negativa in negativas if negativa.resolvida_em is None
        ),
        "pcp_data": etapa.pcp_data if etapa else None,
        "producao_plan_inicio": etapa.producao_plan_inicio if etapa else None,
        "producao_plan_fim": etapa.producao_plan_fim if etapa else None,
        "producao_fim": etapa.producao_fim if etapa else None,
        "comercial_data": etapa.comercial_data if etapa else None,
        "inspecao_agendada_data": inspecao_agendada,
        "inicio_lem_data": inicio_lem,
        "lem_data": etapa.lem_data if etapa else None,
        "faturamento_em": faturamento_em,
        "embarque_em": embarque_em,
        "expedicao_data": embarque_data,
        "pcp_obs": etapa.pcp_obs if etapa else None,
        "producao_obs": etapa.producao_obs if etapa else None,
        "comercial_obs": etapa.comercial_obs if etapa else None,
        "lem_obs": etapa.lem_obs if etapa else None,
        "expedicao_obs": None,
        "observacao": etapa.observacao if etapa else None,
        "usuario": etapa.usuario if etapa else None,
        "atualizado_em": etapa.atualizado_em if etapa else None,
    }


def avaliar_pedido(pedido: Pedido, dias_alerta: int = 7) -> ResultadoPedido:
    """Avalia um pedido usando exclusivamente seu Contract Date."""
    conf = pedido.confirmacao
    itens = list(pedido.itens)

    qtd_pedida_total = sum(float(i.qtd_pedida or 0) for i in itens)
    qtd_faturada_total = sum(float(i.qtd_faturada or 0) for i in itens)
    faturas = [i.data_faturamento for i in itens if i.data_faturamento]
    faturamento_em = pedido.faturamento_em
    embarque_em = pedido.embarque_em
    data_faturamento = (
        faturamento_em.date()
        if faturamento_em is not None
        else (max(faturas) if faturas else None)
    )

    itens_detalhe: list[dict] = []
    todos_full = bool(itens)
    for i in itens:
        qp = float(i.qtd_pedida or 0)
        qf = float(i.qtd_faturada or 0)
        item_full = qf >= qp and qp > 0
        if not item_full:
            todos_full = False
        itens_detalhe.append(
            {
                "item_numero": i.item_numero,
                "sku": i.sku,
                "descricao": i.descricao,
                "qtd_pedida": qp,
                "qtd_faturada": qf,
                "data_faturamento": i.data_faturamento,
                "in_full": item_full,
            }
        )

    in_full_erp = todos_full
    contract_date = pedido.contract_date
    confirmacao = _confirmacao_resumo(conf)

    base = dict(
        pedido_id=pedido.id,
        erp_id=pedido.erp_id,
        numero=pedido.numero,
        numero_interno=pedido.numero_interno,
        cliente=pedido.cliente,
        data_solicitada=pedido.data_solicitada_cliente,
        data_faturamento=data_faturamento,
        faturamento_em=faturamento_em,
        embarque_em=embarque_em,
        nota_fiscal_numero=pedido.nota_fiscal_numero,
        nota_fiscal_serie=pedido.nota_fiscal_serie,
        qtd_itens=len(itens),
        qtd_pedida_total=qtd_pedida_total,
        qtd_faturada_total=qtd_faturada_total,
        contract_date=contract_date,
        prazo_entrega=contract_date,
        itens=itens_detalhe,
        processo=avaliar_processo(pedido, conf),
        confirmacao=confirmacao,
    )

    # Sem data oficial nao existe base para avaliar On Time ou atraso. Mesmo que
    # ja haja confirmacao, o pedido fica fora das taxas ate o JUND ser corrigido.
    if contract_date is None:
        in_full = in_full_erp and conf.recebido_completo if conf else in_full_erp
        motivo = (
            conf.motivo_falha.value if conf is not None and conf.motivo_falha else None
        )
        return ResultadoPedido(
            **base,
            data_entrega_real=conf.data_entrega_real if conf else None,
            status=STATUS_SEM_CONTRACT_DATE,
            on_time=None,
            in_full=in_full,
            dias_atraso=None,
            origem_atraso=None,
            motivo_falha=motivo,
            dias_restantes=None,
            situacao_prazo=None,
        )

    if conf is None:
        dias_restantes = (contract_date - data_operacional()).days
        if dias_restantes < 0:
            situacao = SIT_VENCIDO
        elif dias_restantes <= dias_alerta:
            situacao = SIT_ATENCAO
        else:
            situacao = SIT_NO_PRAZO
        return ResultadoPedido(
            **base,
            data_entrega_real=None,
            status=STATUS_PENDENTE,
            on_time=None,
            in_full=in_full_erp,
            dias_atraso=None,
            origem_atraso=None,
            motivo_falha=None,
            dias_restantes=dias_restantes,
            situacao_prazo=situacao,
        )

    entrega = conf.data_entrega_real
    on_time = entrega <= contract_date
    dias_atraso = (entrega - contract_date).days
    in_full_final = in_full_erp and conf.recebido_completo

    origem_atraso: str | None = None
    if not on_time:
        # Embarque e a fronteira real entre atraso interno e transporte. Enquanto
        # o JUND nao o informar, preserva o fallback historico do faturamento.
        marco_saida = embarque_em.date() if embarque_em else data_faturamento
        if marco_saida and marco_saida > contract_date:
            origem_atraso = "interno"
        else:
            origem_atraso = "transporte"

    status = STATUS_OTIF if on_time and in_full_final else STATUS_FALHA
    motivo = conf.motivo_falha.value if conf.motivo_falha else None
    if status == STATUS_FALHA and motivo is None:
        motivo = MotivoFalha.NAO_INFORMADO.value

    return ResultadoPedido(
        **base,
        data_entrega_real=entrega,
        status=status,
        on_time=on_time,
        in_full=in_full_final,
        dias_atraso=dias_atraso,
        origem_atraso=origem_atraso,
        motivo_falha=motivo,
        dias_restantes=None,
        situacao_prazo=None,
    )


def _pct(parte: int, total: int) -> float:
    return round(100.0 * parte / total, 2) if total else 0.0


def agregar(resultados: list[ResultadoPedido]) -> dict:
    """Consolida resultados sem incluir Contract Date ausente nas taxas."""
    fechados = [r for r in resultados if r.status in {STATUS_OTIF, STATUS_FALHA}]
    pendentes = [r for r in resultados if r.status == STATUS_PENDENTE]
    sem_contract_date = [
        r for r in resultados if r.status == STATUS_SEM_CONTRACT_DATE
    ]
    total_fechados = len(fechados)

    on_time_ok = sum(1 for r in fechados if r.on_time)
    in_full_ok = sum(1 for r in fechados if r.in_full)
    otif_ok = sum(1 for r in fechados if r.status == STATUS_OTIF)

    motivos: dict[str, int] = {}
    for r in fechados:
        if r.status == STATUS_FALHA and r.motivo_falha:
            motivos[r.motivo_falha] = motivos.get(r.motivo_falha, 0) + 1

    pend_no_prazo = sum(1 for r in pendentes if r.situacao_prazo == SIT_NO_PRAZO)
    pend_atencao = sum(1 for r in pendentes if r.situacao_prazo == SIT_ATENCAO)
    pend_vencidos = sum(1 for r in pendentes if r.situacao_prazo == SIT_VENCIDO)

    return {
        "total_itens": len(resultados),
        "total_avaliados": total_fechados,
        "total_pendentes": len(pendentes),
        "total_sem_contract_date": len(sem_contract_date),
        "otif_pct": _pct(otif_ok, total_fechados),
        "on_time_pct": _pct(on_time_ok, total_fechados),
        "in_full_pct": _pct(in_full_ok, total_fechados),
        "otif_ok": otif_ok,
        "falhas": total_fechados - otif_ok,
        "motivos_falha": [
            {"motivo": k, "quantidade": v}
            for k, v in sorted(motivos.items(), key=lambda x: x[1], reverse=True)
        ],
        "pendentes_no_prazo": pend_no_prazo,
        "pendentes_atencao": pend_atencao,
        "pendentes_vencidos": pend_vencidos,
    }


def agregar_por_cliente(resultados: list[ResultadoPedido]) -> list[dict]:
    """Consolida OTIF por cliente, do pior resultado para o melhor."""
    grupos: dict[str, list[ResultadoPedido]] = {}
    for r in resultados:
        grupos.setdefault(r.cliente, []).append(r)

    saida: list[dict] = []
    for cliente, rs in grupos.items():
        m = agregar(rs)
        saida.append(
            {
                "cliente": cliente,
                "total_pedidos": len(rs),
                "total_avaliados": m["total_avaliados"],
                "total_pendentes": m["total_pendentes"],
                "total_sem_contract_date": m["total_sem_contract_date"],
                "otif_ok": m["otif_ok"],
                "falhas": m["falhas"],
                "otif_pct": m["otif_pct"],
                "on_time_pct": m["on_time_pct"],
                "in_full_pct": m["in_full_pct"],
            }
        )

    saida.sort(
        key=lambda x: (
            x["total_avaliados"] == 0,
            x["otif_pct"],
            -x["total_avaliados"],
        )
    )
    return saida


def agregar_processo(resultados: list[ResultadoPedido]) -> dict:
    """Consolida as etapas de todos os pedidos para identificar o gargalo."""
    contagem_atual: dict[str, int] = {}
    soma_dias: dict[str, int] = {}
    qtd_dias: dict[str, int] = {}
    total_em_processo = 0
    total_concluido = 0

    for r in resultados:
        proc = r.processo
        if not proc:
            continue
        if proc["concluido"]:
            total_concluido += 1
        else:
            total_em_processo += 1
            atual = proc["etapa_atual"]
            contagem_atual[atual] = contagem_atual.get(atual, 0) + 1
        for et in proc["etapas"]:
            if et["dias"] is not None:
                soma_dias[et["chave"]] = soma_dias.get(et["chave"], 0) + et["dias"]
                qtd_dias[et["chave"]] = qtd_dias.get(et["chave"], 0) + 1

    etapas_out: list[dict] = []
    gargalo: str | None = None
    gargalo_media = -1.0
    for chave, nome in ETAPAS_PROCESSO:
        q = qtd_dias.get(chave, 0)
        media = round(soma_dias[chave] / q, 1) if q else None
        if chave != "pedido" and media is not None and media > gargalo_media:
            gargalo_media = media
            gargalo = chave
        etapas_out.append(
            {
                "chave": chave,
                "nome": nome,
                "em_andamento": contagem_atual.get(chave, 0),
                "concluidas": q,
                "dias_medio": media,
            }
        )

    return {
        "total_em_processo": total_em_processo,
        "total_concluido": total_concluido,
        "gargalo": gargalo,
        "etapas": etapas_out,
    }
