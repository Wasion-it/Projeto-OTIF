"""Ordenacao e paginacao dos resultados de OTIF no lado do servidor.

A ordenacao/paginacao acontece no backend para que o frontend receba apenas uma
pagina. Valores vazios ficam sempre no fim, independentemente da direcao.
"""
from __future__ import annotations

import math
from datetime import datetime
from collections.abc import Callable, Sequence

from .otif import ResultadoPedido

STATUS_RANK = {"sem_contract_date": 0, "pendente": 1, "falha": 2, "otif": 3}
ETAPA_RANK = {
    "pedido": 0,
    "pcp": 1,
    "producao": 2,
    "comercial": 3,
    "lem": 4,
    "faturamento": 5,
    "estoque": 6,
    "expedicao": 7,
    "entrega": 8,
    "concluido": 9,
}


def _ratio(r: ResultadoPedido) -> float:
    total = float(r.qtd_pedida_total or 0)
    return float(r.qtd_faturada_total or 0) / total if total else 0.0


def _faturamento(r: ResultadoPedido) -> datetime | None:
    if r.faturamento_em is not None:
        return r.faturamento_em
    if r.data_faturamento is not None:
        return datetime.combine(r.data_faturamento, datetime.min.time())
    return None


def _nota_fiscal(r: ResultadoPedido):
    numero = r.nota_fiscal_numero
    if not numero:
        return None
    return (0, int(numero)) if numero.isdigit() else (1, numero.lower())


def _etapa_atual(r: ResultadoPedido):
    return (r.processo or {}).get("etapa_atual")


SORT_KEYS: dict[str, Callable[[ResultadoPedido], object]] = {
    "status": lambda r: STATUS_RANK.get(r.status, 9),
    "pedido": lambda r: r.numero,
    "cliente": lambda r: (r.cliente or "").lower(),
    "etapa": lambda r: ETAPA_RANK.get(_etapa_atual(r), 9),
    "itens": lambda r: r.qtd_itens,
    "solicitada": lambda r: r.data_solicitada,
    "prazo": lambda r: r.contract_date,
    "faturamento": _faturamento,
    "nota_fiscal": _nota_fiscal,
    "embarque": lambda r: r.embarque_em,
    "entrega": lambda r: r.data_entrega_real,
    "qtd": _ratio,
    "atraso": lambda r: r.dias_atraso,
    "motivo": lambda r: r.motivo_falha or "",
}

ORDENACOES_VALIDAS = frozenset(SORT_KEYS)
ORDER_PADRAO = "asc"
SORT_PADRAO = "prazo"


def _vazio(v: object) -> bool:
    return v is None or v == ""


def ordenar_resultados(
    resultados: list[ResultadoPedido],
    sort: str = SORT_PADRAO,
    order: str = ORDER_PADRAO,
) -> list[ResultadoPedido]:
    """Ordena por uma coluna e mantem valores vazios no fim."""
    keyfunc = SORT_KEYS.get(sort, SORT_KEYS[SORT_PADRAO])
    reverse = order == "desc"

    com_valor = [r for r in resultados if not _vazio(keyfunc(r))]
    sem_valor = [r for r in resultados if _vazio(keyfunc(r))]
    com_valor.sort(key=keyfunc, reverse=reverse)
    return com_valor + sem_valor


def paginar(seq: Sequence, page: int, page_size: int) -> tuple[list, int, int]:
    """Recorta uma pagina e retorna itens, total e total de paginas."""
    total = len(seq)
    total_paginas = max(1, math.ceil(total / page_size)) if page_size else 1
    inicio = max(0, (page - 1) * page_size)
    return list(seq[inicio : inicio + page_size]), total, total_paginas
