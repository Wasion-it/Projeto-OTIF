"""Inspecao LEM automatica: inicio e fim por pedido, lidos do jigadb.

Mesma regra do relatorio de inspecao do wasion-report:
- a inspecao e uma OS cujo numero comeca com ``<prefixo>_`` (padrao ``INSP_``);
- so conta a OS que tem ao menos um medidor com status ``E``;
- a data da OS e ``data_do_cadastro``.

Cadeia de ligacao com o pedido (cada lote precisa estar vinculado a uma OP):

    OS INSP (jigadb) -> lote -> ordem_de_producao.id_op_jund
        = TB_OR_01.OR01_ID (JUND) -> TB_OR_01.PV01_ID = Pedido.erp_id

Pedido com varios lotes: o inicio e o do primeiro lote e o fim e o do ultimo.

O jigadb (MySQL) e o JUND (SQL Server) sao bancos distintos, entao o
cruzamento e feito em duas consultas somente-leitura e unido em memoria.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime
from threading import Lock

from .config import get_settings

logger = logging.getLogger(__name__)

# O SQL Server aceita no maximo 2100 parametros por comando.
_LOTE_IN = 1000

_SQL_INSPECOES_POR_OP = """
SELECT
    op.id_op_jund AS id_op_jund,
    MIN(ord.data_do_cadastro) AS inicio_em,
    MAX(ord.data_do_cadastro) AS fim_em
FROM ordem_de_servico_de_ensaio ord
JOIN lote_de_medidores_concessionaria l ON l.id = ord.id_lote_medidores
JOIN ordem_de_producao op ON op.id = l.id_ordem_de_producao
WHERE op.id_op_jund IS NOT NULL
  AND ord.data_do_cadastro >= DATE_SUB(NOW(), INTERVAL %s MONTH)
  AND UPPER(ord.numero_da_OS) LIKE %s
  AND EXISTS (
      SELECT 1
      FROM medidores_da_ordem_de_servico_de_ensaio mos
      WHERE mos.id_Ordem_de_Servico = ord.id
        AND UPPER(mos.status_do_medidor) = 'E'
  )
GROUP BY op.id_op_jund
"""

_cache_lock = Lock()
_cache: dict[int, tuple[datetime, datetime]] | None = None
_cache_em: float = 0.0


class JigadbIndisponivelError(RuntimeError):
    """jigadb inacessivel ou mal configurado e sem resultado anterior."""


def _padrao_like(prefixo: str) -> str:
    """Monta ``PREFIXO\\_%`` escapando curingas do LIKE (o '_' e curinga)."""
    limpo = (prefixo.strip().upper() or "INSP")
    escapado = (
        limpo.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    )
    return f"{escapado}\\_%"


def _inteiro(valor) -> int | None:
    try:
        return int(valor) if valor is not None else None
    except (TypeError, ValueError):
        return None


def agregar_por_pedido(
    inspecoes_por_op: dict[int, tuple[datetime, datetime]],
    pedido_por_op: dict[int, int],
) -> dict[int, tuple[datetime, datetime]]:
    """Une as OPs de cada pedido: menor inicio e maior fim entre os lotes."""
    saida: dict[int, tuple[datetime, datetime]] = {}
    for id_op, (inicio, fim) in inspecoes_por_op.items():
        pv01_id = pedido_por_op.get(id_op)
        if pv01_id is None:
            continue
        atual = saida.get(pv01_id)
        if atual is None:
            saida[pv01_id] = (inicio, fim)
        else:
            saida[pv01_id] = (min(atual[0], inicio), max(atual[1], fim))
    return saida


def _conectar_jigadb():
    import pymysql  # importado aqui: so e dependencia quando LEM_SOURCE=jigadb

    settings = get_settings()
    if not (settings.jigadb_host and settings.jigadb_username):
        raise JigadbIndisponivelError(
            "LEM_SOURCE=jigadb exige JIGADB_HOST e JIGADB_USERNAME configurados."
        )
    return pymysql.connect(
        host=settings.jigadb_host.strip(),
        port=settings.jigadb_port,
        user=settings.jigadb_username,
        password=settings.jigadb_password,
        database=settings.jigadb_database,
        connect_timeout=settings.jigadb_connect_timeout,
        read_timeout=30,
        charset="utf8mb4",
        autocommit=True,
    )


def _inspecoes_por_op(meses: int) -> dict[int, tuple[datetime, datetime]]:
    settings = get_settings()
    conn = _conectar_jigadb()
    try:
        with conn.cursor() as cur:
            cur.execute(
                _SQL_INSPECOES_POR_OP,
                (int(meses), _padrao_like(settings.jigadb_prefixo_os_insp)),
            )
            linhas = cur.fetchall()
    finally:
        conn.close()

    saida: dict[int, tuple[datetime, datetime]] = {}
    for id_op_jund, inicio, fim in linhas:
        id_op = _inteiro(id_op_jund)
        if id_op is None or not isinstance(inicio, datetime) or not isinstance(fim, datetime):
            continue
        saida[id_op] = (inicio, fim)
    return saida


def _pedidos_por_op(ids_op: list[int]) -> dict[int, int]:
    """OR01_ID -> PV01_ID no JUND (somente leitura)."""
    if not ids_op:
        return {}
    import pyodbc  # importado aqui, como em erp_sync

    settings = get_settings()
    conn = pyodbc.connect(settings.jundsoft_conn_str, timeout=15, readonly=True)
    try:
        cur = conn.cursor()
        saida: dict[int, int] = {}
        for i in range(0, len(ids_op), _LOTE_IN):
            bloco = ids_op[i : i + _LOTE_IN]
            marcadores = ",".join("?" * len(bloco))
            cur.execute(
                "SELECT OR01_ID, PV01_ID FROM TB_OR_01 "
                f"WHERE PV01_ID IS NOT NULL AND OR01_ID IN ({marcadores})",
                bloco,
            )
            for or01_id, pv01_id in cur.fetchall():
                id_op, pedido = _inteiro(or01_id), _inteiro(pv01_id)
                if id_op is not None and pedido is not None:
                    saida[id_op] = pedido
        return saida
    finally:
        conn.close()


def _carregar(meses: int) -> dict[int, tuple[datetime, datetime]]:
    inspecoes = _inspecoes_por_op(meses)
    return agregar_por_pedido(inspecoes, _pedidos_por_op(sorted(inspecoes)))


def buscar_inspecoes_por_pedido(meses: int) -> dict[int, tuple[datetime, datetime]]:
    """PV01_ID -> (inicio, fim) da inspecao LEM, com cache curto.

    Em falha reaproveita o ultimo resultado bom (com aviso no log). Sem
    resultado anterior, levanta ``JigadbIndisponivelError``: nunca devolve um
    mapa vazio como se nao houvesse inspecao.
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
                    "jigadb indisponivel (%s); usando as inspecoes da ultima leitura.",
                    type(exc).__name__,
                )
                return _cache
            if isinstance(exc, JigadbIndisponivelError):
                raise
            raise JigadbIndisponivelError(
                "Nao foi possivel consultar as inspecoes no jigadb."
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
