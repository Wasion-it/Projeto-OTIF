"""Configuracao da aplicacao.

Usa pydantic-settings para ler variaveis de ambiente (ou arquivo .env).
Por padrao roda em SQLite (mock), mas basta trocar DATABASE_URL para apontar
para o Postgres da aplicacao em producao.
"""
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Banco PROPRIO da aplicacao (ancoras de PV01_ID + dados manuais).
    # Campos ERP legados permanecem apenas para rollback e nao sao fonte no modo direct.
    database_url: str = "sqlite:///./otif.db"

    # Origem e modo de leitura do ERP. Em sqlserver/direct a API consulta o JUND
    # por geracao logica e mescla somente os dados manuais do banco proprio.
    erp_source: Literal["mock", "sqlserver"] = "mock"
    erp_read_mode: Literal["direct", "snapshot"] = "direct"
    erp_lookback_months: int = 12
    erp_cache_ttl_seconds: int = 10
    erp_error_backoff_seconds: int = 15

    # Faltando este numero de dias (ou menos) para o Contract Date, o pedido
    # pendente entra em "atencao" no painel.
    dias_alerta_prazo: int = 7

    # Meta de OTIF (%) padrao. Usada quando ainda nao ha parametros salvos no banco.
    meta_otif: float = 95.0

    # Conexao READ-ONLY com o Jundsoft (SQL Server). Usada quando erp_source=sqlserver.
    jundsoft_host: str = ""          # ex.: 10.10.1.5,52702  (host,porta)
    jundsoft_db: str = "jundsoft"
    jundsoft_user: str = ""
    jundsoft_password: str = ""
    jundsoft_odbc_driver: str = "SQL Server"
    # Parametros ODBC extras anexados ao final da string (opcional, padrao vazio).
    # Ex. para o "ODBC Driver 18 for SQL Server" (Linux/container), que usa
    # Encrypt=yes com validacao de certificado por padrao:
    #   Encrypt=yes;TrustServerCertificate=yes
    jundsoft_odbc_extra: str = ""

    @property
    def jundsoft_conn_str(self) -> str:
        """String de conexao pyodbc para o Jundsoft."""
        conn_str = (
            f"DRIVER={{{self.jundsoft_odbc_driver}}};"
            f"SERVER={self.jundsoft_host};DATABASE={self.jundsoft_db};"
            f"UID={self.jundsoft_user};PWD={self.jundsoft_password}"
        )
        extra = self.jundsoft_odbc_extra.strip().strip(";")
        if extra:
            conn_str += f";{extra}"
        return conn_str

    # Origens liberadas no CORS (frontend).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
