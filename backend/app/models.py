"""Modelos do banco proprio da aplicacao.

Separacao importante:
- Pedido / ItemPedido: dados que VEM do ERP (Jundsoft). Sao somente-leitura na pratica;
  no mock sao gerados pelo seed, em producao seriam preenchidos pelo job de sync.
- ConfirmacaoEntrega: dado MANUAL, inserido pelo time comercial dentro desta aplicacao.

O resultado OTIF nao e persistido: e calculado sob demanda (ver otif.py) para
sempre refletir os dados mais recentes.
"""
from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class MotivoFalha(str, enum.Enum):
    """Lista fechada de causas raiz para pedidos que falham o OTIF."""

    FALTA_ESTOQUE = "falta_estoque"
    ATRASO_PRODUCAO = "atraso_producao"
    ATRASO_FATURAMENTO = "atraso_faturamento"
    ATRASO_TRANSPORTE = "atraso_transporte"
    RECUSA_CLIENTE = "recusa_cliente"
    ERRO_DOCUMENTO = "erro_documento"
    AVARIA = "avaria"
    OUTRO = "outro"
    # Falha sem causa informada. Nunca e "chutado" pelo sistema: sinaliza no
    # painel que o time ainda precisa preencher a causa raiz daquele pedido.
    NAO_INFORMADO = "nao_informado"


class Pedido(Base):
    __tablename__ = "pedido"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Chave do pedido no ERP (PV01_ID). Usada para sync idempotente. Nula no mock.
    erp_id: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True, index=True)
    # Numero exibido (PV01_NUMERO_CLIENTE). Nao e unico: o mesmo PO de cliente pode repetir.
    numero: Mapped[str] = mapped_column(String(60), index=True)
    # Numero interno da empresa (PV01_NUMERO_INTERNO). Desambigua PO de cliente repetido.
    numero_interno: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    cliente: Mapped[str] = mapped_column(String(160), index=True)
    data_pedido: Mapped[date] = mapped_column(Date)
    # Timestamp de digitacao do pedido no ERP (PV01_DATA_DIGITACAO_H).
    # Mantido separado do prazo para rastreabilidade e filtros por entrada.
    data_solicitada_cliente: Mapped[date] = mapped_column(Date, index=True)
    # Prazo oficial informado pelo comercial no pedido do JUND
    # (TB_PV_02.PV02_DIAS_ENTREGA). Ausente quando o valor nao e uma data valida.
    contract_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    # Ultima emissao de faturamento nao cancelada no JUND
    # (MAX TB_FT_01.FT01_DATA_EMISSAO_H), preservando data e hora locais.
    faturamento_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Ultimo embarque nao cancelado informado no JUND (FT01_DATA_EMBARQUE).
    embarque_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Identificacao da mesma nota que originou faturamento_em.
    nota_fiscal_numero: Mapped[str | None] = mapped_column(String(30), nullable=True)
    nota_fiscal_serie: Mapped[str | None] = mapped_column(String(10), nullable=True)
    origem: Mapped[str] = mapped_column(String(20), default="ERP")

    itens: Mapped[list[ItemPedido]] = relationship(
        back_populates="pedido", cascade="all, delete-orphan"
    )
    # Confirmacao de entrega: MANUAL e por PEDIDO. A data de entrega vale para o
    # pedido inteiro; o OTIF (On Time / In Full) e avaliado no nivel do pedido.
    confirmacao: Mapped[ConfirmacaoEntrega | None] = relationship(
        back_populates="pedido", uselist=False, cascade="all, delete-orphan"
    )
    # Etapas internas do processo (PCP -> Producao -> Comercial -> LEM ->
    # Faturamento automatico -> Estoque ate o embarque -> Expedicao).
    # Input MANUAL das areas; separado do ERP para o sync nao sobrescrever.
    etapa: Mapped[EtapaProcesso | None] = relationship(
        back_populates="pedido", uselist=False, cascade="all, delete-orphan"
    )
    # Historico auditavel das vezes em que o PCP recusou liberar a Producao.
    negativas_producao: Mapped[list[NegativaProducao]] = relationship(
        back_populates="pedido", cascade="all, delete-orphan"
    )


class ItemPedido(Base):
    __tablename__ = "item_pedido"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id"), index=True)
    # Numero do item no pedido do ERP (PV02_ITEM). Usado no upsert idempotente.
    item_numero: Mapped[int] = mapped_column(Integer, default=0)
    sku: Mapped[str] = mapped_column(String(60), index=True)
    descricao: Mapped[str] = mapped_column(String(200))
    qtd_pedida: Mapped[float] = mapped_column(Numeric(14, 3))
    qtd_faturada: Mapped[float] = mapped_column(Numeric(14, 3), default=0)
    # Data da nota fiscal -> proxy da expedicao. Separa atraso interno x transporte.
    data_faturamento: Mapped[date | None] = mapped_column(Date, nullable=True)
    origem: Mapped[str] = mapped_column(String(20), default="ERP")

    pedido: Mapped[Pedido] = relationship(back_populates="itens")


class ConfirmacaoEntrega(Base):
    """Input MANUAL do time comercial: confirma a chegada do PEDIDO no cliente.

    E uma confirmacao por pedido: a data de entrega vale para todos os itens, e
    "recebido_completo" indica se o pedido chegou completo (base do In Full manual).
    """

    __tablename__ = "confirmacao_entrega"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(
        ForeignKey("pedido.id"), unique=True, index=True
    )
    data_entrega_real: Mapped[date] = mapped_column(Date)
    recebido_completo: Mapped[bool] = mapped_column(Boolean, default=True)
    motivo_falha: Mapped[MotivoFalha | None] = mapped_column(
        Enum(MotivoFalha), nullable=True
    )
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario: Mapped[str] = mapped_column(String(120), default="comercial")
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    pedido: Mapped[Pedido] = relationship(back_populates="confirmacao")


class NegativaProducao(Base):
    """Evento historico: PCP recusou liberar a Producao naquele momento."""

    __tablename__ = "negativa_producao"
    __table_args__ = (
        CheckConstraint(
            "length(trim(motivo)) > 0",
            name="ck_negativa_producao_motivo_preenchido",
        ),
        CheckConstraint(
            "(resolvida_em IS NULL AND resolvida_por IS NULL) OR "
            "(resolvida_em IS NOT NULL AND resolvida_por IS NOT NULL)",
            name="ck_negativa_producao_resolucao_par",
        ),
        Index(
            "ix_negativa_producao_pedido_criado",
            "pedido_id",
            "criado_em",
        ),
        Index(
            "ix_negativa_producao_pedido_resolvida",
            "pedido_id",
            "resolvida_em",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id"))
    motivo: Mapped[str] = mapped_column(Text)
    data_prevista: Mapped[date] = mapped_column(Date)
    usuario: Mapped[str] = mapped_column(String(120), default="pcp")
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    resolvida_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolvida_por: Mapped[str | None] = mapped_column(String(120), nullable=True)

    pedido: Mapped[Pedido] = relationship(back_populates="negativas_producao")


class EtapaProcesso(Base):
    """Avanco manual do pedido pelas areas internas.

    Fluxo:
        Pedido -> PCP -> Producao -> Comercial -> Inspecao LEM -> Faturamento
        (ERP) -> Estoque (aguarda o Embarque do ERP) -> Expedicao (automatica,
        = data do Embarque) -> Entrega.

    ``comercial_data`` registra quando o Comercial concluiu sua acao, enquanto
    ``inspecao_agendada_data`` guarda o compromisso futuro informado nessa acao.
    As datas sao separadas para a agenda nao distorcer duracao ou etapa atual.
    """

    __tablename__ = "etapa_processo"
    __table_args__ = (
        CheckConstraint(
            "(comercial_data IS NULL AND inspecao_agendada_data IS NULL) OR "
            "(comercial_data IS NOT NULL AND inspecao_agendada_data IS NOT NULL "
            "AND inspecao_agendada_data >= comercial_data)",
            name="ck_etapa_comercial_agendamento_par",
        ),
        CheckConstraint(
            "lem_data IS NULL OR "
            "(producao_fim IS NOT NULL AND lem_data >= producao_fim)",
            name="ck_etapa_lem_apos_producao",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(
        ForeignKey("pedido.id"), unique=True, index=True
    )

    # PCP: data em que o planejamento de producao foi concluido + janela planejada.
    pcp_data: Mapped[date | None] = mapped_column(Date, nullable=True)
    producao_plan_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    producao_plan_fim: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Producao: data real em que as OPs do pedido foram finalizadas.
    producao_fim: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Comercial: conclusao da acao e data combinada para a inspecao do pedido.
    comercial_data: Mapped[date | None] = mapped_column(Date, nullable=True)
    inspecao_agendada_data: Mapped[date | None] = mapped_column(Date, nullable=True)

    # LEM: data real em que a inspecao foi concluida.
    lem_data: Mapped[date | None] = mapped_column(Date, nullable=True)

    # DEPRECADO: a Expedicao passou a ser automatica (= data do Embarque do
    # ERP, ``Pedido.embarque_em``). Coluna preservada apenas por compatibilidade
    # com registros historicos; a aplicacao nao le nem escreve mais este campo.
    expedicao_data: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Observacao por etapa (preenchida ao confirmar cada etapa).
    pcp_obs: Mapped[str | None] = mapped_column(Text, nullable=True)
    producao_obs: Mapped[str | None] = mapped_column(Text, nullable=True)
    comercial_obs: Mapped[str | None] = mapped_column(Text, nullable=True)
    lem_obs: Mapped[str | None] = mapped_column(Text, nullable=True)
    expedicao_obs: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Observacao geral do processo (opcional, no editor completo de etapas).
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario: Mapped[str] = mapped_column(String(120), default="pcp")
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    pedido: Mapped[Pedido] = relationship(back_populates="etapa")


class Parametros(Base):
    """Parametros globais do painel, editaveis em tempo de execucao (tela Ajustes).

    E uma linha unica (id=1). Quando ausente, a aplicacao usa os defaults do
    ambiente (config.Settings). Substitui a meta que antes ficava fixa no
    frontend e o SLA/alerta que so vinham do .env.
    """

    __tablename__ = "parametros"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Meta de OTIF (%), usada para o semaforo e a linha de meta dos graficos.
    meta_otif: Mapped[float] = mapped_column(Float, default=95.0)
    # Legado inativo: mantido fisicamente nesta primeira etapa apenas para rollback.
    # O calculo OTIF nao consulta este valor; usa Pedido.contract_date.
    sla_padrao_dias: Mapped[int] = mapped_column(Integer, default=60)
    # Faltando este numero de dias (ou menos) para o Contract Date, o pendente
    # entra em "atencao".
    dias_alerta_prazo: Mapped[int] = mapped_column(Integer, default=7)
    # Meta global de dias por etapa do processo interno, em JSON
    # ({"producao": 10, ...}). Chaves ausentes usam otif.METAS_DIAS_PADRAO.
    metas_dias: Mapped[str | None] = mapped_column(Text, nullable=True)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class SlaCliente(Base):
    """Tabela legada inativa, preservada temporariamente para rollback.

    Nenhum calculo ou endpoint consulta estes valores depois da adocao do
    Contract Date informado no pedido do JUND.
    """

    __tablename__ = "sla_cliente"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cliente: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    prazo_dias: Mapped[int] = mapped_column(Integer)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
