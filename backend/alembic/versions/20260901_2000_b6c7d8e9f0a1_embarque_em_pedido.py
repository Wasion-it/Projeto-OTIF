"""adiciona timestamp de embarque ao pedido

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-09-01 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, None] = "a5b6c7d8e9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("pedido", schema=None) as batch_op:
        batch_op.add_column(sa.Column("embarque_em", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("pedido", schema=None) as batch_op:
        batch_op.drop_column("embarque_em")
