"""Testes da montagem da string de conexao do Jundsoft."""
from app.config import Settings


def _settings(**kwargs) -> Settings:
    base = dict(
        jundsoft_host="host,1433",
        jundsoft_db="jundsoft",
        jundsoft_user="u",
        jundsoft_password="p",
        jundsoft_odbc_driver="SQL Server",
    )
    base.update(kwargs)
    return Settings(_env_file=None, **base)


def test_conn_str_sem_extra_permanece_igual():
    assert _settings().jundsoft_conn_str == (
        "DRIVER={SQL Server};SERVER=host,1433;DATABASE=jundsoft;UID=u;PWD=p"
    )


def test_conn_str_com_extra_anexa_parametros():
    s = _settings(
        jundsoft_odbc_driver="ODBC Driver 18 for SQL Server",
        jundsoft_odbc_extra=";Encrypt=yes;TrustServerCertificate=yes;",
    )
    assert s.jundsoft_conn_str == (
        "DRIVER={ODBC Driver 18 for SQL Server};SERVER=host,1433;DATABASE=jundsoft;"
        "UID=u;PWD=p;Encrypt=yes;TrustServerCertificate=yes"
    )
