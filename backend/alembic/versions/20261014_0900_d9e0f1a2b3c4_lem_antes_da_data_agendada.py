"""permite registrar a inspecao LEM antes da data agendada

A inspecao pode acontecer antes ou depois da data combinada. Continua exigido
que a Producao esteja concluida (ck_etapa_lem_apos_producao) e que exista
agendamento (validado na API). A contagem de dias no LEM segue partindo da data
agendada; inspecao antecipada conta 0 dias.

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-10-14 09:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_CONSTRAINT = "ck_etapa_lem_apos_agendamento"


def upgrade() -> None:
    with op.batch_alter_table("etapa_processo", schema=None) as batch_op:
        batch_op.drop_constraint(_CONSTRAINT, type_="check")


def downgrade() -> None:
    antecipados = op.get_bind().execute(
        sa.text(
            "SELECT COUNT(*) FROM etapa_processo "
            "WHERE lem_data IS NOT NULL AND inspecao_agendada_data IS NOT NULL "
            "AND lem_data < inspecao_agendada_data"
        )
    ).scalar_one()
    if antecipados:
        raise RuntimeError(
            "Downgrade abortado: "
            f"{antecipados} registro(s) possuem inspecao LEM antes da data agendada."
        )
    with op.batch_alter_table("etapa_processo", schema=None) as batch_op:
        batch_op.create_check_constraint(
            _CONSTRAINT,
            "lem_data IS NULL OR inspecao_agendada_data IS NULL OR "
            "lem_data >= inspecao_agendada_data",
        )
