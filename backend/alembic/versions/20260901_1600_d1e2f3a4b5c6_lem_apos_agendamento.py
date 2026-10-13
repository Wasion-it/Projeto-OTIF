"""garante que o LEM ocorra depois do agendamento

Revision ID: d1e2f3a4b5c6
Revises: c7d8e9f0a1b2
Create Date: 2026-09-01 16:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_CONSTRAINT = "ck_etapa_lem_apos_agendamento"


def upgrade() -> None:
    invalidos = op.get_bind().execute(
        sa.text(
            "SELECT COUNT(*) FROM etapa_processo "
            "WHERE lem_data IS NOT NULL AND "
            "(inspecao_agendada_data IS NULL OR lem_data < inspecao_agendada_data)"
        )
    ).scalar_one()
    if invalidos:
        raise RuntimeError(
            "Migration da contagem LEM abortada: "
            f"{invalidos} registro(s) possuem LEM anterior ou sem data agendada."
        )

    with op.batch_alter_table("etapa_processo", schema=None) as batch_op:
        batch_op.create_check_constraint(
            _CONSTRAINT,
            "lem_data IS NULL OR inspecao_agendada_data IS NULL OR "
            "lem_data >= inspecao_agendada_data",
        )


def downgrade() -> None:
    with op.batch_alter_table("etapa_processo", schema=None) as batch_op:
        batch_op.drop_constraint(_CONSTRAINT, type_="check")
