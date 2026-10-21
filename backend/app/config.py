"""Configuracao da aplicacao.

Usa pydantic-settings para ler variaveis de ambiente (ou arquivo .env).
Por padrao roda em SQLite (mock), mas basta trocar DATABASE_URL para apontar
para o Postgres da aplicacao em producao.
"""
from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _yes_no(valor: bool) -> str:
    """Mapeia booleano para o formato ODBC ("yes"/"no")."""
    return "yes" if valor else "no"


def _odbc_value(valor: str) -> str:
    """Escapa um valor de atributo ODBC quando necessario.

    Valores com ';', '{', '}' ou espacos nas pontas vao entre chaves, com '}'
    duplicado (regra ODBC). Evita que uma senha com ';' corrompa a string.
    """
    if any(c in valor for c in ";{}") or valor != valor.strip():
        return "{" + valor.replace("}", "}}") + "}"
    return valor


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
    # Host e porta sao separados: SERVER=<host>,<port> e montado em jundsoft_conn_str.
    jundsoft_host: str = ""          # ex.: db-jundsoft.exemplo.local (sem porta)
    jundsoft_port: int = 1433
    jundsoft_database: str = "JUNDSOFT"
    jundsoft_username: str = ""
    # repr=False: a senha nunca aparece em repr()/str() do Settings (logs).
    jundsoft_password: str = Field(default="", repr=False)
    jundsoft_odbc_driver: str = "ODBC Driver 18 for SQL Server"
    # Defaults seguros: criptografa e valida o certificado do servidor.
    jundsoft_encrypt: bool = True
    jundsoft_trust_server_certificate: bool = False

    @property
    def jundsoft_conn_str(self) -> str:
        """String de conexao pyodbc para o Jundsoft.

        Contem a senha: nunca logar nem expor esta string.
        """
        # Driver sempre entre chaves ('}' duplicado); SERVER escapado se tiver ';{}'.
        driver = self.jundsoft_odbc_driver.replace("}", "}}")
        server = _odbc_value(f"{self.jundsoft_host.strip()},{self.jundsoft_port}")
        conn = (
            f"DRIVER={{{driver}}};"
            f"SERVER={server};"
            f"DATABASE={_odbc_value(self.jundsoft_database)};"
            f"UID={_odbc_value(self.jundsoft_username)};"
            f"PWD={_odbc_value(self.jundsoft_password)};"
        )
        # O driver legado "SQL Server" (nativo do Windows) nao conhece Encrypt nem
        # TrustServerCertificate e recusa a conexao ao receber esses atributos.
        # Nele a conexao segue sem eles; use o "ODBC Driver 17/18" para criptografar.
        if self.jundsoft_odbc_driver.strip().casefold() == "sql server":
            return conn
        return (
            conn
            + f"Encrypt={_yes_no(self.jundsoft_encrypt)};"
            + f"TrustServerCertificate={_yes_no(self.jundsoft_trust_server_certificate)};"
        )

    # Origem da etapa Inspecao LEM.
    #   manual: o time registra a data real no painel (comportamento historico).
    #   jigadb: inicio/fim saem das OS de inspecao (INSP_*) do jigadb, ligadas ao
    #           pedido via lote -> OP -> JUND. Exige erp_source=sqlserver e
    #           erp_read_mode=direct; fora disso a etapa continua manual.
    lem_source: Literal["manual", "jigadb"] = "manual"

    # Conexao READ-ONLY com o jigadb (MySQL). Usada quando lem_source=jigadb.
    jigadb_host: str = ""
    jigadb_port: int = 3306
    jigadb_database: str = "jigadb"
    jigadb_username: str = ""
    # repr=False: a senha nunca aparece em repr()/str() do Settings (logs).
    jigadb_password: str = Field(default="", repr=False)
    jigadb_connect_timeout: int = 10
    # Prefixo das OS de inspecao (mesmo padrao do relatorio de inspecao: INSP_*).
    jigadb_prefixo_os_insp: str = "INSP"
    # Cache das inspecoes por pedido; em falha do jigadb reaproveita o ultimo
    # resultado bom em vez de derrubar o painel.
    jigadb_cache_ttl_seconds: int = 60

    @property
    def lem_automatico(self) -> bool:
        """LEM automatico so existe lendo o JUND direto (precisa do PV01_ID)."""
        return (
            self.lem_source == "jigadb"
            and self.erp_source == "sqlserver"
            and self.erp_read_mode == "direct"
        )

    # Origem da etapa Producao.
    #   manual: o PCP/Producao registra o fim real das OPs no painel.
    #   jigadb: inicio = primeira lacracao e fim = ultima lacracao dos lotes do
    #           pedido (mesma regra do Relatorio de Lotes PCP do wasion-report).
    #           O fim so existe quando TODOS os lotes do pedido tem os medidores
    #           produzidos >= quantidade do lote. Exige LEM_SOURCE=jigadb (evita
    #           a constraint ck_etapa_lem_apos_producao, que pede producao_fim
    #           gravado para qualquer LEM manual), erp_source=sqlserver e
    #           erp_read_mode=direct.
    producao_source: Literal["manual", "jigadb"] = "manual"

    @model_validator(mode="after")
    def _producao_jigadb_exige_lem_jigadb(self) -> "Settings":
        if self.producao_source == "jigadb" and self.lem_source != "jigadb":
            raise ValueError(
                "PRODUCAO_SOURCE=jigadb exige LEM_SOURCE=jigadb: a Producao "
                "automatica nao grava producao_fim, e o LEM manual precisa dele."
            )
        return self

    @property
    def producao_automatica(self) -> bool:
        """Producao automatica tambem precisa do JUND direto (PV01_ID)."""
        return (
            self.producao_source == "jigadb"
            and self.erp_source == "sqlserver"
            and self.erp_read_mode == "direct"
        )

    # Origens liberadas no CORS (frontend).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
