"""adiciona etapa Comercial e agendamento da inspecao

Revision ID: c7d8e9f0a1b2
Revises: a4c9e2f1b7d3
Create Date: 2026-09-01 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "a4c9e2f1b7d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_CONSTRAINT = "ck_etapa_comercial_agendamento_par"


def _validar_historico() -> None:
    """Aborta antes do DDL se o fluxo legado tiver lacunas ou datas invertidas."""
    quantidade = op.get_bind().execute(
        sa.text(
            "SELECT COUNT(*) FROM etapa_processo WHERE "
            "(pcp_data IS NULL AND (producao_fim IS NOT NULL OR lem_data IS NOT NULL "
            "OR expedicao_data IS NOT NULL)) OR "
            "(producao_fim IS NULL AND (lem_data IS NOT NULL OR expedicao_data IS NOT NULL)) OR "
            "(lem_data IS NULL AND expedicao_data IS NOT NULL) OR "
            "(pcp_data IS NOT NULL AND producao_fim IS NOT NULL AND producao_fim < pcp_data) OR "
            "(producao_fim IS NOT NULL AND lem_data IS NOT NULL AND lem_data < producao_fim) OR "
            "(lem_data IS NOT NULL AND expedicao_data IS NOT NULL AND expedicao_data < lem_data)"
        )
    ).scalar_one()
    if quantidade:
        raise RuntimeError(
            "Migration da etapa Comercial abortada: "
            f"{quantidade} registro(s) de etapa possuem lacunas ou datas fora de ordem. "
            "Corrija-os antes de executar alembic upgrade head."
        )


def upgrade() -> None:
    _validar_historico()

    with op.batch_alter_table("etapa_processo", schema=None) as batch_op:
        batch_op.add_column(sa.Column("comercial_data", sa.Date(), nullable=True))
        batch_op.add_column(
            sa.Column("inspecao_agendada_data", sa.Date(), nullable=True)
        )
        batch_op.add_column(sa.Column("comercial_obs", sa.Text(), nullable=True))

    # Para fluxos historicos validos ja inspecionados, a agenda corresponde a
    # data real do LEM; assim a duracao historica do LEM comeca em zero.
    op.execute(
        sa.text(
            "UPDATE etapa_processo "
            "SET comercial_data = producao_fim, inspecao_agendada_data = lem_data "
            "WHERE comercial_data IS NULL "
            "AND producao_fim IS NOT NULL AND lem_data IS NOT NULL"
        )
    )

    with op.batch_alter_table("etapa_processo", schema=None) as batch_op:
        batch_op.create_check_constraint(
            _CONSTRAINT,
            "(comercial_data IS NULL AND inspecao_agendada_data IS NULL) OR "
            "(comercial_data IS NOT NULL AND inspecao_agendada_data IS NOT NULL "
            "AND inspecao_agendada_data >= comercial_data)",
        )


def downgrade() -> None:
    with op.batch_alter_table("etapa_processo", schema=None) as batch_op:
        batch_op.drop_constraint(_CONSTRAINT, type_="check")
        batch_op.drop_column("comercial_obs")
        batch_op.drop_column("inspecao_agendada_data")
        batch_op.drop_column("comercial_data")
