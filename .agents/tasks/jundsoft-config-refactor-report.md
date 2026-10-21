# Relatório: refatoração da configuração Jundsoft (iteração 2)

Nenhum host, usuário, senha ou connection string aparece neste relatório. Nada foi commitado.

## Correções das findings da revisão

| # | Finding | Correção |
|---|---|---|
| 1 | Evidência de validação ausente | Validações executadas; saídas abaixo. |
| 2 | Teste de erro da API lia o `backend/.env` real | `test_erro_exposto_pela_api_nao_contem_senha` agora faz `monkeypatch.setattr(pedidos_direto, "get_settings", lambda: _settings(erp_source="sqlserver"))`. |
| 3 | HOST e DRIVER fora do escape ODBC | Driver continua sempre entre `{}` com `}` duplicado; o valor de `SERVER` (`host,port`) passa por `_odbc_value`. Para valores comuns a string sai idêntica. Novo teste `test_escape_odbc_de_host_e_driver`. Optei por escapar em vez de rejeitar com validator, porque um validator derrubaria o Settings na subida, inclusive em modo mock. |

## Arquivos

Versionados e modificados: `backend/app/config.py`, `backend/tests/test_config.py`, `backend/.env.example`, `.env.example`, `docker-compose.yml`.
Locais, ignorados pelo git (`.gitignore:22 *.env`): `.env` e `backend/.env`.
Sem diff: `backend/Dockerfile` (mantém `msodbcsql18` + `unixodbc`), `backend/app/models.py`, `backend/alembic/`, `backend/app/erp_sync.py`.

## Validação executada

| Comando | Resultado |
|---|---|
| `backend\.venv\Scripts\python.exe -c "import pyodbc; print(pyodbc.drivers())"` (Windows) | Único driver SQL Server: `SQL Server`. **`ODBC Driver 18 for SQL Server` NÃO instalado.** |
| `python -m pytest -q` (backend) | `91 passed` |
| `npm ci` (frontend) | **Falhou com EPERM**: o dev server Vite do OTIF (`npm run dev`) estava rodando e travava `rollup.win32-x64-msvc.node`. O `npm ci` chegou a esvaziar parte do `node_modules`. Restaurei com `npm install` a partir do lockfile (`package-lock.json` sem alteração). O `npm ci` limpo exige parar o dev server antes. |
| `npm run build` (frontend) | OK (`built in 17.36s`) |
| `docker compose config --quiet` | exit 0 |
| `docker compose --env-file .env.example config --quiet` (cenário do CI) | exit 0 |
| Chaves `JUNDSOFT_*` no serviço `otif-backend` | exatamente as 8 novas; `RUN_MIGRATIONS=true`; porta `127.0.0.1:8000->8000` |
| `docker compose build` | `otif-backend:dev` e `otif-frontend:dev` buildados |
| `docker compose up -d` + `docker compose ps` | postgres, backend e frontend `running (healthy)` |
| `curl http://127.0.0.1:8000/health` | `{"status":"ok","erp_source":"mock","erp_read_mode":"direct"}` |
| `pyodbc.drivers()` dentro do backend | `['ODBC Driver 18 for SQL Server']` |
| Settings no container | `port=1433 encrypt=True trust=True driver=ODBC Driver 18 for SQL Server`; sem campos antigos; ambiente só com as 8 chaves novas |
| `docker compose down` (sem `-v`) | containers removidos; volume do Postgres preservado |

## Regressão (busca pelos 6 termos antigos)

`git grep` fora de `.agents/`: só aparecem em `backend/tests/test_config.py`, na fixture que limpa o ambiente e no teste que prova que as variáveis antigas são ignoradas. Não há referência funcional. Os `.env` locais (`.env`, `backend/.env`, `frontend/.env`) não têm chaves antigas. Os relatórios históricos `.agents/tasks/devops-fase1-*` ficaram intactos.

## .env locais (nomes das chaves apenas)

- `backend/.env`: as 8 chaves novas preenchidas, `JUNDSOFT_HOST` sem vírgula, `JUNDSOFT_PORT` numérico, `JUNDSOFT_ODBC_DRIVER=SQL Server` (o driver realmente instalado), `JUNDSOFT_ENCRYPT=true`, `JUNDSOFT_TRUST_SERVER_CERTIFICATE=true`, `CORS_ORIGINS` sem `\:`.
- `.env` (raiz, usado pelo compose): `ERP_SOURCE=mock`, as 8 chaves novas (credenciais vazias), `JUNDSOFT_ODBC_DRIVER=ODBC Driver 18 for SQL Server`, `ENCRYPT=true`, `TRUST_SERVER_CERTIFICATE=true`.
- O padrão do código e dos containers continua `ODBC Driver 18 for SQL Server`.

## Teste local de conexão ao Jundsoft (seção 13)

Só `SELECT 1`, read-only, imprimindo apenas status/SQLSTATE:

- TCP até host:porta: **alcançável**.
- Com a config atual (`driver=SQL Server`, `Encrypt=yes`, `TrustServerCertificate=yes`): **FAIL 08001**, erro de segurança SSL no handshake (`SECDoClientHandshake`). O driver legado `SQL Server` do Windows não fecha o TLS exigido pelo servidor.
- Diagnóstico com `Encrypt=no` (só em memória, sem alterar config): **FAIL 28000** (login recusado). Ou seja, sem TLS o servidor recusa as credenciais do `backend/.env`.

Conclusão: a conexão local não funciona hoje por dois motivos independentes. (1) Falta o ODBC Driver 18 no Windows para o TLS. (2) O login atual é recusado (28000). Recomendações: instalar o "Microsoft ODBC Driver 18 for SQL Server" no Windows e trocar `JUNDSOFT_ODBC_DRIVER` no `backend/.env`; conferir com o DBA o usuário somente leitura e a senha. Os defaults do código não mudaram.
