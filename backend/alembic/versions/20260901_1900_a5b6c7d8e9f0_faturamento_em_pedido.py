"""adiciona timestamp de faturamento ao pedido

Revision ID: a5b6c7d8e9f0
Revises: f3a4b5c6d7e8
Create Date: 2026-09-01 19:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a5b6c7d8e9f0"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("pedido", schema=None) as batch_op:
        batch_op.add_column(sa.Column("faturamento_em", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("pedido", schema=None) as batch_op:
        batch_op.drop_column("faturamento_em")
