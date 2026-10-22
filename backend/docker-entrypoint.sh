#!/bin/sh
# Entrypoint do container da OTIF API.
#
# 1. Segredos: para cada VAR_FILE apontando para um arquivo (Docker Swarm
#    secrets em /run/secrets/*), exporta VAR com o conteudo do arquivo. Assim a
#    senha nunca aparece em `docker service inspect`, no compose nem no CI.
# 2. DATABASE_URL: se nao informada e houver POSTGRES_PASSWORD (vinda de
#    secret), monta a URL com a senha em URL-encoding.
# 3. Migrations: `alembic upgrade head` somente com RUN_MIGRATIONS=true, depois
#    de aguardar o banco aceitar conexoes.
# 4. Entrega o processo (PID 1) ao comando informado (uvicorn).
set -eu

# file_env VAR: se VAR_FILE existir, carrega VAR a partir do arquivo.
# Falha cedo se VAR e VAR_FILE forem definidas ao mesmo tempo.
file_env() {
    var="$1"
    file_var="${var}_FILE"
    eval "val=\${${var}:-}"
    eval "file=\${${file_var}:-}"

    if [ -n "$val" ] && [ -n "$file" ]; then
        echo "[entrypoint] ERRO: ${var} e ${file_var} definidas ao mesmo tempo" >&2
        exit 1
    fi
    if [ -n "$file" ]; then
        if [ ! -r "$file" ]; then
            echo "[entrypoint] ERRO: ${file_var}=${file} nao existe ou nao e legivel" >&2
            exit 1
        fi
        val="$(cat "$file")"
        export "${var}=${val}"
    fi
    unset "${file_var}" 2>/dev/null || true
}

file_env POSTGRES_PASSWORD
file_env JUNDSOFT_PASSWORD
file_env JIGADB_PASSWORD

# Monta DATABASE_URL a partir de POSTGRES_* quando o deploy usa secret.
if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
    DATABASE_URL="$(python - <<'PY'
import os
from urllib.parse import quote

user = quote(os.environ.get("POSTGRES_USER", "otif"), safe="")
password = quote(os.environ["POSTGRES_PASSWORD"], safe="")
host = os.environ.get("POSTGRES_HOST", "otif-postgres")
port = os.environ.get("POSTGRES_PORT", "5432")
db = quote(os.environ.get("POSTGRES_DB", "otif"), safe="")
print(f"postgresql+psycopg://{user}:{password}@{host}:{port}/{db}")
PY
)"
    export DATABASE_URL
fi

# A senha do Postgres so serve para montar a URL acima.
unset POSTGRES_PASSWORD

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    echo "[entrypoint] Aguardando o banco aceitar conexoes..."
    python - <<'PY'
import os
import sys
import time

from sqlalchemy import create_engine, text

url = os.environ.get("DATABASE_URL", "")
if not url:
    sys.exit("[entrypoint] ERRO: DATABASE_URL nao definida")

# connect_timeout evita ficar pendurado para sempre quando o pacote e descartado
# (ex.: rede overlay entre nos bloqueada): sem ele nenhuma tentativa e registrada.
engine = create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
for tentativa in range(1, 31):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("[entrypoint] Banco pronto.", flush=True)
        break
    except Exception as exc:  # noqa: BLE001 - qualquer falha de conexao e tentada de novo
        # Mostra o motivo (1a linha) sem expor a URL/senha.
        motivo = str(exc).strip().splitlines()[0] if str(exc).strip() else ""
        print(
            f"[entrypoint]   tentativa {tentativa}/30: {type(exc).__name__}: {motivo[:160]}",
            flush=True,
        )
        time.sleep(2)
else:
    sys.exit("[entrypoint] ERRO: banco indisponivel apos ~3 min")
PY
    echo "[entrypoint] RUN_MIGRATIONS=true -> alembic upgrade head"
    alembic upgrade head
fi

exec "$@"
