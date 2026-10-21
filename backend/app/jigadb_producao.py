"""Producao automatica: inicio e fim por pedido, lidos do jigadb.

Mesma regra do Relatorio de Lotes (PCP) do wasion-report:
- o medidor produzido e o ultimo registro de cada codigo de barras do lote,
  ignorando status ``R`` (reprocesso);
- o inicio da producao do lote e a menor ``DataHoraLacracao`` e o termino e a
  maior ``DataHoraLacracao``.

Alem do relatorio, o OTIF so considera o lote concluido quando os medidores
produzidos alcancam a quantidade do lote (``quantidade_de_medidores``). Sem
isso, um lote parcialmente lacrado pareceria terminado.

Cadeia de ligacao com o pedido (igual a da Inspecao LEM):

    lote -> ordem_de_producao.id_op_jund = TB_OR_01.OR01_ID (JUND)
         -> TB_OR_01.PV01_ID = Pedido.erp_id

Pedido com varios lotes: o inicio e o do primeiro lote; o fim so existe quando
todos os lotes estao concluidos e e o do ultimo.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime
from threading import Lock

from .config import get_settings
from .jigadb_lem import (
    JigadbIndisponivelError,
    _conectar_jigadb,
    _inteiro,
    _pedidos_por_op,
)

logger = logging.getLogger(__name__)

_SQL_LOTES_PRODUCAO = """
SELECT
    op.id_op_jund AS id_op_jund,
    l.id AS id_lote,
    l.quantidade_de_medidores AS quantidade,
    COUNT(m.id) AS produzidos,
    MIN(m.DataHoraLacracao) AS inicio_em,
    MAX(m.DataHoraLacracao) AS fim_em
FROM lote_de_medidores_concessionaria l
JOIN ordem_de_producao op ON op.id = l.id_ordem_de_producao
LEFT JOIN codigos_barra_medidores_concessionaria cb ON cb.id_lote = l.id
LEFT JOIN medidores m ON m.id = (
    SELECT MAX(m1.id)
    FROM medidores m1
    WHERE m1.id_codbarra_Concessionaria = cb.id
      AND (m1.status IS NULL OR UPPER(m1.status) <> 'R')
)
WHERE op.id_op_jund IS NOT NULL
  AND l.data_da_entrada >= DATE_SUB(NOW(), INTERVAL %s MONTH)
GROUP BY op.id_op_jund, l.id, l.quantidade_de_medidores
"""

_cache_lock = Lock()
_cache: dict[int, tuple[datetime | None, datetime | None]] | None = None
_cache_em: float = 0.0


@dataclass(frozen=True)
class LoteProducao:
    """Producao de um lote: medidores lacrados e janela de lacracao."""

    id_op: int
    quantidade: int | None
    produzidos: int
    inicio: datetime | None
    fim: datetime | None

    @property
    def concluido(self) -> bool:
        return (
            self.quantidade is not None
            and self.quantidade > 0
            and self.produzidos >= self.quantidade
        )


def agregar_por_pedido(
    lotes: list[LoteProducao],
    pedido_por_op: dict[int, int],
) -> dict[int, tuple[datetime | None, datetime | None]]:
    """Une os lotes de cada pedido em (inicio, fim).

    inicio: menor lacracao entre os lotes (None se nada foi lacrado).
    fim: maior lacracao, somente se todos os lotes do pedido estao concluidos.
    """
    por_pedido: dict[int, list[LoteProducao]] = {}
    for lote in lotes:
        pv01_id = pedido_por_op.get(lote.id_op)
        if pv01_id is None:
            continue
        por_pedido.setdefault(pv01_id, []).append(lote)

    saida: dict[int, tuple[datetime | None, datetime | None]] = {}
    for pv01_id, do_pedido in por_pedido.items():
        inicios = [lote.inicio for lote in do_pedido if lote.inicio is not None]
        fins = [lote.fim for lote in do_pedido if lote.fim is not None]
        todos_concluidos = all(lote.concluido for lote in do_pedido)
        saida[pv01_id] = (
            min(inicios) if inicios else None,
            max(fins) if fins and todos_concluidos else None,
        )
    return saida


def _datetime_ou_none(valor) -> datetime | None:
    return valor if isinstance(valor, datetime) else None


def _lotes_producao(meses: int) -> list[LoteProducao]:
    conn = _conectar_jigadb()
    try:
        with conn.cursor() as cur:
            cur.execute(_SQL_LOTES_PRODUCAO, (int(meses),))
            linhas = cur.fetchall()
    finally:
        conn.close()

    lotes: list[LoteProducao] = []
    for id_op_jund, _id_lote, quantidade, produzidos, inicio, fim in linhas:
        id_op = _inteiro(id_op_jund)
        if id_op is None:
            continue
        lotes.append(
            LoteProducao(
                id_op=id_op,
                quantidade=_inteiro(quantidade),
                produzidos=_inteiro(produzidos) or 0,
                inicio=_datetime_ou_none(inicio),
                fim=_datetime_ou_none(fim),
            )
        )
    return lotes


def _carregar(meses: int) -> dict[int, tuple[datetime | None, datetime | None]]:
    lotes = _lotes_producao(meses)
    ids_op = sorted({lote.id_op for lote in lotes})
    return agregar_por_pedido(lotes, _pedidos_por_op(ids_op))


def buscar_producao_por_pedido(
    meses: int,
) -> dict[int, tuple[datetime | None, datetime | None]]:
    """PV01_ID -> (inicio, fim) da producao, com cache curto.

    Em falha reaproveita o ultimo resultado bom (com aviso no log). Sem
    resultado anterior, levanta ``JigadbIndisponivelError``: nunca devolve um
    mapa vazio como se nao houvesse producao.
    """
    global _cache, _cache_em

    ttl = max(0, get_settings().jigadb_cache_ttl_seconds)
    if _cache is not None and time.monotonic() - _cache_em <= ttl:
        return _cache

    with _cache_lock:
        if _cache is not None and time.monotonic() - _cache_em <= ttl:
            return _cache
        try:
            dados = _carregar(meses)
        except Exception as exc:
            if _cache is not None:
                logger.warning(
                    "jigadb indisponivel (%s); usando a producao da ultima leitura.",
                    type(exc).__name__,
                )
                return _cache
            if isinstance(exc, JigadbIndisponivelError):
                raise
            raise JigadbIndisponivelError(
                "Nao foi possivel consultar a producao no jigadb."
            ) from exc
        _cache = dados
        _cache_em = time.monotonic()
        return dados


def limpar_cache() -> None:
    """Zera o cache (testes e troca de configuracao)."""
    global _cache, _cache_em
    with _cache_lock:
        _cache = None
        _cache_em = 0.0
