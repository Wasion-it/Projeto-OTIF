"""Endpoints do avanco manual pelas etapas internas.

Fluxo: PCP -> Producao -> Comercial (agenda inspecao) -> LEM -> Faturamento
(ERP) -> Estoque (aguarda Embarque do ERP) -> Expedicao (automatica, = data
do Embarque). A entrega continua sendo registrada em ConfirmacaoEntrega.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import get_settings
from ..models import EtapaProcesso, NegativaProducao, Pedido
from ..pedidos_direto import obter_pedido_erp
from ..schemas import (
    ComercialAgendamentoCreate,
    EtapaConfirmacaoCreate,
    EtapaCreate,
    EtapaProcessoOut,
    NegativaProducaoCreate,
    NegativaProducaoOut,
)
from ..validacoes import (
    ValidacaoError,
    data_operacional,
    validar_etapas,
    validar_negativa_producao,
)

router = APIRouter(prefix="/etapas", tags=["etapas"])
settings = get_settings()


def _erp_atual(pedido: Pedido) -> dict | None:
    if (
        settings.erp_source == "sqlserver"
        and settings.erp_read_mode == "direct"
        and pedido.erp_id is not None
    ):
        dados = obter_pedido_erp(
            pedido.erp_id,
            force_refresh=True,
            strict_refresh=True,
        )
        if dados is None:
            raise HTTPException(
                status_code=409,
                detail="O pedido nao esta mais disponivel no recorte atual do JUND.",
            )
        return dados
    return None


def _valor_erp(pedido: Pedido, dados: dict | None, campo: str):
    return dados.get(campo) if dados is not None else getattr(pedido, campo)

_CAMPOS_CONFIRMACAO = {
    "pcp": ("pcp_data", "pcp_obs"),
    "producao": ("producao_fim", "producao_obs"),
    "lem": ("lem_data", "lem_obs"),
}


def _valores(
    etapa: EtapaProcesso,
    faturamento_em: datetime | None = None,
    embarque_em: datetime | None = None,
) -> dict:
    return {
        "pcp_data": etapa.pcp_data,
        "producao_plan_inicio": etapa.producao_plan_inicio,
        "producao_plan_fim": etapa.producao_plan_fim,
        "producao_fim": etapa.producao_fim,
        "comercial_data": etapa.comercial_data,
        "inspecao_agendada_data": etapa.inspecao_agendada_data,
        "lem_data": etapa.lem_data,
        "faturamento_data": faturamento_em.date() if faturamento_em else None,
        "embarque_data": embarque_em.date() if embarque_em else None,
    }


def _etapa_interna_atual(
    etapa: EtapaProcesso,
    faturamento_em: datetime | None = None,
    embarque_em: datetime | None = None,
) -> str | None:
    if etapa.pcp_data is None:
        return "pcp"
    if etapa.producao_fim is None:
        return "producao"
    if etapa.comercial_data is None:
        return "comercial"
    if etapa.lem_data is None:
        return "lem"
    if faturamento_em is None:
        return "faturamento"
    if embarque_em is None:
        return "estoque"
    return None


def _validar(data_pedido: date, **valores) -> None:
    try:
        validar_etapas(data_pedido=data_pedido, **valores)
    except ValidacaoError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _exigir_etapa_atual(atual: str | None, informada: str) -> None:
    if atual == informada:
        return
    if atual is None:
        detalhe = "Todas as etapas internas ja foram concluidas."
    else:
        detalhe = f"A etapa atual e {atual}; nao e possivel confirmar {informada}."
    raise HTTPException(status_code=409, detail=detalhe)


def _obter_pedido_para_escrita(db: Session, pedido_id: int) -> Pedido | None:
    """Serializa decisões PCP em bancos com suporte a SELECT FOR UPDATE."""
    return db.execute(
        select(Pedido).where(Pedido.id == pedido_id).with_for_update()
    ).scalar_one_or_none()


def _resolver_negativas_abertas(
    db: Session,
    *,
    pedido_id: int,
    usuario: str,
) -> None:
    resolvida_em = datetime.now(timezone.utc).replace(tzinfo=None)
    db.execute(
        update(NegativaProducao)
        .where(
            NegativaProducao.pedido_id == pedido_id,
            NegativaProducao.resolvida_em.is_(None),
        )
        .values(resolvida_em=resolvida_em, resolvida_por=usuario)
        .execution_options(synchronize_session=False)
    )


@router.get("/{pedido_id}", response_model=EtapaProcessoOut)
def obter_etapa(pedido_id: int, db: Session = Depends(get_db)):
    pedido = db.get(Pedido, pedido_id)
    if pedido is None or pedido.etapa is None:
        raise HTTPException(status_code=404, detail="Etapas nao encontradas para o pedido")
    return pedido.etapa


@router.post(
    "/{pedido_id}/negar-producao",
    response_model=NegativaProducaoOut,
    status_code=201,
)
def negar_producao_pcp(
    pedido_id: int,
    payload: NegativaProducaoCreate,
    db: Session = Depends(get_db),
):
    """Registra uma negativa historica sem avancar ou criar a etapa PCP."""
    pedido = _obter_pedido_para_escrita(db, pedido_id)
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado")

    erp = _erp_atual(pedido)
    etapa_atual = _etapa_interna_atual(
        pedido.etapa or EtapaProcesso(pedido_id=pedido.id),
        _valor_erp(pedido, erp, "faturamento_em"),
        _valor_erp(pedido, erp, "embarque_em"),
    )
    _exigir_etapa_atual(etapa_atual, "pcp")

    try:
        motivo = validar_negativa_producao(
            motivo=payload.motivo,
            data_prevista=payload.data_prevista,
        )
    except ValidacaoError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    negativa = NegativaProducao(
        pedido_id=pedido.id,
        motivo=motivo,
        data_prevista=payload.data_prevista,
        usuario=payload.usuario,
    )
    db.add(negativa)
    db.commit()
    db.refresh(negativa)
    return negativa


@router.put("/{pedido_id}/confirmar", response_model=EtapaProcessoOut)
def confirmar_etapa(
    pedido_id: int,
    payload: EtapaConfirmacaoCreate,
    db: Session = Depends(get_db),
):
    """Confirma somente a etapa atual, sem reenviar ou sobrescrever as demais."""
    pedido = _obter_pedido_para_escrita(db, pedido_id)
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado")
    erp = _erp_atual(pedido)

    etapa = pedido.etapa or EtapaProcesso(pedido_id=pedido.id)
    _exigir_etapa_atual(
        _etapa_interna_atual(
            etapa,
            _valor_erp(pedido, erp, "faturamento_em"),
            _valor_erp(pedido, erp, "embarque_em"),
        ),
        payload.etapa,
    )

    campo_data, campo_obs = _CAMPOS_CONFIRMACAO[payload.etapa]
    valores = _valores(
        etapa,
        _valor_erp(pedido, erp, "faturamento_em"),
        _valor_erp(pedido, erp, "embarque_em"),
    )
    valores[campo_data] = payload.data
    _validar(_valor_erp(pedido, erp, "data_pedido"), **valores)

    if payload.etapa == "pcp":
        _resolver_negativas_abertas(
            db,
            pedido_id=pedido.id,
            usuario=payload.usuario,
        )

    setattr(etapa, campo_data, payload.data)
    setattr(etapa, campo_obs, payload.observacao)
    etapa.usuario = payload.usuario
    db.add(etapa)
    db.commit()
    db.refresh(etapa)
    return etapa


@router.put("/{pedido_id}/comercial", response_model=EtapaProcessoOut)
def agendar_inspecao_comercial(
    pedido_id: int,
    payload: ComercialAgendamentoCreate,
    db: Session = Depends(get_db),
):
    """Registra a agenda Comercial independentemente do andamento da Producao."""
    pedido = _obter_pedido_para_escrita(db, pedido_id)
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado")
    erp = _erp_atual(pedido)

    etapa = pedido.etapa or EtapaProcesso(pedido_id=pedido.id)
    if etapa.inspecao_agendada_data is not None:
        raise HTTPException(
            status_code=409,
            detail="A inspecao ja foi agendada; use o editor para uma correcao.",
        )
    if etapa.lem_data is not None:
        raise HTTPException(
            status_code=409,
            detail="Nao e possivel agendar uma inspecao LEM ja concluida.",
        )

    comercial_data = data_operacional()
    valores = _valores(
        etapa,
        _valor_erp(pedido, erp, "faturamento_em"),
        _valor_erp(pedido, erp, "embarque_em"),
    )
    valores["comercial_data"] = comercial_data
    valores["inspecao_agendada_data"] = payload.inspecao_agendada_data
    _validar(_valor_erp(pedido, erp, "data_pedido"), **valores)

    etapa.comercial_data = comercial_data
    etapa.inspecao_agendada_data = payload.inspecao_agendada_data
    etapa.comercial_obs = payload.observacao
    etapa.usuario = payload.usuario
    db.add(etapa)
    db.commit()
    db.refresh(etapa)
    return etapa


@router.put("/{pedido_id}", response_model=EtapaProcessoOut)
def salvar_etapa(pedido_id: int, payload: EtapaCreate, db: Session = Depends(get_db)):
    """Substitui o registro completo no editor administrativo."""
    pedido = _obter_pedido_para_escrita(db, pedido_id)
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado")
    erp = _erp_atual(pedido)

    _validar(
        _valor_erp(pedido, erp, "data_pedido"),
        pcp_data=payload.pcp_data,
        producao_plan_inicio=payload.producao_plan_inicio,
        producao_plan_fim=payload.producao_plan_fim,
        producao_fim=payload.producao_fim,
        comercial_data=payload.comercial_data,
        inspecao_agendada_data=payload.inspecao_agendada_data,
        lem_data=payload.lem_data,
        faturamento_data=(
            _valor_erp(pedido, erp, "faturamento_em").date()
            if _valor_erp(pedido, erp, "faturamento_em")
            else None
        ),
        embarque_data=(
            _valor_erp(pedido, erp, "embarque_em").date()
            if _valor_erp(pedido, erp, "embarque_em")
            else None
        ),
    )

    if payload.pcp_data is not None:
        _resolver_negativas_abertas(
            db,
            pedido_id=pedido.id,
            usuario=payload.usuario,
        )

    etapa = pedido.etapa or EtapaProcesso(pedido_id=pedido.id)
    etapa.pcp_data = payload.pcp_data
    etapa.producao_plan_inicio = payload.producao_plan_inicio
    etapa.producao_plan_fim = payload.producao_plan_fim
    etapa.producao_fim = payload.producao_fim
    etapa.comercial_data = payload.comercial_data
    etapa.inspecao_agendada_data = payload.inspecao_agendada_data
    etapa.lem_data = payload.lem_data
    etapa.pcp_obs = payload.pcp_obs
    etapa.producao_obs = payload.producao_obs
    etapa.comercial_obs = payload.comercial_obs
    etapa.lem_obs = payload.lem_obs
    etapa.observacao = payload.observacao
    etapa.usuario = payload.usuario

    db.add(etapa)
    db.commit()
    db.refresh(etapa)
    return etapa


@router.delete("/{pedido_id}", status_code=204)
def remover_etapa(pedido_id: int, db: Session = Depends(get_db)):
    pedido = db.get(Pedido, pedido_id)
    if pedido is None or pedido.etapa is None:
        raise HTTPException(status_code=404, detail="Etapas nao encontradas")
    _erp_atual(pedido)
    db.delete(pedido.etapa)
    db.commit()
