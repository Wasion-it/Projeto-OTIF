# OTIF: relatório da FASE 1 (DevOps Foundation)

A FASE 1 está implementada e foi aprovada na revisão (`devops-fase1-review.md`, veredito APPROVED, sem pontos bloqueantes). Testes, build do frontend e stack Docker foram validados de novo em 14/10/2026 para este relatório. Nenhuma regra de cálculo OTIF, query do Jundsoft, model ou migration foi alterada. **Nenhum commit, stage ou push foi feito.**

## Arquivos criados

| Arquivo | Conteúdo |
|---|---|
| `backend/Dockerfile` | Imagem `python:3.12-slim-bookworm` com msodbcsql18 + unixODBC, usuário não-root, `EXPOSE 8000`, HEALTHCHECK em `/health` e uvicorn |
| `backend/.dockerignore` | Exclui `.env*` (exceto `.env.example`), `.venv`, caches, SQLite local e testes |
| `backend/docker-entrypoint.sh` | Roda `alembic upgrade head` só com `RUN_MIGRATIONS=true` e depois faz `exec` do comando (uvicorn como PID 1) |
| `backend/tests/test_config.py` | Garante que a string de conexão do Jundsoft não muda sem `JUNDSOFT_ODBC_EXTRA` e que o extra é normalizado |
| `frontend/Dockerfile` | Multi-stage `node:20-alpine` (npm ci, npm run build) seguido de `nginxinc/nginx-unprivileged:1.27-alpine` |
| `frontend/.dockerignore` | Exclui `node_modules`, `dist`, `.env*` (exceto exemplo) |
| `frontend/nginx.conf` | Template do Nginx (copiado como `/etc/nginx/templates/default.conf.template` e processado por envsubst na subida). Serve estáticos, faz fallback de SPA para `index.html`, proxy reverso das rotas da API e gzip. Não existe outro template separado. |
| `docker-compose.yml` | Stack DEV/validação com `otif-postgres`, `otif-backend` e `otif-frontend` |
| `.env.example` (raiz) | Placeholders para o compose: Postgres, portas/bind, ERP/Jundsoft (Driver 18 + extra), migrations, frontend |
| `.github/workflows/ci.yml` | CI com pytest, build do frontend e build das imagens Docker sem push |
| `.agents/tasks/devops-fase1-report.md` | Este relatório. A pasta `.agents/tasks/` também guarda os artefatos da revisão (`devops-fase1-review.md/.json`). |

## Arquivos modificados

| Arquivo | Justificativa |
|---|---|
| `.gitignore` | Cobre `.env`, `.env.*`, `*.env` (com exceção explícita para `.env.example`), `.venv`, `venv`, `__pycache__`, `.pytest_cache` e outros caches, `node_modules`, `dist`, SQLite local (`*.db`, `*.sqlite*`, `*.db.bak`), logs e temporários |
| `.gitattributes` | Força LF em `*.sh` e `Dockerfile`. Um checkout no Windows com CRLF quebraria o `docker-entrypoint.sh` dentro do container Linux. |
| `backend/.env.example` | Documenta a nova variável opcional `JUNDSOFT_ODBC_EXTRA` |
| `backend/app/config.py` | Ver abaixo |
| `frontend/src/api.js` | `VITE_API_URL || "http://localhost:8000"` virou `VITE_API_URL ?? "http://localhost:8000"`. Com `||`, um valor vazio caía no localhost. Com `??`, o build Docker (`VITE_API_URL=""`) passa a fazer chamadas relativas na mesma origem, atendidas pelo proxy do Nginx. Sem a variável definida (dev com Vite), o comportamento continua igual. |

`backend/requirements.txt` não precisou mudar: `psycopg` e `pyodbc` já estavam nele.

### Sobre `backend/app` e `backend/alembic`

- **`backend/alembic`: nenhum arquivo foi alterado.**
- **`backend/app`: um único arquivo mudou, `backend/app/config.py`, que é configuração e não domínio.** Os arquivos de domínio (`otif.py`, `avaliacao.py`, `pedidos_direto.py`, `erp_sync.py`, `models.py`) e as queries do Jundsoft não foram tocados.
- **Por que `config.py` mudou:** dentro do container Linux é usado o *ODBC Driver 18 for SQL Server*. Ao contrário do driver "SQL Server" do Windows, ele liga `Encrypt=yes` e valida o certificado por padrão. Se o SQL Server do Jundsoft usar certificado autoassinado, a conexão falha, e antes não havia como passar `Encrypt`/`TrustServerCertificate` sem mexer no código. Por isso entrou o campo opcional `jundsoft_odbc_extra` (variável `JUNDSOFT_ODBC_EXTRA`, padrão vazio), anexado ao final de `jundsoft_conn_str`.
- **O comportamento atual foi preservado:** sem a variável, a string de conexão sai idêntica à anterior. O teste `backend/tests/test_config.py` cobre isso e cobre também a normalização de `;` nas pontas.
- `JUNDSOFT_ODBC_DRIVER` já era lido de variável de ambiente. Por isso `JUNDSOFT_ODBC_DRIVER=ODBC Driver 18 for SQL Server` funciona sem alterar código, e o compose usa esse valor como padrão.

## Decisões técnicas adotadas

- **Imagem do backend:** `python:3.12-slim-bookworm` (Debian 12), uma base estável e enxuta, com suporte oficial da Microsoft para o msodbcsql18.
- **Instalação do msodbcsql18:** repositório oficial `packages.microsoft.com/debian/12/prod`, chave em keyring dedicado (`signed-by`, sem `apt-key`), `ACCEPT_EULA=Y`, `--no-install-recommends`. `curl`/`gnupg` são removidos depois e as listas do apt são limpas. Confirmado no container: `pyodbc.drivers()` retorna `['ODBC Driver 18 for SQL Server']`.
- **psycopg:** vem do `requirements.txt` já existente (`psycopg[binary]`).
- **Usuários não-root:** no backend, o usuário `otif` com UID/GID 10001 (confirmado com `id` dentro do container). No frontend, a imagem `nginx-unprivileged` escuta na porta 8080.
- **Sem `.env` na imagem:** os `.dockerignore` excluem os `.env`. Toda a configuração chega por variáveis de ambiente.
- **Healthcheck:** no backend, `HEALTHCHECK` via `urllib` da stdlib em `GET /health`, porque não há curl na imagem final. No frontend, `wget` em `/`.
- **Entrypoint e `RUN_MIGRATIONS`:** por padrão (`false`) a imagem não roda migrations, o que é adequado para um banco de produção externo e gerenciado à parte. No compose de DEV o padrão é `true`, porque o Postgres local nasce vazio.
- **API na mesma origem via proxy reverso:** o bundle é gerado com `VITE_API_URL=""`. O Nginx encaminha as rotas da API para `BACKEND_UPSTREAM` (padrão `http://otif-backend:8000`), usando `resolver ${NGINX_RESOLVER}` (padrão `127.0.0.11`, o DNS do Docker/Swarm) para resolver o nome em runtime. Assim não há CORS entre frontend e API no container, e o frontend sobe mesmo que o backend ainda não esteja resolvível. Também é possível gerar o bundle com uma URL absoluta.
- **Compose:** `postgres:16-alpine` com volume nomeado explícito `otif_postgres_data` e healthcheck `pg_isready`. O backend usa `depends_on: service_healthy` no Postgres e o frontend usa `service_healthy` no backend. Todos os serviços têm `restart: unless-stopped` e rotação de log `json-file` 20m/3, aplicada por âncora YAML. O compose exige `POSTGRES_USER`/`POSTGRES_PASSWORD` no `.env` (não há senha no arquivo).
- **`DATABASE_URL`:** montada como `postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@otif-postgres:5432/${POSTGRES_DB}`. Pode ser sobrescrita inteira no `.env`, o que serve para senhas com caracteres reservados, que exigem URL-encoding.
- **Exposição da API:** o backend publica só em `127.0.0.1` (`BACKEND_BIND`), porque a API ainda não tem autenticação. O acesso pela rede passa pelo frontend na porta 8080. O Postgres não publica porta no host.
- **Tags:** o compose usa `otif-backend:dev` e `otif-frontend:dev`, e o CI usa `ci-${{ github.sha }}`. A tag `latest` não é usada em lugar nenhum.
- **CI:** dispara em `pull_request` para `main`/`develop` e em `push` para `develop`, com `permissions: contents: read` e concurrency com cancel-in-progress. Tem três jobs: backend (Python 3.12 + unixODBC + pytest), frontend (Node 20, `npm ci`, `npm run build`) e docker (`docker compose config` usando `.env.example`, mais build das duas imagens com `push: false` e cache GHA). Não há publish em registry nem deploy.

## Resultado dos testes

Executado em `backend/` com o `.venv` do projeto (o Python global da máquina não tem pytest instalado):

```
> .\.venv\Scripts\python.exe -m pytest -q
........................................................................ [ 98%]
.                                                                        [100%]
73 passed in 1.33s
```

## Resultado do build do frontend

`npm ci` falhou na pasta `frontend/` do workspace com `EPERM: unlink ...\node_modules\@rollup\rollup-win32-x64-msvc\rollup.win32-x64-msvc.node`. Havia um `npm run dev` (Vite) rodando e travando o binário nativo do rollup. Ver "Problemas encontrados".

Para validar sem derrubar o dev server, o frontend foi copiado (sem `node_modules`/`dist`) para uma pasta temporária, onde os dois comandos rodaram com sucesso. A cópia temporária foi removida depois.

```
> npm ci            -> concluído (o npm audit mostrou avisos em dependências de dev;
                       `npm audit --omit=dev` = found 0 vulnerabilities)
> npm run build
dist/assets/index-D0XKPqSD.css   27.82 kB │ gzip:  5.73 kB
dist/assets/index-Hg5WXc-l.js   254.95 kB │ gzip: 77.27 kB
✓ built in 3.19s
```

O build também roda dentro do `frontend/Dockerfile` (stage `node:20-alpine`), que passou (ver abaixo).

## Resultado dos builds Docker

Docker Engine 28.5.1, `.env` local na raiz (ignorado pelo git) copiado de `.env.example`.

```
> docker compose config --quiet      -> exit 0
> docker compose build               -> exit 0
   otif-backend:dev   Built   (318 MB)
   otif-frontend:dev  Built   (75.1 MB)
> docker compose up -d
   Container otif-otif-postgres-1  Healthy
   Container otif-otif-backend-1   Healthy
> docker compose ps
NAME                   IMAGE                SERVICE         STATUS                        PORTS
otif-otif-backend-1    otif-backend:dev     otif-backend    Up About a minute (healthy)   127.0.0.1:8000->8000/tcp
otif-otif-frontend-1   otif-frontend:dev    otif-frontend   Up 56 seconds (healthy)       0.0.0.0:8080->8080/tcp
otif-otif-postgres-1   postgres:16-alpine   otif-postgres   Up About a minute (healthy)   5432/tcp

> curl http://localhost:8000/health          (backend direto)
{"status":"ok","erp_source":"mock","erp_read_mode":"direct"} [HTTP 200]
> curl http://localhost:8080/health          (via proxy Nginx)
{"status":"ok","erp_source":"mock","erp_read_mode":"direct"} [HTTP 200]
> curl http://localhost:8080/                (SPA)
[HTTP 200]
```

Log do backend na subida: `[entrypoint] RUN_MIGRATIONS=true -> alembic upgrade head`, depois `Context impl PostgresqlImpl`, depois `Uvicorn running on http://0.0.0.0:8000`. No Postgres, `alembic_version` = `d9e0f1a2b3c4`, ou seja, as migrations foram aplicadas no PostgreSQL. O volume já existia de uma subida anterior, então nesta execução o alembic não tinha revisões pendentes.

A stack **continua rodando** depois da validação. Para parar: `docker compose down`. Para apagar também o banco de DEV: `docker compose down -v`.

## Problemas encontrados

1. **`node_modules` do frontend local ficou incompleto (efeito colateral da validação).** O `npm ci` na pasta do workspace apagou a maior parte de `frontend/node_modules` e depois falhou no binário do rollup travado pelo dev server em execução. Agora `node_modules/vite` não existe mais. O dev server atual segue rodando a partir da memória, mas não vai reiniciar. **Para corrigir:** pare o `npm run dev` e rode `npm ci` em `frontend/`. Isso não afeta o repositório versionado nem as imagens Docker.
2. O Python global da máquina (3.10, 32-bit) não tem pytest. Os testes rodaram pelo `backend/.venv`. O CI usa Python 3.12, igual à imagem.
3. Nenhum outro problema nos builds ou nos healthchecks.

## Pendências

- **Arquivos sensíveis versionados:** `git ls-files` mostra só `backend/.env.example` e `frontend/.env.example` entre os padrões sensíveis. Não há `.env`, SQLite, `node_modules`, `dist` ou `__pycache__` rastreados, e nenhum `git rm --cached` foi necessário. Ainda assim, vale revisar o histórico do git caso algum `.env` real tenha sido commitado no passado.
- **Compatibilidade das migrations com PostgreSQL:** `alembic upgrade head` rodou sem erro num Postgres vazio, mas as migrations e o app foram escritos e testados sobretudo com SQLite. Os 73 testes do pytest rodam em SQLite. Antes da produção, vale rodar os fluxos principais (sync ERP, cálculo OTIF) contra o Postgres e acompanhar diferenças de tipos, datas e collation.
- **ODBC Driver 18 (Encrypt/TrustServerCertificate):** com certificado autoassinado no SQL Server do Jundsoft, use `JUNDSOFT_ODBC_EXTRA=Encrypt=yes;TrustServerCertificate=yes`. Em produção, prefira um certificado válido. Outro ponto: o OpenSSL 3 do Debian 12 recusa TLS 1.0/1.1, então um SQL Server antigo e sem patch pode falhar no handshake. Confirme a versão do servidor antes de usar `ERP_SOURCE=sqlserver` no container. A conexão real com o Jundsoft **não foi testada** no container (a validação usou `ERP_SOURCE=mock`).
- **Registry e tags para as próximas fases:** publicar em `registry.wasion.com.br` com tags imutáveis (SHA do commit e/ou semver), nunca `latest` como estratégia de produção. Essa etapa de publish ainda não existe no CI, por escopo.
- **Deploy e autenticação:** não há deploy de produção (Docker Swarm), stack de PROD nem autenticação, também por escopo. Enquanto não houver auth, a API não deve ser exposta diretamente na rede.
- **pytest na imagem de runtime:** o `backend/Dockerfile` instala o `requirements.txt` inteiro, que inclui `pytest==8.3.4`. Numa próxima fase, separar um `requirements-dev.txt`. O Faker permanece, porque `erp_sync.py` o usa em runtime.

## Saída do `git status`

```
On branch main
Your branch is up to date with 'origin/main'.
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   .gitattributes
	modified:   .gitignore
	modified:   backend/.env.example
	modified:   backend/app/config.py
	modified:   frontend/src/api.js
Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.agents/tasks/
	.env.example
	.github/
	backend/.dockerignore
	backend/Dockerfile
	backend/docker-entrypoint.sh
	backend/tests/test_config.py
	docker-compose.yml
	frontend/.dockerignore
	frontend/Dockerfile
	frontend/nginx.conf
no changes added to commit (use "git add" and/or "git commit -a")
```

(O git também emitiu avisos `LF will be replaced by CRLF` para os cinco arquivos modificados. Isso vem do `core.autocrlf` local e não afeta o conteúdo.)

---

**Nada foi commitado, adicionado ao stage ou enviado.** Revise o diff (`git diff` e os arquivos não rastreados acima) antes de commitar. Decida também se `.agents/tasks/` deve ir para o repositório ou para o `.gitignore`.
