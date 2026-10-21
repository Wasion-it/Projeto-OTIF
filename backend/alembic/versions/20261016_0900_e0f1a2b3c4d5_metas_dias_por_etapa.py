"""metas globais de dias por etapa do processo interno

Adiciona parametros.metas_dias (JSON em texto, nulo = usar os padroes do
codigo). A coluna e opcional, entao linhas existentes continuam validas.

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
Create Date: 2026-10-16 09:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e0f1a2b3c4d5"
down_revision: Union[str, None] = "d9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("parametros", schema=None) as batch_op:
        batch_op.add_column(sa.Column("metas_dias", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("parametros", schema=None) as batch_op:
        batch_op.drop_column("metas_dias")
