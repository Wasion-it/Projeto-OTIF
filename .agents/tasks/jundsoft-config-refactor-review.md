# Configuração Jundsoft com HOST/PORT/DATABASE/USERNAME/PASSWORD separados (revisão v2)

O formato antigo da conexão Jundsoft (`JUNDSOFT_HOST=host,porta`, `JUNDSOFT_DB`, `JUNDSOFT_USER` e `JUNDSOFT_ODBC_EXTRA` livre) foi trocado por oito variáveis tipadas. `Settings.jundsoft_conn_str` agora monta `SERVER=<host>,<port>` e tira `Encrypt` e `TrustServerCertificate` de dois booleanos. O diff mexe só em `backend/app/config.py`, `backend/tests/test_config.py`, nos dois `.env.example` e em `docker-compose.yml`. `git diff --quiet` confirma que `models.py`, `alembic/`, `erp_sync.py`, `queries.py` e `Dockerfile` não mudaram. Esta segunda passada verifica as três findings da v1. A evidência de validação está em `jundsoft-config-refactor-report.md`, o teste da API agora é isolado do `.env` real, e HOST e DRIVER passam pelo escape ODBC.

Watch for: o `npm ci` falhou com EPERM porque um dev server Vite estava rodando. O frontend foi restaurado com `npm install` a partir do lockfile sem alteração, e `npm run build` passou (**confirmed** pelo relatório, não bloqueante, o frontend não está no diff). A conexão local ao Jundsoft não funciona hoje (TLS falha com o driver legado `SQL Server`, e o login é recusado com 28000). O problema é de ambiente e credenciais, não de código (**confirmed** pelo relatório, não bloqueante).

**Verdict**: APPROVED

## High-level view

A string de conexão sai inteira de campos tipados. Os defaults são seguros: `jundsoft_port=1433`, `jundsoft_database="JUNDSOFT"`, driver `ODBC Driver 18 for SQL Server`, `jundsoft_encrypt=True` e `jundsoft_trust_server_certificate=False`. `Encrypt` e `TrustServerCertificate` vêm de `_yes_no()`, sem nenhum valor hardcoded. O anexo livre do antigo `JUNDSOFT_ODBC_EXTRA` deixou de existir, e um teste mostra que `JUNDSOFT_ODBC_EXTRA=TrustServerCertificate=yes` no ambiente não muda mais nada. SERVER, DATABASE, UID e PWD passam por `_odbc_value`. O driver fica sempre entre `{}`, com `}` duplicado. Nos valores comuns, a string sai exatamente no formato pedido.

A senha tem `repr=False`. Nenhum `print`/`logger` em `backend/app` referencia `settings`, `jundsoft_conn_str` ou `jundsoft_password`. Dois testes, com um `pyodbc` falso e com uma exceção que carrega a conn str inteira, confirmam que a senha não aparece em log nem na mensagem exposta pela API.

O compose recebe as oito variáveis com defaults não vazios nos campos tipados, sem nenhum valor real. `RUN_MIGRATIONS:-true` e o bind `${BACKEND_BIND:-127.0.0.1}` continuam como estavam. O Dockerfile continua com `msodbcsql18` e `unixodbc`, e o container lista `ODBC Driver 18 for SQL Server`. `pyodbc==5.2.0` continua sendo a biblioteca, e não há nenhuma referência a pymssql ou FreeTDS. Os `.env` locais são ignorados (`.gitignore:22 *.env`). `git ls-files` só rastreia os `.env.example`, e eles contêm só valores fictícios e os quatro avisos pedidos. No Windows local, `backend/.env` usa `SQL Server` porque o Driver 18 não está instalado. Isso foi registrado no relatório, e o padrão do código e dos containers continua sendo o Driver 18.

<details>
<summary>Issues (2)</summary>

1. **`npm ci` não rodou limpo (não bloqueante)**: o dev server Vite travava um binário nativo, então o `npm ci` falhou com EPERM. A restauração foi feita com `npm install`. Para cumprir a validação literal da seção 12, parar o dev server e rodar `npm ci && npm run build` de novo.
2. **`model_dump()` ainda inclui a senha (não bloqueante, likely)**: `repr=False` tira a senha de `repr`/`str`, mas não do dump do pydantic. Hoje ninguém loga o dump. Se no futuro alguém serializar o Settings, migrar para `SecretStr` ou usar `exclude=True`.

</details>

<details>
<summary>Details</summary>

### Fechamento das findings da v1

O relatório traz as saídas pedidas: `pytest -q` com `91 passed`, `npm run build` OK, `docker compose config --quiet` (também com `--env-file .env.example`, o cenário do CI), `build`, `up -d`/`ps` com os três serviços healthy e `/health` com `erp_source=mock`. Também mostra `pyodbc.drivers()` no container com `['ODBC Driver 18 for SQL Server']`, `pyodbc.drivers()` no Windows sem o Driver 18 e o resultado sanitizado da seção 13 (SQLSTATE 08001 e 28000, sem host nem usuário). Nenhum host, usuário ou senha aparece no relatório.

`test_erro_exposto_pela_api_nao_contem_senha` agora faz monkeypatch de `pedidos_direto.get_settings`. O nome é importado no nível do módulo (`from .config import get_settings`, linha 18), então o patch funciona de fato.

O escape do SERVER aplica `_odbc_value` sobre `host,port` inteiro. `test_escape_odbc_de_host_e_driver` cobre `;` no host e `}` no driver. Rejeitar esses caracteres com um validator teria derrubado o Settings também no modo mock, então escapar é a escolha mais conservadora.

### Cobertura de testes frente à seção 10

`tests/test_config.py` cobre: HOST sem vírgula, `SERVER=HOST,PORT`, porta customizada e default 1433, DATABASE, UID, driver entre chaves (Driver 18 e `SQL Server`), `Encrypt` yes/no, `TrustServerCertificate` yes/no, defaults seguros, parse de `"true"/"false"/"1"/"0"` via env (porta como `int`), variáveis antigas ignoradas, igualdade exata com a string completa (comparada como booleano para não exibir a senha em caso de falha), escape, senha fora de `repr`/`str`, senha fora de `caplog` e da exceção. Todos os testes usam `_env_file=None`, e uma fixture autouse remove as 11 chaves `JUNDSOFT_*` do ambiente. Nada conecta ao Jundsoft real.

### Regressão do formato antigo

`git grep` fora de `.agents/` só encontra os seis termos antigos em `backend/tests/test_config.py`: na tupla da fixture que limpa o ambiente e no teste que prova que eles são ignorados. Não há nenhuma referência funcional. Os relatórios históricos `.agents/tasks/devops-fase1-*` ficaram intactos de propósito.

</details>

<details>
<summary>File map</summary>

- `backend/app/config.py`: oito campos Jundsoft, `_yes_no` e `_odbc_value`, `repr=False` na senha, nova `jundsoft_conn_str` com SERVER e driver escapados.
- `backend/tests/test_config.py`: reescrito, isolado do `.env` real, sem rede.
- `backend/.env.example` e `.env.example`: bloco Jundsoft no formato novo, com valores fictícios e avisos de usuário read-only e TrustServerCertificate.
- `docker-compose.yml`: oito variáveis novas no lugar das antigas.
- Não versionados: `.env` e `backend/.env`, já migrados e ignorados pelo git.

Diff completo: `git diff` contra `b35e12f` (nada commitado).

</details>
