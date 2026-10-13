"""adiciona historico de negativas de Producao pelo PCP

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-09-01 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "negativa_producao",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pedido_id", sa.Integer(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column("data_prevista", sa.Date(), nullable=False),
        sa.Column("usuario", sa.String(length=120), nullable=False),
        sa.Column(
            "criado_em",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column("resolvida_em", sa.DateTime(), nullable=True),
        sa.Column("resolvida_por", sa.String(length=120), nullable=True),
        sa.CheckConstraint(
            "length(trim(motivo)) > 0",
            name="ck_negativa_producao_motivo_preenchido",
        ),
        sa.CheckConstraint(
            "(resolvida_em IS NULL AND resolvida_por IS NULL) OR "
            "(resolvida_em IS NOT NULL AND resolvida_por IS NOT NULL)",
            name="ck_negativa_producao_resolucao_par",
        ),
        sa.ForeignKeyConstraint(["pedido_id"], ["pedido.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_negativa_producao_pedido_criado",
        "negativa_producao",
        ["pedido_id", "criado_em"],
        unique=False,
    )
    op.create_index(
        "ix_negativa_producao_pedido_resolvida",
        "negativa_producao",
        ["pedido_id", "resolvida_em"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_negativa_producao_pedido_resolvida",
        table_name="negativa_producao",
    )
    op.drop_index(
        "ix_negativa_producao_pedido_criado",
        table_name="negativa_producao",
    )
    op.drop_table("negativa_producao")
