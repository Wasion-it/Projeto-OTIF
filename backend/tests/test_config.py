"""Testes da configuracao do Jundsoft (Settings / jundsoft_conn_str).

Nenhum teste conecta ao Jundsoft real e nenhum imprime a senha (ficticia).
Todos isolam o Settings do .env real (_env_file=None) e do ambiente do shell.
"""
import logging
import sys
import types

import pytest

from app import erp_sync, pedidos_direto
from app.config import Settings

SENHA_FICTICIA = "S3nh@Fict1cia"

_CHAVES_JUNDSOFT = (
    "JUNDSOFT_HOST",
    "JUNDSOFT_PORT",
    "JUNDSOFT_DATABASE",
    "JUNDSOFT_USERNAME",
    "JUNDSOFT_PASSWORD",
    "JUNDSOFT_ODBC_DRIVER",
    "JUNDSOFT_ENCRYPT",
    "JUNDSOFT_TRUST_SERVER_CERTIFICATE",
    # Formato antigo: nao deve mais ter efeito.
    "JUNDSOFT_DB",
    "JUNDSOFT_USER",
    "JUNDSOFT_ODBC_EXTRA",
)


@pytest.fixture(autouse=True)
def _limpa_env(monkeypatch):
    for chave in _CHAVES_JUNDSOFT:
        monkeypatch.delenv(chave, raising=False)


def _settings(**kwargs) -> Settings:
    base = dict(
        jundsoft_host="10.10.1.5",
        jundsoft_port=52702,
        jundsoft_database="JUNDSOFT",
        jundsoft_username="otif_readonly",
        jundsoft_password=SENHA_FICTICIA,
        jundsoft_odbc_driver="ODBC Driver 18 for SQL Server",
    )
    base.update(kwargs)
    return Settings(_env_file=None, **base)


def _partes(conn_str: str) -> dict[str, str]:
    """Quebra a string ODBC em chave/valor (sem escape; so para valores simples)."""
    partes = {}
    for item in conn_str.split(";"):
        if not item:
            continue
        chave, _, valor = item.partition("=")
        partes[chave] = valor
    return partes


def test_defaults_seguros():
    s = Settings(_env_file=None)
    assert s.jundsoft_port == 1433
    assert s.jundsoft_database == "JUNDSOFT"
    assert s.jundsoft_odbc_driver == "ODBC Driver 18 for SQL Server"
    assert s.jundsoft_encrypt is True
    assert s.jundsoft_trust_server_certificate is False
    assert s.jundsoft_host == s.jundsoft_username == s.jundsoft_password == ""
    partes = _partes(s.jundsoft_conn_str)
    assert partes["Encrypt"] == "yes"
    assert partes["TrustServerCertificate"] == "no"


def test_host_e_port_separados_geram_server_host_virgula_port():
    s = _settings()
    assert "," not in s.jundsoft_host
    assert _partes(s.jundsoft_conn_str)["SERVER"] == "10.10.1.5,52702"


def test_porta_customizada():
    assert _partes(_settings(jundsoft_port=14330).jundsoft_conn_str)["SERVER"] == (
        "10.10.1.5,14330"
    )
    base = dict(
        jundsoft_host="10.10.1.5",
        jundsoft_username="otif_readonly",
        jundsoft_password=SENHA_FICTICIA,
    )
    s = Settings(_env_file=None, **base)
    assert _partes(s.jundsoft_conn_str)["SERVER"] == "10.10.1.5,1433"


def test_database_e_uid_corretos():
    partes = _partes(_settings().jundsoft_conn_str)
    assert partes["DATABASE"] == "JUNDSOFT"
    assert partes["UID"] == "otif_readonly"
    assert _partes(_settings(jundsoft_database="OUTRO").jundsoft_conn_str)["DATABASE"] == (
        "OUTRO"
    )


def test_driver_entre_chaves():
    assert _settings().jundsoft_conn_str.startswith(
        "DRIVER={ODBC Driver 18 for SQL Server};"
    )
    assert _settings(jundsoft_odbc_driver="SQL Server").jundsoft_conn_str.startswith(
        "DRIVER={SQL Server};"
    )


def test_driver_legado_nao_envia_atributos_de_criptografia():
    # O driver nativo "SQL Server" recusa Encrypt/TrustServerCertificate.
    conn = _settings(jundsoft_odbc_driver="SQL Server").jundsoft_conn_str
    partes = _partes(conn)
    assert "Encrypt" not in partes
    assert "TrustServerCertificate" not in partes
    assert partes["SERVER"] == "10.10.1.5,52702"
    assert partes["DATABASE"] == "JUNDSOFT"


@pytest.mark.parametrize("valor, esperado", [(True, "yes"), (False, "no")])
def test_encrypt_mapeado(valor, esperado):
    partes = _partes(_settings(jundsoft_encrypt=valor).jundsoft_conn_str)
    assert partes["Encrypt"] == esperado


@pytest.mark.parametrize("valor, esperado", [(True, "yes"), (False, "no")])
def test_trust_server_certificate_mapeado(valor, esperado):
    partes = _partes(
        _settings(jundsoft_trust_server_certificate=valor).jundsoft_conn_str
    )
    assert partes["TrustServerCertificate"] == esperado


def test_string_completa_formato_exato():
    esperado = (
        "DRIVER={ODBC Driver 18 for SQL Server};SERVER=10.10.1.5,52702;"
        "DATABASE=JUNDSOFT;UID=otif_readonly;PWD=" + SENHA_FICTICIA + ";"
        "Encrypt=yes;TrustServerCertificate=no;"
    )
    # Comparacao booleana para nao exibir a string (com senha) em caso de falha.
    assert (_settings().jundsoft_conn_str == esperado) is True


@pytest.mark.parametrize(
    "texto, esperado", [("true", "yes"), ("false", "no"), ("1", "yes"), ("0", "no")]
)
def test_env_vars_strings_parseadas(monkeypatch, texto, esperado):
    monkeypatch.setenv("JUNDSOFT_HOST", "db-jundsoft.exemplo.local")
    monkeypatch.setenv("JUNDSOFT_PORT", "52702")
    monkeypatch.setenv("JUNDSOFT_DATABASE", "JUNDSOFT")
    monkeypatch.setenv("JUNDSOFT_USERNAME", "otif_readonly")
    monkeypatch.setenv("JUNDSOFT_PASSWORD", SENHA_FICTICIA)
    monkeypatch.setenv("JUNDSOFT_ODBC_DRIVER", "ODBC Driver 18 for SQL Server")
    monkeypatch.setenv("JUNDSOFT_ENCRYPT", texto)
    monkeypatch.setenv("JUNDSOFT_TRUST_SERVER_CERTIFICATE", texto)

    s = Settings(_env_file=None)
    assert s.jundsoft_port == 52702
    assert isinstance(s.jundsoft_port, int)
    assert s.jundsoft_encrypt is (esperado == "yes")
    assert s.jundsoft_trust_server_certificate is (esperado == "yes")
    partes = _partes(s.jundsoft_conn_str)
    assert partes["SERVER"] == "db-jundsoft.exemplo.local,52702"
    assert partes["Encrypt"] == esperado
    assert partes["TrustServerCertificate"] == esperado


def test_variaveis_antigas_sao_ignoradas(monkeypatch):
    monkeypatch.setenv("JUNDSOFT_DB", "antigo")
    monkeypatch.setenv("JUNDSOFT_USER", "antigo")
    monkeypatch.setenv("JUNDSOFT_ODBC_EXTRA", "TrustServerCertificate=yes")

    s = _settings()
    for campo in ("jundsoft_db", "jundsoft_user", "jundsoft_odbc_extra"):
        assert not hasattr(s, campo)
    partes = _partes(s.jundsoft_conn_str)
    assert partes["DATABASE"] == "JUNDSOFT"
    assert partes["UID"] == "otif_readonly"
    assert partes["TrustServerCertificate"] == "no"
    assert len(partes) == 7


def test_escape_odbc_de_senha_com_ponto_e_virgula():
    conn_str = _settings(jundsoft_password="a;b}c").jundsoft_conn_str
    assert ";PWD={a;b}}c};" in conn_str
    assert conn_str.endswith(";Encrypt=yes;TrustServerCertificate=no;")


def test_escape_odbc_de_host_e_driver():
    conn_str = _settings(
        jundsoft_host="h;x", jundsoft_odbc_driver="Drv}X"
    ).jundsoft_conn_str
    assert conn_str.startswith("DRIVER={Drv}}X};SERVER={h;x,52702};")
    assert conn_str.endswith(";Encrypt=yes;TrustServerCertificate=no;")


def test_senha_nao_aparece_em_repr():
    s = _settings()
    assert SENHA_FICTICIA not in repr(s)
    assert SENHA_FICTICIA not in str(s)


def test_senha_nao_e_logada_na_falha_de_conexao(monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    chamadas = {}

    def _connect(conn_str, **kwargs):
        chamadas["conn_str"] = conn_str
        chamadas["kwargs"] = kwargs
        raise RuntimeError("falha simulada de conexao")

    fake = types.ModuleType("pyodbc")
    fake.connect = _connect
    monkeypatch.setitem(sys.modules, "pyodbc", fake)
    monkeypatch.setattr(
        erp_sync, "get_settings", lambda: _settings(erp_source="sqlserver")
    )

    with pytest.raises(RuntimeError) as excinfo:
        erp_sync.buscar_pedidos_erp(meses=1)

    assert SENHA_FICTICIA not in caplog.text
    assert SENHA_FICTICIA not in str(excinfo.value)
    assert chamadas["kwargs"].get("readonly") is True
    assert "SERVER=10.10.1.5,52702;" in chamadas["conn_str"]


def test_erro_exposto_pela_api_nao_contem_senha(monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(pedidos_direto, "_cache_dados", None)
    monkeypatch.setattr(pedidos_direto, "_cache_em", 0.0)
    monkeypatch.setattr(pedidos_direto, "_cache_erro", None)
    monkeypatch.setattr(pedidos_direto, "_cache_erro_em", 0.0)
    # Isola do backend/.env real (TTL, backoff, lookback vem do Settings ficticio).
    monkeypatch.setattr(
        pedidos_direto, "get_settings", lambda: _settings(erp_source="sqlserver")
    )

    conn_str = _settings().jundsoft_conn_str

    def _falha(**_kwargs):
        # Pior caso: o driver devolve uma mensagem que contem a conn str.
        raise RuntimeError(conn_str)

    monkeypatch.setattr(pedidos_direto, "buscar_pedidos_erp", _falha)

    with pytest.raises(pedidos_direto.ErpIndisponivelError) as excinfo:
        pedidos_direto._dados_jund(force_refresh=True, strict_refresh=True)

    assert SENHA_FICTICIA not in str(excinfo.value)
    assert SENHA_FICTICIA not in caplog.text
