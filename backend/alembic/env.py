"""Ambiente de execucao do Alembic.

A URL do banco e o metadata vem da propria aplicacao, entao migrations e app
ficam sempre em sincronia:
- URL: app.config.get_settings().database_url (respeita DATABASE_URL do .env);
- metadata alvo: app.database.Base.metadata (todos os modelos).
"""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import get_settings
from app.database import Base

# Importa os modelos para que Base.metadata conheca todas as tabelas.
from app import models  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Injeta a URL da aplicacao (sobrescreve qualquer valor do alembic.ini).
# O configparser interpreta '%' (interpolacao); senhas com URL-encoding (%40, %23...)
# quebrariam a migration. '%%' e o escape e volta a '%' ao ler a opcao.
config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Gera SQL sem conectar (modo --sql)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Necessario para o SQLite aplicar ALTERs via recriacao de tabela.
        render_as_batch=url.startswith("sqlite"),
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Aplica as migrations conectando ao banco."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        is_sqlite = connection.dialect.name == "sqlite"
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=is_sqlite,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
