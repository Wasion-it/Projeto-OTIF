# Containerização e CI iniciais do OTIF (FASE 1, revisão v2)

Segunda passada sobre a FASE 1 (Dockerfiles do backend e do frontend, `docker-compose.yml` de DEV, `.env.example` na raiz, `.github/workflows/ci.yml`, `.gitignore`/`.gitattributes`). Os seis pontos da v1 foram tratados. A string de conexão do Jundsoft agora aceita `JUNDSOFT_ODBC_EXTRA`, com teste. O compose permite sobrescrever `DATABASE_URL` e documenta o URL-encoding, usa `RUN_MIGRATIONS=true` por padrão em DEV e liga a API em `127.0.0.1`. O Nginx resolve o backend em runtime. Nenhum arquivo de domínio, model, query ou migration foi tocado.

Watch for: `backend/app/config.py` foi alterado (só configuração, padrão vazio, comportamento atual preservado), e o relatório final ao usuário precisa justificar isso. A mensagem final do coder não chegou a esta etapa, então as saídas de pytest/build/compose não puderam ser lidas aqui. Os artefatos em disco indicam que a validação rodou, mas o relatório ao usuário precisa trazer as saídas reais.

**Verdict**: APPROVED

## High-level view

A única mudança fora da infra no backend é `config.py`. O novo campo `jundsoft_odbc_extra` (padrão `""`) é anexado ao final de `jundsoft_conn_str` sem `;` sobrando. Sem o campo, a string continua idêntica à anterior, e `tests/test_config.py` cobre exatamente esse caso. Nenhuma query do Jundsoft mudou. Com isso o Driver 18 funciona contra um SQL Server com certificado autoassinado usando `Encrypt=yes;TrustServerCertificate=yes`, repassado pelo compose e documentado nos dois `.env.example`.

No compose, `DATABASE_URL` usa `${DATABASE_URL:-postgresql+psycopg://…@otif-postgres:5432/…}`, então a URL completa pode ser sobrescrita quando a senha tiver caracteres reservados. As migrations rodam por padrão em DEV porque o Postgres local nasce vazio. O backend publica só em `${BACKEND_BIND:-127.0.0.1}`, e o acesso pela rede passa pelo proxy do frontend. Os demais requisitos continuam atendidos: nomes dos serviços, `postgres:16-alpine` com volume nomeado e `pg_isready`, `depends_on` com `service_healthy`, `restart: unless-stopped` e rotação json-file 20m/3 via âncora em todos os serviços. Tags são `:dev`, não há `latest` e não há nada de Swarm.

No Nginx, as rotas da API usam `resolver ${NGINX_RESOLVER} valid=10s` com `proxy_pass` via variável. `NGINX_RESOLVER=127.0.0.11` e `BACKEND_UPSTREAM` têm padrão no Dockerfile, então o envsubst do entrypoint oficial sempre encontra as duas definidas. Como a variável não tem URI, o caminho e a query original passam sem alteração. O SPA continua com hash routing, então os prefixos da API não colidem com as rotas do cliente.

O backend (`python:3.12-slim-bookworm`, keyring `signed-by`, `ACCEPT_EULA=Y`, apt limpo, UID 10001, `EXPOSE 8000`, HEALTHCHECK com `urllib` em `/health`, entrypoint com alembic condicionado a `RUN_MIGRATIONS=true` + `exec`) e o frontend (`node:20-alpine` → `nginx-unprivileged:1.27-alpine` na 8080, `npm ci` + `npm run build`, sem dev server) estão iguais à v1. O CI tem exatamente os gatilhos pedidos, `contents: read`, concurrency com cancel-in-progress, pytest, build do frontend e builds Docker com `push: false` e tags `ci-${sha}`. Não há publish nem deploy. O `.gitignore` cobre todos os padrões. `git check-ignore` confirma que os `.env` locais (raiz, backend, frontend) estão ignorados e que `.env.example` continua versionável. `git ls-files` não mostra arquivo sensível versionado, e nenhum `git rm --cached` foi feito.

<details>
<summary>Issues (3)</summary>

1. **Justificar a alteração em `config.py` no relatório final (non-blocking, confirmed)**: o pedido exige explicar mudanças fora da infra. A mudança é estritamente de container (parâmetros TLS do Driver 18), tem padrão vazio e não altera a string atual. O relatório precisa dizer isso e citar `tests/test_config.py`.
2. **Saídas reais de validação no relatório ao usuário (non-blocking, likely)**: as imagens `otif-backend:dev`/`otif-frontend:dev` foram reconstruídas às 09:23, depois da última edição (09:16), e o volume `otif_postgres_data` existe. Isso indica que `build` e `up` rodaram. A stack está parada agora, então não confirmei `/health`. O relatório final precisa trazer as saídas de pytest, `npm ci`/`npm run build`, `docker compose config/build/up -d/ps` e `curl http://localhost:8000/health`, além de `curl http://localhost:8080/health` para validar o proxy.
3. **pytest instalado na imagem de runtime (non-blocking, confirmed)**: o Dockerfile instala o `requirements.txt` inteiro, que inclui `pytest==8.3.4`, uma dependência só de teste. Isso contraria levemente "instalar somente dependências necessárias". Numa próxima fase, separar um `requirements-dev.txt` ou filtrar o pytest no build. Faker não entra nesse caso, porque é usado em runtime por `erp_sync.py`.

</details>

<details>
<summary>Details</summary>

### Jundsoft: parâmetros extras do ODBC

`extra = self.jundsoft_odbc_extra.strip().strip(";")` normaliza `;` nas pontas, e o teste cobre uma entrada com `;` no início e no fim. O valor entra cru na string ODBC. Se alguém colocar `DRIVER=` ou `SERVER=` ali, sobrescreve a configuração, mas o valor vem do operador por variável de ambiente, não do usuário final, então não há nova superfície de ataque. Um ponto continua em aberto e não depende do código: o OpenSSL 3 do Debian 12 recusa TLS 1.0/1.1, então um SQL Server antigo e sem patch do Jundsoft falharia no handshake mesmo com `TrustServerCertificate=yes` (possible). Vale confirmar a versão do servidor antes de ligar `ERP_SOURCE=sqlserver` no container.

### Rede e proxy

```
browser ──► otif-frontend (nginx :8080) ──/health,/pedidos,...──► otif-backend (127.0.0.1:8000 no host) ──► otif-postgres (sem porta no host)
                     └── /, /assets → dist estático                    └── pyodbc (Driver 18 + ODBC_EXTRA) ──► Jundsoft (externo, RO)
```

Com `proxy_pass` via variável, o Nginx resolve o nome só pelo resolver configurado, não pelo `/etc/hosts`. O DNS embutido do Docker resolve `otif-backend` direto, então isso funciona no compose e no Swarm. Se um dia o backend ficar fora da rede Docker, `NGINX_RESOLVER` precisa apontar para um DNS que conheça esse host.

</details>

<details>
<summary>File map</summary>

- `backend/Dockerfile`, `backend/docker-entrypoint.sh`, `backend/.dockerignore`: imagem slim com msodbcsql18, não-root, HEALTHCHECK, alembic opcional.
- `backend/app/config.py`: novo `jundsoft_odbc_extra` anexado à string de conexão (padrão vazio).
- `backend/tests/test_config.py`: string sem extra fica inalterada; com extra, normaliza `;`.
- `backend/.env.example`: documenta `JUNDSOFT_ODBC_EXTRA`.
- `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/.dockerignore`: node → nginx-unprivileged, proxy com resolver em runtime, gzip, fallback de SPA.
- `frontend/src/api.js`: `||` → `??` para aceitar base relativa.
- `docker-compose.yml`: stack de DEV, `DATABASE_URL` sobrescrevível, migrations por padrão, API em loopback.
- `.env.example`: placeholders de Postgres, portas/bind, ERP/Jundsoft (Driver 18 + extra), frontend.
- `.github/workflows/ci.yml`: pytest, build do frontend, build das imagens sem push.
- `.gitignore`, `.gitattributes`: padrões de segredos/caches/SQLite/temporários e LF para `*.sh`/`Dockerfile`.

Diff completo: `git -C c:\Projects\Projeto-OTIF diff` + arquivos não rastreados de `git status`.

</details>
