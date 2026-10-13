"""garante que o LEM ocorra depois da Producao

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-09-01 17:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_CONSTRAINT = "ck_etapa_lem_apos_producao"


def upgrade() -> None:
    invalidos = op.get_bind().execute(
        sa.text(
            "SELECT COUNT(*) FROM etapa_processo "
            "WHERE lem_data IS NOT NULL AND "
            "(producao_fim IS NULL OR lem_data < producao_fim)"
        )
    ).scalar_one()
    if invalidos:
        raise RuntimeError(
            "Migration da dependencia Producao/LEM abortada: "
            f"{invalidos} registro(s) possuem LEM anterior ou sem Producao concluida."
        )

    with op.batch_alter_table("etapa_processo", schema=None) as batch_op:
        batch_op.create_check_constraint(
            _CONSTRAINT,
            "lem_data IS NULL OR "
            "(producao_fim IS NOT NULL AND lem_data >= producao_fim)",
        )


def downgrade() -> None:
    with op.batch_alter_table("etapa_processo", schema=None) as batch_op:
        batch_op.drop_constraint(_CONSTRAINT, type_="check")
