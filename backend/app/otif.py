"""Nucleo de calculo do OTIF.

Regras (acordadas com o time):
- On Time: data de entrega real (manual) <= data solicitada + prazo (SLA).
  A data solicitada e o momento da digitacao do pedido; o prazo padrao e 60 dias.
- In Full: quantidade faturada (ERP) >= quantidade pedida (ERP).
- OTIF: On Time E In Full, avaliado por ITEM de pedido e depois agregado.

Enquanto nao ha confirmacao de entrega, o item fica com status PENDENTE
(nao entra como sucesso nem como falha nas taxas de OTIF fechado).

Atribuicao de atraso (usa a data de faturamento como proxy da expedicao):
- Se faturou depois do prazo do cliente  -> atraso INTERNO (estoque/producao/faturamento).
- Se faturou no prazo mas entregou atrasado -> atraso de TRANSPORTE.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from .models import ItemPedido, MotivoFalha

STATUS_PENDENTE = "pendente"
STATUS_OTIF = "otif"
STATUS_FALHA = "falha"


@dataclass
class ResultadoItem:
    item_id: int
    pedido_numero: str
    cliente: str
    sku: str
    descricao: str
    data_solicitada: date
    data_faturamento: date | None
    data_entrega_real: date | None
    qtd_pedida: float
    qtd_faturada: float
    status: str            # pendente | otif | falha
    on_time: bool | None
    in_full: bool | None
    dias_atraso: int | None
    origem_atraso: str | None   # interno | transporte | None
    motivo_falha: str | None
    prazo_entrega: date         # data limite = data_solicitada + SLA
    dias_restantes: int | None  # so p/ pendentes: dias ate o prazo (negativo = vencido)
    situacao_prazo: str | None  # so p/ pendentes: no_prazo | atencao | vencido
    confirmacao: dict | None = None  # dados da confirmacao manual (None se pendente)


# Situacoes do prazo (para itens ainda nao entregues).
SIT_NO_PRAZO = "no_prazo"
SIT_ATENCAO = "atencao"
SIT_VENCIDO = "vencido"


def avaliar_item(item: ItemPedido, prazo_dias: int = 0, dias_alerta: int = 7) -> ResultadoItem:
    conf = item.confirmacao
    qtd_pedida = float(item.qtd_pedida or 0)
    qtd_faturada = float(item.qtd_faturada or 0)

    # In Full independe da confirmacao manual: vem do ERP.
    in_full = qtd_faturada >= qtd_pedida and qtd_pedida > 0

    # Prazo = data solicitada (digitacao) + SLA em dias. Vale p/ pendente e entregue.
    prazo = item.pedido.data_solicitada_cliente + timedelta(days=prazo_dias)

    base = dict(
        item_id=item.id,
        pedido_numero=item.pedido.numero,
        cliente=item.pedido.cliente,
        sku=item.sku,
        descricao=item.descricao,
        data_solicitada=item.pedido.data_solicitada_cliente,
        data_faturamento=item.data_faturamento,
        qtd_pedida=qtd_pedida,
        qtd_faturada=qtd_faturada,
        prazo_entrega=prazo,
    )

    # Sem confirmacao de entrega ainda -> pendente: mostra a contagem regressiva.
    if conf is None:
        dias_restantes = (prazo - date.today()).days
        if dias_restantes < 0:
            situacao = SIT_VENCIDO
        elif dias_restantes <= dias_alerta:
            situacao = SIT_ATENCAO
        else:
            situacao = SIT_NO_PRAZO
        return ResultadoItem(
            **base,
            data_entrega_real=None,
            status=STATUS_PENDENTE,
            on_time=None,
            in_full=in_full,
            dias_atraso=None,
            origem_atraso=None,
            motivo_falha=None,
            dias_restantes=dias_restantes,
            situacao_prazo=situacao,
        )

    entrega = conf.data_entrega_real
    on_time = entrega <= prazo
    dias_atraso = (entrega - prazo).days  # negativo = dentro do prazo

    # In Full tambem considera a marcacao manual de "recebido completo"
    # (cobre avaria/devolucao que a nota nao reflete).
    in_full_final = in_full and conf.recebido_completo

    origem_atraso: str | None = None
    if not on_time:
        if item.data_faturamento and item.data_faturamento > prazo:
            origem_atraso = "interno"
        else:
            origem_atraso = "transporte"

    is_otif = on_time and in_full_final
    status = STATUS_OTIF if is_otif else STATUS_FALHA

    # Motivo: usa o informado manualmente; se falhou e nao informaram, infere um padrao.
    motivo = conf.motivo_falha.value if conf.motivo_falha else None
    if status == STATUS_FALHA and motivo is None:
        if not in_full_final:
            motivo = MotivoFalha.FALTA_ESTOQUE.value
        elif origem_atraso == "interno":
            motivo = MotivoFalha.ATRASO_FATURAMENTO.value
        elif origem_atraso == "transporte":
            motivo = MotivoFalha.ATRASO_TRANSPORTE.value
        else:
            motivo = MotivoFalha.OUTRO.value

    return ResultadoItem(
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
        confirmacao={
            "data_entrega_real": conf.data_entrega_real,
            "recebido_completo": conf.recebido_completo,
            "motivo_falha": conf.motivo_falha.value if conf.motivo_falha else None,
            "observacao": conf.observacao,
            "usuario": conf.usuario,
            "criado_em": conf.criado_em,
        },
    )


def _pct(parte: int, total: int) -> float:
    return round(100.0 * parte / total, 2) if total else 0.0


def agregar(resultados: list[ResultadoItem]) -> dict:
    """Consolida uma lista de resultados de item nas metricas do dashboard."""
    fechados = [r for r in resultados if r.status != STATUS_PENDENTE]
    total_fechados = len(fechados)

    on_time_ok = sum(1 for r in fechados if r.on_time)
    in_full_ok = sum(1 for r in fechados if r.in_full)
    otif_ok = sum(1 for r in fechados if r.status == STATUS_OTIF)

    # Quebra por motivo de falha.
    motivos: dict[str, int] = {}
    for r in fechados:
        if r.status == STATUS_FALHA and r.motivo_falha:
            motivos[r.motivo_falha] = motivos.get(r.motivo_falha, 0) + 1

    # Risco dos pendentes segundo a contagem regressiva do prazo.
    pendentes = [r for r in resultados if r.status == STATUS_PENDENTE]
    pend_no_prazo = sum(1 for r in pendentes if r.situacao_prazo == SIT_NO_PRAZO)
    pend_atencao = sum(1 for r in pendentes if r.situacao_prazo == SIT_ATENCAO)
    pend_vencidos = sum(1 for r in pendentes if r.situacao_prazo == SIT_VENCIDO)

    return {
        "total_itens": len(resultados),
        "total_avaliados": total_fechados,
        "total_pendentes": len(pendentes),
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
