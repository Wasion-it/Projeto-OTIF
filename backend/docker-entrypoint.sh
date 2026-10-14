#!/bin/sh
# Entrypoint do container da OTIF API.
# Aplica as migrations do banco proprio somente quando RUN_MIGRATIONS=true e,
# em seguida, entrega o processo (PID 1) ao comando informado (uvicorn).
set -eu

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    echo "[entrypoint] RUN_MIGRATIONS=true -> alembic upgrade head"
    alembic upgrade head
fi

exec "$@"
