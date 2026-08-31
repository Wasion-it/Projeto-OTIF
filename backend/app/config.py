"""Configuracao da aplicacao.

Usa pydantic-settings para ler variaveis de ambiente (ou arquivo .env).
Por padrao roda em SQLite (mock), mas basta trocar DATABASE_URL para apontar
para o Postgres da aplicacao em producao.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Banco PROPRIO da aplicacao (guarda dados sincronizados do ERP + inputs manuais).
    # Mock: SQLite. Producao sugerida: postgresql+psycopg://user:pass@host:5432/otif
    database_url: str = "sqlite:///./otif.db"

    # Origem dos dados do ERP. "mock" gera dados fake; "sqlserver" leria o Jundsoft.
    erp_source: str = "mock"

    # Prazo de entrega (SLA) em dias corridos a partir da data solicitada
    # (digitacao do pedido). On Time = entrega <= data_solicitada + prazo.
    prazo_entrega_dias: int = 60

    # Faltando este numero de dias (ou menos) para o prazo, o pedido pendente
    # entra em "atencao" no painel.
    dias_alerta_prazo: int = 7

    # Conexao READ-ONLY com o Jundsoft (SQL Server). Usada quando erp_source=sqlserver.
    jundsoft_host: str = ""          # ex.: 10.10.1.5,52702  (host,porta)
    jundsoft_db: str = "jundsoft"
    jundsoft_user: str = ""
    jundsoft_password: str = ""
    jundsoft_odbc_driver: str = "SQL Server"

    @property
    def jundsoft_conn_str(self) -> str:
        """String de conexao pyodbc para o Jundsoft."""
        return (
            f"DRIVER={{{self.jundsoft_odbc_driver}}};"
            f"SERVER={self.jundsoft_host};DATABASE={self.jundsoft_db};"
            f"UID={self.jundsoft_user};PWD={self.jundsoft_password}"
        )

    # Origens liberadas no CORS (frontend).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
