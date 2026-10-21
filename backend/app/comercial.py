"""Visao Comercial: pedido do JUND com seus itens e indicadores de prazo.

Funcoes puras (sem acesso a banco) para montar, filtrar e ordenar as linhas da
tela Comercial. Tudo vem do JUND/jigadb, somente leitura. Nao altera nem
alimenta o calculo de OTIF, que continua sendo por pedido (ver otif.py).

Aceita pedidos/itens tanto da leitura direta do JUND (SimpleNamespace, com os
campos extras da tela) quanto do snapshot ORM, onde os campos extras nao
existem e aparecem como vazios.
"""
from __future__ import annotations

import statistics
from datetime import date, datetime

from .otif import ResultadoPedido

STATUS_ENTREGUE = "entregue"
STATUS_FATURADO = "faturado"
STATUS_PARCIAL = "parcial"
STATUS_EM_PROGRAMACAO = "em_programacao"

STATUS_VALIDOS = frozenset(
    {STATUS_ENTREGUE, STATUS_FATURADO, STATUS_PARCIAL, STATUS_EM_PROGRAMACAO}
)

SORT_PADRAO = "prazo"
ORDER_PADRAO = "asc"

FOLGA_APOS_FATURAMENTO = "apos_faturamento"
FOLGA_ATE_HOJE = "ate_hoje"


def _float_ou_none(valor) -> float | None:
    return float(valor) if valor is not None else None


def _montar_item(item, entrega_pedido: date | None) -> dict:
    nf_numero = getattr(item, "nf_numero", None)
    nf_entrega = getattr(item, "nf_entrega", None)
    # A data de entrega so vale para item ja faturado: sem NF nao ha o que entregar.
    entrega = (nf_entrega or entrega_pedido) if nf_numero else None
    if entrega is not None:
        status = STATUS_ENTREGUE
    elif nf_numero:
        status = STATUS_FATURADO
    else:
        status = STATUS_EM_PROGRAMACAO

    return {
        "item_numero": item.item_numero,
        "item_cliente": getattr(item, "item_cliente", None),
        "cod_cliente": getattr(item, "cod_cliente", None),
        "sku": item.sku,
        "descricao": item.descricao,
        "qtd_pedida": float(item.qtd_pedida or 0),
        "qtd_faturada": float(item.qtd_faturada or 0),
        "valor_unitario": _float_ou_none(getattr(item, "valor_unitario", None)),
        "valor_total": _float_ou_none(getattr(item, "valor_total", None)),
        "serial": getattr(item, "serial", None),
        "nf_numero": nf_numero,
        "nf_serie": getattr(item, "nf_serie", None),
        "nf_emissao": getattr(item, "nf_emissao", None),
        "nf_embarque": getattr(item, "nf_embarque", None),
        "entrega_cliente": entrega,
        "status": status,
    }


def _status_pedido(itens: list[dict], tem_confirmacao: bool) -> str:
    if not itens:
        return STATUS_ENTREGUE if tem_confirmacao else STATUS_EM_PROGRAMACAO
    entregues = sum(1 for i in itens if i["status"] == STATUS_ENTREGUE)
    faturados = sum(1 for i in itens if i["status"] != STATUS_EM_PROGRAMACAO)
    if entregues == len(itens):
        return STATUS_ENTREGUE
    if faturados == 0:
        return STATUS_EM_PROGRAMACAO
    if faturados == len(itens):
        return STATUS_FATURADO
    return STATUS_PARCIAL


def calcular_prazos(
    data_pedido: date | None,
    contract_date: date | None,
    faturamento_em: datetime | None,
    hoje: date,
) -> tuple[int | None, int | None, str | None]:
    """Prazo contratado, folga e a base da folga.

    - prazo contratado: data do pedido no JUND ate o Contract Date.
    - folga apos faturamento: emissao da NF ate o Contract Date (negativa quando
      o faturamento passou do prazo).
    - pedido ainda nao faturado: a folga conta de hoje ate o Contract Date.
    Sem Contract Date nada e calculado (nao ha o que medir).
    """
    if contract_date is None:
        return None, None, None
    prazo = (contract_date - data_pedido).days if data_pedido is not None else None
    if faturamento_em is not None:
        return prazo, (contract_date - faturamento_em.date()).days, FOLGA_APOS_FATURAMENTO
    return prazo, (contract_date - hoje).days, FOLGA_ATE_HOJE


def montar_pedido_comercial(pedido, resultado: ResultadoPedido) -> dict:
    """Linha da tela Comercial para um pedido ja avaliado."""
    itens = sorted(
        (_montar_item(i, resultado.data_entrega_real) for i in pedido.itens),
        key=lambda i: i["item_numero"],
    )
    valores = [i["valor_total"] for i in itens if i["valor_total"] is not None]
    processo = resultado.processo or {}
    data_pedido = getattr(pedido, "data_pedido", None)
    prazo_contratado, folga, folga_tipo = calcular_prazos(
        data_pedido,
        resultado.contract_date,
        resultado.faturamento_em,
        processo.get("data_operacional") or date.today(),
    )
    return {
        "pedido_id": resultado.pedido_id,
        "erp_id": resultado.erp_id,
        "numero": resultado.numero,
        "numero_interno": resultado.numero_interno,
        "cliente": resultado.cliente,
        "contrato": getattr(pedido, "contrato", None),
        "data_pedido": data_pedido,
        "contract_date": resultado.contract_date,
        "faturamento_em": resultado.faturamento_em,
        "prazo_contratado_dias": prazo_contratado,
        "folga_dias": folga,
        "folga_tipo": folga_tipo,
        "status": _status_pedido(itens, resultado.confirmacao is not None),
        "etapa_atual": processo.get("etapa_atual"),
        "etapa_atual_nome": processo.get("etapa_atual_nome"),
        "qtd_itens": len(itens),
        "qtd_pedida_total": resultado.qtd_pedida_total,
        "valor_total": round(sum(valores), 2) if valores else None,
        "itens": itens,
    }


def _texto_busca(linha: dict) -> str:
    partes = [
        linha["numero"],
        linha["numero_interno"],
        linha["contrato"],
        linha["cliente"],
    ]
    for item in linha["itens"]:
        partes.extend([item["cod_cliente"], item["descricao"], item["nf_numero"]])
    return " ".join(str(p) for p in partes if p).casefold()


def filtrar_linhas(
    linhas: list[dict], *, status: str | None = None, busca: str | None = None
) -> list[dict]:
    """Filtra por status e texto livre. Status desconhecido e ignorado."""
    if status and status in STATUS_VALIDOS:
        linhas = [linha for linha in linhas if linha["status"] == status]
    termo = busca.strip().casefold() if busca else ""
    if termo:
        linhas = [linha for linha in linhas if termo in _texto_busca(linha)]
    return linhas


_STATUS_RANK = {
    STATUS_EM_PROGRAMACAO: 0,
    STATUS_PARCIAL: 1,
    STATUS_FATURADO: 2,
    STATUS_ENTREGUE: 3,
}

SORT_KEYS = {
    "prazo": lambda linha: linha["contract_date"],
    "pedido": lambda linha: linha["numero"],
    "cliente": lambda linha: (linha["cliente"] or "").lower(),
    "status": lambda linha: _STATUS_RANK[linha["status"]],
    "valor": lambda linha: linha["valor_total"],
    "itens": lambda linha: linha["qtd_itens"],
    "data_pedido": lambda linha: linha["data_pedido"],
    "faturamento": lambda linha: linha["faturamento_em"],
    "prazo_contratado": lambda linha: linha["prazo_contratado_dias"],
    "folga": lambda linha: linha["folga_dias"],
}


def _serie(valores: list[int]) -> dict:
    if not valores:
        return {"n": 0, "media": None, "mediana": None}
    return {
        "n": len(valores),
        "media": round(statistics.mean(valores), 1),
        "mediana": round(statistics.median(valores), 1),
    }


def calcular_kpis(linhas: list[dict], dias_alerta: int) -> dict:
    """KPIs de prazo sobre as linhas ja filtradas (todas as paginas).

    Pedidos sem Contract Date ficam fora das medias: so sao contados. Contract
    Date anterior a data do pedido indica pedido lancado no JUND depois do prazo;
    ele sai da media do prazo contratado (prazo negativo so distorce) e e
    contado a parte.
    """
    com_prazo = [l for l in linhas if l["contract_date"] is not None]
    prazos = [
        l["prazo_contratado_dias"]
        for l in com_prazo
        if l["prazo_contratado_dias"] is not None
    ]
    inconsistentes = sum(1 for p in prazos if p < 0)
    folgas = [
        l["folga_dias"]
        for l in com_prazo
        if l["folga_tipo"] == FOLGA_APOS_FATURAMENTO
    ]
    return {
        "total_pedidos": len(linhas),
        "com_contract_date": len(com_prazo),
        "sem_contract_date": len(linhas) - len(com_prazo),
        "contract_date_inconsistente": inconsistentes,
        "prazo_contratado": _serie([p for p in prazos if p >= 0]),
        "folga_apos_faturamento": _serie(folgas),
        "faturados_fora_do_prazo": sum(1 for f in folgas if f < 0),
        "folga_curta": sum(1 for f in folgas if 0 <= f <= dias_alerta),
        "dias_alerta": dias_alerta,
    }


def ordenar_linhas(
    linhas: list[dict], sort: str = SORT_PADRAO, order: str = ORDER_PADRAO
) -> list[dict]:
    """Ordena por uma coluna e mantem valores vazios no fim."""
    chave = SORT_KEYS.get(sort, SORT_KEYS[SORT_PADRAO])
    com_valor = [l for l in linhas if chave(l) is not None and chave(l) != ""]
    sem_valor = [l for l in linhas if chave(l) is None or chave(l) == ""]
    com_valor.sort(key=chave, reverse=(order == "desc"))
    return com_valor + sem_valor
