# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# OTIF API (FastAPI) - imagem de runtime.
#
# - Base: python:3.12-slim-bookworm (Debian 12, estavel e enxuta).
# - Microsoft ODBC Driver 18 for SQL Server + unixODBC para o pyodbc (Jundsoft,
#   somente leitura). Use JUNDSOFT_ODBC_DRIVER="ODBC Driver 18 for SQL Server".
# - psycopg[binary] (PostgreSQL) vem do requirements.txt.
# - Executa como usuario nao-root. Nenhum .env e copiado (veja .dockerignore);
#   toda configuracao chega por variaveis de ambiente.
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# unixODBC + msodbcsql18 a partir do repositorio oficial da Microsoft (Debian 12),
# com chave em keyring dedicado (signed-by; sem apt-key). curl/gnupg sao usados
# apenas para registrar o repositorio e removidos em seguida.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
        | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" \
        > /etc/apt/sources.list.d/mssql-release.list; \
    apt-get update; \
    ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 unixodbc; \
    apt-get purge -y --auto-remove curl gnupg; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias primeiro para aproveitar o cache de camadas.
# requirements-observability.txt: OpenTelemetry + Pyroscope (ativados por env).
COPY requirements.txt requirements-observability.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-observability.txt

# Usuario nao-root dedicado.
RUN groupadd --system --gid 10001 otif \
    && useradd --system --uid 10001 --gid otif --no-create-home --shell /usr/sbin/nologin otif

# Codigo da aplicacao + migrations. O dono e o usuario da app apenas para que o
# fallback SQLite (DATABASE_URL padrao) consiga criar ./otif.db se usado.
COPY --chown=otif:otif alembic.ini ./
COPY --chown=otif:otif alembic ./alembic
COPY --chown=otif:otif app ./app
COPY --chown=otif:otif docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh \
    && chown otif:otif /app

USER otif

EXPOSE 8000

# Healthcheck via stdlib (curl nao esta presente na imagem final).
# O Swarm herda este HEALTHCHECK; o compose de producao o repete de forma explicita.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"]

# O entrypoint aplica `alembic upgrade head` somente se RUN_MIGRATIONS=true.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
