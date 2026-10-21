"""Leitura direta do JUND e composicao com os dados manuais locais.

O banco proprio mantem apenas a ancora de identidade (`Pedido.id`/`erp_id`) e
as relacoes manuais. Campos ERP usados na resposta sempre vem do payload JUND.
"""
from __future__ import annotations

import logging
import time
from datetime import date
from threading import Lock
from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from .config import get_settings
from .erp_sync import buscar_pedidos_erp
from .models import Pedido

logger = logging.getLogger(__name__)

_cache_lock = Lock()
_anchor_lock = Lock()
_cache_dados: list[dict] | None = None
_cache_em: float = 0.0
_cache_erro: ErpIndisponivelError | None = None
_cache_erro_em: float = 0.0


class ErpIndisponivelError(RuntimeError):
    pass


def _dados_jund(
    *,
    force_refresh: bool = False,
    strict_refresh: bool = False,
) -> list[dict]:
    """Cache curto/single-flight; falhas nunca sao apresentadas como dado fresco."""
    global _cache_dados, _cache_em, _cache_erro, _cache_erro_em

    settings = get_settings()
    agora = time.monotonic()
    ttl = max(0, settings.erp_cache_ttl_seconds)
    backoff = max(0, settings.erp_error_backoff_seconds)
    idade = agora - _cache_em
    if _cache_erro is not None and agora - _cache_erro_em <= backoff:
        raise _cache_erro

    force_necessario = force_refresh and (strict_refresh or idade >= 1.0)
    if _cache_dados is not None and idade <= ttl and not force_necessario:
        return _cache_dados

    with _cache_lock:
        agora = time.monotonic()
        idade = agora - _cache_em
        if _cache_erro is not None and agora - _cache_erro_em <= backoff:
            raise _cache_erro
        force_necessario = force_refresh and (strict_refresh or idade >= 1.0)
        if _cache_dados is not None and idade <= ttl and not force_necessario:
            return _cache_dados
        try:
            dados = buscar_pedidos_erp(meses=settings.erp_lookback_months)
        except Exception as exc:
            erro = ErpIndisponivelError(
                "Nao foi possivel consultar o JUND neste momento."
            )
            _cache_erro = erro
            _cache_erro_em = time.monotonic()
            raise erro from exc

        _cache_dados = dados
        _cache_em = time.monotonic()
        _cache_erro = None
        _cache_erro_em = 0.0
        return dados


def obter_pedido_erp(
    erp_id: int | None,
    *,
    force_refresh: bool = False,
    strict_refresh: bool = False,
) -> dict | None:
    if erp_id is None:
        return None
    dados = _dados_jund(
        force_refresh=force_refresh,
        strict_refresh=strict_refresh,
    )
    return next((pedido for pedido in dados if pedido.get("erp_id") == erp_id), None)


def _filtrar(
    dados: list[dict],
    data_ini: date | None,
    data_fim: date | None,
    cliente: str | None,
) -> list[dict]:
    cliente_busca = cliente.strip().casefold() if cliente else None
    saida: list[dict] = []
    for pedido in dados:
        digitacao = pedido.get("data_solicitada_cliente")
        if data_ini is not None and (digitacao is None or digitacao < data_ini):
            continue
        if data_fim is not None and (digitacao is None or digitacao > data_fim):
            continue
        if cliente_busca and cliente_busca not in str(pedido.get("cliente", "")).casefold():
            continue
        saida.append(pedido)
    return saida


def _criar_ancora(dado: dict) -> Pedido:
    data_pedido = dado.get("data_pedido") or dado.get("data_solicitada_cliente")
    data_digitacao = dado.get("data_solicitada_cliente") or data_pedido
    if data_pedido is None or data_digitacao is None:
        raise ValueError(
            f"Pedido ERP {dado.get('erp_id')} sem data obrigatoria para ancora local."
        )
    return Pedido(
        erp_id=dado.get("erp_id"),
        numero=dado.get("numero") or "(sem numero)",
        numero_interno=dado.get("numero_interno"),
        cliente=dado.get("cliente") or "(sem cadastro)",
        data_pedido=data_pedido,
        data_solicitada_cliente=data_digitacao,
        contract_date=dado.get("contract_date"),
        faturamento_em=dado.get("faturamento_em"),
        embarque_em=dado.get("embarque_em"),
        nota_fiscal_numero=dado.get("nota_fiscal_numero"),
        nota_fiscal_serie=dado.get("nota_fiscal_serie"),
        origem="ERP_ANCHOR",
    )


def _carregar_ancoras(db: Session, dados: list[dict]) -> dict[int, Pedido]:
    ids = {int(d["erp_id"]) for d in dados if d.get("erp_id") is not None}
    if not ids:
        return {}

    # Serializa a criacao no processo. A constraint unique(erp_id) continua
    # sendo a protecao autoritativa entre multiplos workers.
    with _anchor_lock:
        existentes = {
            pedido.erp_id: pedido
            for pedido in db.execute(
                select(Pedido).where(Pedido.erp_id.in_(ids))
            ).scalars()
        }
        faltantes = [
            dado
            for dado in dados
            if dado.get("erp_id") is not None and dado["erp_id"] not in existentes
        ]
        for dado in faltantes:
            try:
                with db.begin_nested():
                    db.add(_criar_ancora(dado))
                    db.flush()
            except IntegrityError:
                # Outro worker criou apenas esta ancora; as demais continuam.
                pass
        if faltantes:
            db.commit()

    stmt = (
        select(Pedido)
        .where(Pedido.erp_id.in_(ids))
        .options(
            joinedload(Pedido.confirmacao),
            joinedload(Pedido.etapa),
            selectinload(Pedido.negativas_producao),
        )
    )
    return {
        pedido.erp_id: pedido
        for pedido in db.execute(stmt).unique().scalars().all()
        if pedido.erp_id is not None
    }


def _compor(dado: dict, ancora: Pedido) -> SimpleNamespace:
    itens = [SimpleNamespace(**item) for item in dado.get("itens", [])]
    return SimpleNamespace(
        id=ancora.id,
        erp_id=dado.get("erp_id"),
        numero=dado.get("numero") or "(sem numero)",
        numero_interno=dado.get("numero_interno"),
        cliente=dado.get("cliente") or "(sem cadastro)",
        data_pedido=dado.get("data_pedido"),
        data_solicitada_cliente=dado.get("data_solicitada_cliente"),
        contract_date=dado.get("contract_date"),
        faturamento_em=dado.get("faturamento_em"),
        embarque_em=dado.get("embarque_em"),
        nota_fiscal_numero=dado.get("nota_fiscal_numero"),
        nota_fiscal_serie=dado.get("nota_fiscal_serie"),
        contrato=dado.get("contrato"),
        # LEM automatico (jigadb): nao e persistido, vem sempre da leitura atual.
        lem_automatico=bool(dado.get("lem_automatico")),
        lem_inicio_em=dado.get("lem_inicio_em"),
        lem_fim_em=dado.get("lem_fim_em"),
        # Producao automatica (jigadb): tambem nao e persistida.
        producao_automatica=bool(dado.get("producao_automatica")),
        producao_inicio_em=dado.get("producao_inicio_em"),
        producao_fim_em=dado.get("producao_fim_em"),
        itens=itens,
        confirmacao=ancora.confirmacao,
        etapa=ancora.etapa,
        negativas_producao=list(ancora.negativas_producao),
    )


def carregar_pedidos_direto(
    db: Session,
    data_ini: date | None = None,
    data_fim: date | None = None,
    cliente: str | None = None,
    *,
    force_refresh: bool = False,
) -> list[SimpleNamespace]:
    dados = _filtrar(
        _dados_jund(force_refresh=force_refresh), data_ini, data_fim, cliente
    )
    # A leitura direta exige PV01_ID. Linhas sem identidade nao podem receber
    # dados manuais com seguranca e sao descartadas com aviso.
    validos = [d for d in dados if d.get("erp_id") is not None]
    if len(validos) != len(dados):
        logger.warning("%d pedidos JUND sem PV01_ID foram ignorados", len(dados) - len(validos))

    ancoras = _carregar_ancoras(db, validos)
    compostos = [
        _compor(dado, ancoras[dado["erp_id"]])
        for dado in validos
        if dado["erp_id"] in ancoras
    ]
    compostos.sort(
        key=lambda pedido: (pedido.data_solicitada_cliente, pedido.id),
        reverse=True,
    )
    return compostos
