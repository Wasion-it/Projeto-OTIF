"""adiciona numero e serie da ultima nota fiscal ao pedido

Revision ID: c8d9e0f1a2b3
Revises: b6c7d8e9f0a1
Create Date: 2026-09-01 21:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, None] = "b6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("pedido", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("nota_fiscal_numero", sa.String(length=30), nullable=True)
        )
        batch_op.add_column(
            sa.Column("nota_fiscal_serie", sa.String(length=10), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("pedido", schema=None) as batch_op:
        batch_op.drop_column("nota_fiscal_serie")
        batch_op.drop_column("nota_fiscal_numero")
