"""adiciona Contract Date ao pedido

Revision ID: a4c9e2f1b7d3
Revises: fd3b99e07aee
Create Date: 2026-09-01 09:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4c9e2f1b7d3"
down_revision: Union[str, None] = "fd3b99e07aee"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("pedido", schema=None) as batch_op:
        batch_op.add_column(sa.Column("contract_date", sa.Date(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_pedido_contract_date"), ["contract_date"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("pedido", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_pedido_contract_date"))
        batch_op.drop_column("contract_date")
