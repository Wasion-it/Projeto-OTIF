# Plano: refatoração da configuração Jundsoft (HOST/PORT/DATABASE/USERNAME/PASSWORD)

Repositório: `c:\Projects\Projeto-OTIF` (Windows, pwsh). Branch atual: `main`, working tree limpo (HEAD `b35e12f`).
Escopo: só configuração, exemplos de env, compose e testes. Ficam fora regras de negócio, queries SQL (`_SQL_JUNDSOFT`), cálculo OTIF, models, migrations e autenticação. **Não fazer commit.** Valores de `.env` nunca aparecem em saída, log ou relatório; refira-se a eles só pelo nome da chave.

---

## 0. Descobertas da investigação (já verificadas)

### 0.1 Inventário de referências ao formato antigo e aos campos Jundsoft
Busca em todo o repositório, excluindo `node_modules`, `.venv`, `dist`, `.git` e `__pycache__`:

| Arquivo | Linha(s) | Referência | Ação |
|---|---|---|---|
| `backend/app/config.py` | 36-58 | campos `jundsoft_host` (host,porta juntos), `jundsoft_db`, `jundsoft_user`, `jundsoft_password`, `jundsoft_odbc_driver` (padrão `"SQL Server"`), `jundsoft_odbc_extra`, propriedade `jundsoft_conn_str` | **Reescrever** (item 1) |
| `backend/tests/test_config.py` | 7-31 | `jundsoft_host="host,1433"`, `jundsoft_db`, `jundsoft_user`, `jundsoft_odbc_extra`, 2 testes da string antiga | **Reescrever** (item 2) |
| `backend/app/erp_sync.py` | 242 | `pyodbc.connect(settings.jundsoft_conn_str, timeout=15, readonly=True)` | Nenhuma: o único consumidor usa só a propriedade, que mantém o nome |
| `backend/.env.example` | 22-30 | comentários `JUNDSOFT_HOST=10.10.1.5,52702`, `JUNDSOFT_DB`, `JUNDSOFT_USER`, `JUNDSOFT_ODBC_DRIVER=SQL Server`, `JUNDSOFT_ODBC_EXTRA` | **Reescrever bloco** (item 3) |
| `.env.example` (raiz) | 37-47 | `JUNDSOFT_HOST=`, `JUNDSOFT_DB=`, `JUNDSOFT_USER=`, `JUNDSOFT_PASSWORD=`, `JUNDSOFT_ODBC_DRIVER=ODBC Driver 18 for SQL Server`, `JUNDSOFT_ODBC_EXTRA=` | **Reescrever bloco** (item 3) |
| `docker-compose.yml` | 58-64 | `JUNDSOFT_HOST`, `JUNDSOFT_DB:-jundsoft`, `JUNDSOFT_USER`, `JUNDSOFT_PASSWORD`, `JUNDSOFT_ODBC_DRIVER`, `JUNDSOFT_ODBC_EXTRA` | **Atualizar** (item 4) |
| `backend/Dockerfile` | 6-7, 19-30 | comentário e instalação de `msodbcsql18` + `unixodbc` | **Sem alteração** (só verificar) |
| `backend/docker-entrypoint.sh` | - | sem referência a Jundsoft | **Sem alteração** |
| `.github/workflows/ci.yml` | - | sem referência a `JUNDSOFT_*`. O job docker faz `cp .env.example .env && docker compose config --quiet` | **Sem alteração**. Continua válido porque o compose novo usa defaults não vazios (item 4) |
| `README.md` | 145 | texto genérico "variáveis `JUNDSOFT_*` com usuário somente leitura" | **Sem alteração** (continua correto) |
| `backend/requirements.txt` | 15 | comentário "driver legado SQL Server" no Windows | **Sem alteração** (continua correto para o Windows local) |
| `.agents/tasks/devops-fase1-*.md/json` | vários | citam `JUNDSOFT_ODBC_EXTRA` e `jundsoft_odbc_extra` | **Não tocar**: são relatórios históricos da FASE 1, não código funcional |
| `.env` (raiz, ignorado) | - | chaves antigas `JUNDSOFT_DB`, `JUNDSOFT_USER`, `JUNDSOFT_ODBC_EXTRA`, todas vazias. `JUNDSOFT_HOST` e `JUNDSOFT_PASSWORD` vazios. `ERP_SOURCE=mock` | **Migrar chaves** (item 5) |
| `backend/.env` (ignorado) | - | **já está no formato novo**: `JUNDSOFT_HOST` (sem vírgula), `JUNDSOFT_PORT` (numérico), `JUNDSOFT_DATABASE`, `JUNDSOFT_USERNAME`, `JUNDSOFT_PASSWORD`, `JUNDSOFT_ODBC_DRIVER=ODBC Driver 18 for SQL Server`, `JUNDSOFT_ENCRYPT=true`, `JUNDSOFT_TRUST_SERVER_CERTIFICATE=true`. `CORS_ORIGINS` sem `\:`. Chave obsoleta `PRAZO_ENTREGA_DIAS` (ignorada por `extra="ignore"`) | **Só ajustar o driver** (item 5) |

`.kiro/` e `semantic-review/` não têm nenhuma referência.

### 0.2 Consumidores e semântica de "Jundsoft configurado"
- `erp_sync._buscar_pedidos_sqlserver` (linha 239-242) é o **único** ponto que lê configuração Jundsoft, e lê apenas `settings.jundsoft_conn_str`.
- `pedidos_direto.py`, `sync.py`, `database.py`, `main.py`, `queries.py`, `parametros.py` e `routers/*.py` usam `get_settings()` só para `erp_source`, `erp_read_mode`, cache/backoff, `database_url`, `cors_origins`, `meta_otif` e `dias_alerta_prazo`. **Ninguém usa `jundsoft_host` para decidir se o Jundsoft está configurado.** A decisão é sempre `erp_source == "sqlserver"`, então não há semântica a preservar além do nome `jundsoft_conn_str`.

### 0.3 Logs e vazamento de segredos
- Nenhum `print` ou `logger` imprime `settings`, a conn str ou a senha. `erp_sync` só faz `logger.warning` com PV01_ID e datas. `pedidos_direto` loga a contagem de pedidos sem PV01_ID. `seed.py` e `sync.py` imprimem só contagens.
- `pedidos_direto._dados_jund` converte qualquer falha em `ErpIndisponivelError("Nao foi possivel consultar o JUND neste momento.")` com mensagem fixa (`raise ... from exc`). O handler em `main.py` devolve só `str(exc)` dessa mensagem fixa. `/health` expõe apenas `erp_source` e `erp_read_mode`.
- **Risco latente:** o `repr()` padrão do pydantic `BaseSettings` inclui todos os campos. Se alguém fizer `logger.info(settings)`, a senha vaza. Mitigação no item 1: `repr=False` no campo da senha. É sanitização, não regra de negócio.

### 0.4 Ambiente local (Windows)
- `backend\.venv\Scripts\python.exe` é Python 3.10.11 (32 bit), com pydantic 2.10.3, pydantic-settings 2.6.1 e pyodbc 5.2.0.
- `pyodbc.drivers()` local **NÃO lista** `ODBC Driver 18 for SQL Server`. O único driver SQL Server instalado é o legado `SQL Server`.
- Consequência: hoje o `backend/.env` aponta para um driver que não existe nesta máquina, e uma conexão local falharia com "Data source name not found". Pela regra 5 do pedido, o `.env` local passa a usar `SQL Server` (item 5), e o padrão do código e dos containers continua `ODBC Driver 18 for SQL Server`. Isso precisa constar no relatório final.
- Docker 28.5.1 disponível. npm disponível.
- `git check-ignore -v .env backend/.env` mostra os dois ignorados pela regra `*.env` em `.gitignore:22`. `git ls-files` só rastreia `.env.example`, `backend/.env.example` e `frontend/.env.example`.
- Baseline: `python -m pytest -q` no backend tem **73 passed**.

---

## Decisões de design (com justificativa)

1. **`jundsoft_password` vira `str = Field(default="", repr=False)`.** O tipo continua `str` e o padrão `""`, como pedido, mas a senha sai do `repr()` e do `str()` do Settings. Foi preferido a `SecretStr` porque não muda o tipo nem o acesso. Os outros campos ficam exatamente como na especificação.
2. **Formato exato da string** (com `;` final, como no pedido):
   `DRIVER={<driver>};SERVER=<host>,<port>;DATABASE=<database>;UID=<username>;PWD=<password>;Encrypt=<yes|no>;TrustServerCertificate=<yes|no>;`
   Os booleanos são mapeados por um helper `_yes_no(v: bool) -> str` ("yes"/"no"). Nada fica hardcoded: os dois valores vêm dos campos.
3. **Escape ODBC de valores** (helper `_odbc_value`). Se DATABASE, UID ou PWD tiverem `;`, `{`, `}` ou espaço nas pontas, o valor vai entre `{}` e cada `}` vira `}}`, conforme a regra ODBC. Sem esses caracteres o valor sai cru, então os casos comuns ficam exatamente no formato pedido. Isso impede que uma senha com `;` corrompa a string ou injete chaves. Não é regra de negócio.
4. **HOST é usado como veio, só com `.strip()`.** A porta é sempre anexada (`SERVER=host,port`). Não haverá compatibilidade com o formato antigo `host,porta` dentro de `JUNDSOFT_HOST`, porque o pedido manda substituir esse formato. O comentário do campo deixa claro que o host não leva porta.
5. **Sem validação extra nem exceção quando o host está vazio.** Hoje também não há, e o modo mock não usa a string.
6. **Compose com defaults não vazios** para campos tipados (`JUNDSOFT_PORT:-1433`, `JUNDSOFT_ENCRYPT:-true`, `JUNDSOFT_TRUST_SERVER_CERTIFICATE:-false`, `JUNDSOFT_DATABASE:-JUNDSOFT`). Uma string vazia em `int`/`bool` derrubaria o Settings na subida do container. `:-` cobre tanto variável ausente quanto vazia. Esse cuidado é necessário porque o CI usa `.env.example` como `.env`.

---

# Implementation Plan

- [ ] 1. Reescrever o bloco Jundsoft de `Settings` em `backend/app/config.py`.
      - Importar `Field` de `pydantic`.
      - Substituir os campos 36-45 por exatamente:
        ```python
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
        ```
      - Remover `jundsoft_db`, `jundsoft_user` e `jundsoft_odbc_extra`, junto com os comentários de `JUNDSOFT_ODBC_EXTRA`.
      - Adicionar funções de módulo privadas: `_yes_no(valor: bool) -> str` e `_odbc_value(valor: str) -> str` (decisão 3).
      - Reescrever `jundsoft_conn_str`, mantendo o nome e a docstring, e acrescentar o aviso "contem a senha: nunca logar":
        ```python
        return (
            f"DRIVER={{{self.jundsoft_odbc_driver}}};"
            f"SERVER={self.jundsoft_host.strip()},{self.jundsoft_port};"
            f"DATABASE={_odbc_value(self.jundsoft_database)};"
            f"UID={_odbc_value(self.jundsoft_username)};"
            f"PWD={_odbc_value(self.jundsoft_password)};"
            f"Encrypt={_yes_no(self.jundsoft_encrypt)};"
            f"TrustServerCertificate={_yes_no(self.jundsoft_trust_server_certificate)};"
        )
        ```
      - Não mexer em `model_config`, nos outros campos nem em `get_settings`.
      Files: `backend/app/config.py`
      Verify: `cd backend; .\.venv\Scripts\python.exe -c "from app.config import Settings; s=Settings(_env_file=None, jundsoft_host='h', jundsoft_port=1, jundsoft_username='u', jundsoft_password='x'); print(s.jundsoft_conn_str.replace('PWD=x','PWD=***'))"` imprime `DRIVER={ODBC Driver 18 for SQL Server};SERVER=h,1;DATABASE=JUNDSOFT;UID=u;PWD=***;Encrypt=yes;TrustServerCertificate=no;`. Nesse ponto os 2 testes antigos de `test_config.py` falham, como esperado, e são substituídos no item 2.

- [ ] 2. Reescrever `backend/tests/test_config.py` com testes isolados do `.env` real e sem rede (depende do item 1).
      - Fixture `autouse` `_limpa_env(monkeypatch)`: `monkeypatch.delenv(k, raising=False)` para todas as chaves `JUNDSOFT_*` (as 8 novas e as 3 antigas). Assim nenhuma variável do sistema ou do shell contamina os testes.
      - Helper `_settings(**kw)` que chama `Settings(_env_file=None, **base)`, com base `jundsoft_host="10.10.1.5"`, `jundsoft_port=52702`, `jundsoft_database="JUNDSOFT"`, `jundsoft_username="otif_readonly"`, `jundsoft_password="S3nh@Fict1cia"` (fictícia) e `jundsoft_odbc_driver="ODBC Driver 18 for SQL Server"`.
      - Helper `_partes(conn_str) -> dict` que faz split por `;`, descarta itens vazios e faz split por `=` só no primeiro `=`.
      - Testes, um por requisito:
        1. `test_defaults_seguros`: `Settings(_env_file=None)` com `port == 1433`, `database == "JUNDSOFT"`, driver `"ODBC Driver 18 for SQL Server"`, `encrypt is True`, `trust_server_certificate is False`, `host == username == password == ""`. A string contém `Encrypt=yes` e `TrustServerCertificate=no`.
        2. `test_host_e_port_separados_geram_server_host_virgula_port`: `_partes(...)["SERVER"] == "10.10.1.5,52702"` e o campo `jundsoft_host` não contém `,`.
        3. `test_porta_customizada`: `jundsoft_port=14330` gera `SERVER=10.10.1.5,14330`. Com `jundsoft_port` omitido, gera `SERVER=10.10.1.5,1433`.
        4. `test_database_e_uid_corretos`: `DATABASE == "JUNDSOFT"` e `UID == "otif_readonly"`. Com `jundsoft_database="OUTRO"`, gera `DATABASE=OUTRO`.
        5. `test_driver_entre_chaves`: a string começa com `DRIVER={ODBC Driver 18 for SQL Server};`. Com `jundsoft_odbc_driver="SQL Server"`, começa com `DRIVER={SQL Server};`.
        6. `test_encrypt_true_yes` / `test_encrypt_false_no` (parametrizado): `Encrypt=yes` e `Encrypt=no`.
        7. `test_trust_true_yes` / `test_trust_false_no` (parametrizado): `TrustServerCertificate=yes` e `TrustServerCertificate=no`.
        8. `test_string_completa_formato_exato`: igualdade exata com `"DRIVER={ODBC Driver 18 for SQL Server};SERVER=10.10.1.5,52702;DATABASE=JUNDSOFT;UID=otif_readonly;PWD=S3nh@Fict1cia;Encrypt=yes;TrustServerCertificate=no;"`.
        9. `test_env_vars_strings_parseadas` (parametrizado em `("true","yes")`, `("false","no")`, `("1","yes")`, `("0","no")`): `monkeypatch.setenv` para `JUNDSOFT_HOST`, `JUNDSOFT_PORT="52702"`, `JUNDSOFT_DATABASE`, `JUNDSOFT_USERNAME`, `JUNDSOFT_PASSWORD`, `JUNDSOFT_ODBC_DRIVER`, `JUNDSOFT_ENCRYPT` e `JUNDSOFT_TRUST_SERVER_CERTIFICATE`, seguido de `Settings(_env_file=None)`. Confirma `jundsoft_port == 52702` (int), os booleanos e as partes `Encrypt` e `TrustServerCertificate` esperadas.
        10. `test_variaveis_antigas_sao_ignoradas`: com `JUNDSOFT_DB`, `JUNDSOFT_USER` e `JUNDSOFT_ODBC_EXTRA="TrustServerCertificate=yes"` no ambiente, o Settings não tem esses atributos (`not hasattr(s, "jundsoft_db")` etc.) e a string continua com `TrustServerCertificate=no` (nada é anexado).
        11. `test_escape_odbc_de_senha_com_ponto_e_virgula`: `jundsoft_password="a;b}c"` gera `PWD={a;b}}c}` e `_partes` continua com 7 chaves (sem injeção).
        12. `test_senha_nao_aparece_em_repr`: `"S3nh@Fict1cia" not in repr(s)` e `not in str(s)`.
        13. `test_senha_nao_e_logada_na_falha_de_conexao(monkeypatch, caplog)`: `caplog.set_level(logging.DEBUG)`. Cria um módulo falso `types.ModuleType("pyodbc")` cujo `connect(conn_str, **kw)` guarda os argumentos e levanta `RuntimeError("falha simulada de conexao")`, e o instala com `monkeypatch.setitem(sys.modules, "pyodbc", fake)`. Em seguida faz `monkeypatch.setattr(erp_sync, "get_settings", lambda: _settings(erp_source="sqlserver"))` e chama `erp_sync.buscar_pedidos_erp(meses=1)` dentro de `pytest.raises(RuntimeError)`. Confirma que a senha não aparece em `caplog.text` nem em `str(excinfo.value)`, e que `connect` recebeu `readonly=True` e uma string com `SERVER=10.10.1.5,52702`. Nada conecta ao Jundsoft real.
        14. `test_erro_exposto_pela_api_nao_contem_senha(monkeypatch, caplog)`: zera o cache de `pedidos_direto` (`monkeypatch.setattr` para `_cache_dados=None`, `_cache_em=0.0`, `_cache_erro=None`, `_cache_erro_em=0.0`), faz `monkeypatch.setattr(pedidos_direto, "buscar_pedidos_erp", ...)` levantar `RuntimeError(conn_str_com_senha)` (pior caso) e chama `pedidos_direto._dados_jund(force_refresh=True, strict_refresh=True)`. Espera `ErpIndisponivelError` cujo `str()` não contém a senha, e `caplog.text` também não.
      - Os testes nunca imprimem a conn str nem a senha (sem `print`). Em falha, as asserções comparam só pedaços.
      Files: `backend/tests/test_config.py`
      Verify: `cd backend; .\.venv\Scripts\python.exe -m pytest -q tests/test_config.py` com todos passando. Depois `.\.venv\Scripts\python.exe -m pytest -q` com a suíte inteira verde (73 menos 2 antigos mais os novos, sem falhas).

- [ ] 3. Atualizar os exemplos versionados `backend/.env.example` e `.env.example` (raiz).
      - `backend/.env.example`: trocar o bloco das linhas 22-30 pelas chaves abaixo, **descomentadas** e com valores de exemplo (um `JUNDSOFT_PORT` vazio quebraria o parse de `int` se alguém copiar o arquivo e ativar). Isso é seguro porque `ERP_SOURCE=mock` continua sendo o padrão do arquivo:
        ```
        # --- Conexao READ-ONLY com o Jundsoft (apenas quando ERP_SOURCE=sqlserver) ---
        # A aplicacao deve usar um usuario DEDICADO e SOMENTE LEITURA.
        # Nao utilize conta administrativa (ex.: sa) em producao.
        # Host e porta sao separados; a aplicacao monta SERVER=<host>,<porta>.
        JUNDSOFT_HOST=db-jundsoft.exemplo.local
        JUNDSOFT_PORT=52702
        JUNDSOFT_DATABASE=JUNDSOFT
        JUNDSOFT_USERNAME=otif_readonly
        JUNDSOFT_PASSWORD=troque_aqui
        # Nome exato do driver em pyodbc.drivers(). Container Linux: ODBC Driver 18.
        # No Windows sem o Driver 18 instalado, use o driver existente (ex.: SQL Server).
        JUNDSOFT_ODBC_DRIVER=ODBC Driver 18 for SQL Server
        # Encrypt=yes/no e TrustServerCertificate=yes/no na string de conexao.
        # Defaults da aplicacao: ENCRYPT=true, TRUST_SERVER_CERTIFICATE=false.
        # TRUST_SERVER_CERTIFICATE=true e aceitavel TEMPORARIAMENTE em ambiente
        # interno com certificado nao confiavel (autoassinado). Com certificado
        # confiavel, use JUNDSOFT_TRUST_SERVER_CERTIFICATE=false.
        JUNDSOFT_ENCRYPT=true
        JUNDSOFT_TRUST_SERVER_CERTIFICATE=true
        ```
        Remover as linhas `JUNDSOFT_DB`, `JUNDSOFT_USER`, `JUNDSOFT_ODBC_EXTRA` e a menção a `10.10.1.5,52702`. Manter `CORS_ORIGINS` como está (URLs normais, sem `\:`).
      - `.env.example` (raiz): trocar as linhas 37-47 pelo mesmo conjunto de chaves e comentários. Valores: `JUNDSOFT_HOST=db-jundsoft.exemplo.local`, `JUNDSOFT_PORT=52702`, `JUNDSOFT_DATABASE=JUNDSOFT`, `JUNDSOFT_USERNAME=otif_readonly`, `JUNDSOFT_PASSWORD=troque_aqui`, `JUNDSOFT_ODBC_DRIVER=ODBC Driver 18 for SQL Server`, `JUNDSOFT_ENCRYPT=true`, `JUNDSOFT_TRUST_SERVER_CERTIFICATE=true`. Manter o comentário "Driver disponivel na imagem Linux do backend." e `ERP_SOURCE=mock`. Remover `JUNDSOFT_DB`, `JUNDSOFT_USER` e `JUNDSOFT_ODBC_EXTRA` e os comentários correspondentes.
      Files: `backend/.env.example`, `.env.example`
      Verify: `Select-String -Path backend\.env.example,.env.example -Pattern 'JUNDSOFT_(DB|USER|ODBC_EXTRA)\b'` sem resultado (parte da regressão do item 6). `cd backend; .\.venv\Scripts\python.exe -c "from app.config import Settings; s=Settings(_env_file='.env.example'); print(s.jundsoft_port, s.jundsoft_encrypt, s.jundsoft_trust_server_certificate)"` imprime `52702 True True`, ou seja, o exemplo faz parse sem erro.

- [ ] 4. Atualizar `docker-compose.yml` (serviço `otif-backend`, linhas 58-64).
      Substituir pelo bloco:
      ```yaml
      # Jundsoft (READ-ONLY). Valores reais vem do .env (nunca versionado).
      JUNDSOFT_HOST: ${JUNDSOFT_HOST:-}
      JUNDSOFT_PORT: ${JUNDSOFT_PORT:-1433}
      JUNDSOFT_DATABASE: ${JUNDSOFT_DATABASE:-JUNDSOFT}
      JUNDSOFT_USERNAME: ${JUNDSOFT_USERNAME:-}
      JUNDSOFT_PASSWORD: ${JUNDSOFT_PASSWORD:-}
      JUNDSOFT_ODBC_DRIVER: ${JUNDSOFT_ODBC_DRIVER:-ODBC Driver 18 for SQL Server}
      # Defaults seguros; certificado autoassinado interno: TRUST_SERVER_CERTIFICATE=true no .env.
      JUNDSOFT_ENCRYPT: ${JUNDSOFT_ENCRYPT:-true}
      JUNDSOFT_TRUST_SERVER_CERTIFICATE: ${JUNDSOFT_TRUST_SERVER_CERTIFICATE:-false}
      ```
      Remover `JUNDSOFT_DB`, `JUNDSOFT_USER`, `JUNDSOFT_ODBC_EXTRA` e o comentário `# Ex.: Encrypt=yes;TrustServerCertificate=yes`. Não alterar mais nada: `RUN_MIGRATIONS: ${RUN_MIGRATIONS:-true}` e `"${BACKEND_BIND:-127.0.0.1}:${BACKEND_PORT:-8000}:8000"` permanecem. Nenhum host, usuário ou senha real.
      Files: `docker-compose.yml`
      Verify: `docker compose config --quiet` na raiz com saída vazia e exit 0 (usa o `.env` da raiz migrado no item 5; se o item 5 ainda não tiver rodado, validar com `docker compose --env-file .env.example config --quiet`). **Não** rodar `docker compose config` sem `--quiet` em saída de relatório, porque ele expande os valores do `.env`. Para inspecionar só as chaves: `docker compose config --format json | ConvertFrom-Json | % { $_.services.'otif-backend'.environment.PSObject.Properties.Name } | Select-String JUNDSOFT` lista exatamente as 8 chaves novas.

- [ ] 5. Migrar os `.env` locais (ignorados pelo git) sem imprimir valores.
      - Primeiro, reexecutar e registrar `cd backend; .\.venv\Scripts\python.exe -c "import pyodbc; print(pyodbc.drivers())"`. Na investigação, **`ODBC Driver 18 for SQL Server` NÃO está instalado**; o driver SQL Server existente é `SQL Server`.
      - `backend/.env` já tem as 8 chaves novas. Só trocar a linha `JUNDSOFT_ODBC_DRIVER=...` por `JUNDSOFT_ODBC_DRIVER=SQL Server` **se** o comando acima confirmar a ausência do Driver 18 (se estiver presente, manter Driver 18). Não tocar nas outras linhas. Manter `JUNDSOFT_ENCRYPT=true`, `JUNDSOFT_TRUST_SERVER_CERTIFICATE=true` e `CORS_ORIGINS` com URLs normais.
      - `.env` (raiz, usado pelo compose): renomear chaves, preservando os valores existentes (hoje vazios): `JUNDSOFT_DB` vira `JUNDSOFT_DATABASE` e `JUNDSOFT_USER` vira `JUNDSOFT_USERNAME`. Inserir `JUNDSOFT_PORT=` logo após `JUNDSOFT_HOST` (vazio, o compose aplica `:-1433`). Remover `JUNDSOFT_ODBC_EXTRA` e seu comentário. Adicionar `JUNDSOFT_ENCRYPT=true` e `JUNDSOFT_TRUST_SERVER_CERTIFICATE=true`. Manter `JUNDSOFT_ODBC_DRIVER=ODBC Driver 18 for SQL Server` (é o driver do container). Manter `ERP_SOURCE`, `POSTGRES_*` e as outras chaves intactas.
      - Fazer as edições com um script pwsh que reescreve só as linhas por nome de chave (regex `^JUNDSOFT_DB=` etc.) e preserva o valor depois do `=`. **Nunca** usar `Get-Content` puro ou ferramenta de leitura que mostre o conteúdo.
      Files: `backend/.env`, `.env` (ambos locais, não versionados)
      Verify: listar só os nomes de chave e se cada uma está vazia ou definida, com o mesmo padrão da investigação: `Get-Content <f> | % { if ($_ -match '^\s*([A-Z_]+)\s*=(.*)$') { "$($matches[1]) = " + $(if ($matches[2].Trim()) {'<set>'} else {'<empty>'}) } }`. Nenhuma chave `JUNDSOFT_DB|JUNDSOFT_USER|JUNDSOFT_ODBC_EXTRA` em nenhum dos dois. `git status --short` não lista `.env` nem `backend/.env`, e `git check-ignore -v .env backend/.env` continua mostrando as duas como ignoradas.

- [ ] 6. Regressão: varredura do formato antigo.
      Files: nenhum (só verificação; corrigir o que aparecer)
      Verify: `git grep -n -I -E "JUNDSOFT_DB\b|JUNDSOFT_USER\b|JUNDSOFT_ODBC_EXTRA|jundsoft_db\b|jundsoft_user\b|jundsoft_odbc_extra" -- . ":!.agents"` sem resultado. Os únicos acertos aceitáveis fora desse filtro são os relatórios históricos em `.agents/tasks/devops-fase1-*` (motivo explícito: histórico da FASE 1). O `\b` evita casar `JUNDSOFT_USERNAME`. Em `test_config.py`, as chaves antigas só podem aparecer no teste 10 (variáveis antigas ignoradas) e no `delenv` da fixture; isso conta como uso de teste, não referência funcional, e deve ser filtrado manualmente ao ler o resultado. Rodar também a mesma busca nos `.env` locais com `Select-String -Quiet` (só booleano).

- [ ] 7. Validação backend e frontend.
      Verify:
      - `cd backend; .\.venv\Scripts\python.exe -m pytest -q`: tudo passa.
      - `cd frontend; npm ci; npm run build`: build sem erro (o frontend não muda, mas o pedido exige a validação).

- [ ] 8. Validação Docker (Docker 28.5.1 disponível).
      Verify, na raiz:
      - `docker compose config --quiet`: exit 0.
      - `docker compose build`: as duas imagens buildam. O Dockerfile não foi alterado.
      - `docker compose up -d`, depois `docker compose ps`: `otif-postgres`, `otif-backend` e `otif-frontend` em `running`/`healthy`.
      - `curl.exe -s http://127.0.0.1:8000/health`: `{"status":"ok","erp_source":"mock",...}` (o `.env` da raiz tem `ERP_SOURCE=mock`).
      - `docker compose exec otif-backend python -c "import pyodbc; print(pyodbc.drivers())"`: lista `ODBC Driver 18 for SQL Server`.
      - `docker compose exec otif-backend python -c "from app.config import get_settings as g; s=g(); print(s.jundsoft_port, s.jundsoft_encrypt, s.jundsoft_trust_server_certificate, s.jundsoft_odbc_driver)"`: o Settings sobe no container com as variáveis novas. Não imprimir host, usuário, senha nem a conn str.
      - Ao final, perguntar ou registrar se deve rodar `docker compose down`. O padrão é deixar rodando só se o usuário pedir; caso contrário, rodar `docker compose down` (sem `-v`, para não apagar o volume do Postgres).

- [ ] 9. Teste local opcional de conexão ao Jundsoft (seção 13 do pedido; só leitura e sem imprimir segredos).
      Só executar se `backend/.env` tiver `ERP_SOURCE=sqlserver` e credenciais que o usuário considere funcionais (hoje `ERP_SOURCE=sqlserver` está no `backend/.env`). Rodar um script que monte a conexão via `get_settings().jundsoft_conn_str`, chame `pyodbc.connect(..., timeout=15, readonly=True)` e `cursor.execute("SELECT 1")`, e imprima **somente** `OK` ou o tipo da exceção mais o SQLSTATE (`e.args[0]`). Não imprimir `str(e)` inteiro, porque mensagens de driver podem citar host ou usuário. Não executar as queries de negócio.
      Riscos a relatar sem tentar "consertar" o código:
      - O driver legado `SQL Server` do Windows pode não suportar `TrustServerCertificate` ou TLS 1.2 com `Encrypt=yes`. Se falhar por isso, o diagnóstico vai para o relatório, e a alternativa (instalar o ODBC Driver 18 no Windows) fica como recomendação, sem mudar defaults.
      - Os valores do `backend/.env` podem não ser credenciais funcionais. Nesse caso, uma falha de login (SQLSTATE 28000) é esperada e deve ser apenas reportada.
      Verify: saída `OK` ou o SQLSTATE registrado no relatório.

- [ ] 10. Relatório final (sem commit).
      Incluir: arquivos alterados (`backend/app/config.py`, `backend/tests/test_config.py`, `backend/.env.example`, `.env.example`, `docker-compose.yml`, mais os `.env` locais não versionados); justificativa do `repr=False` e do escape ODBC; o fato de o Driver 18 **não** estar instalado no Windows local, por isso `backend/.env` usa `SQL Server`, enquanto código e containers ficam no padrão Driver 18; as saídas reais de pytest, npm build, compose config/build/ps, `/health` e `pyodbc.drivers()` do container; o resultado do item 9; a confirmação de que `git status` não mostra `.env` e que nada foi commitado. Nenhum valor de host, usuário ou senha.
      Verify: `git status --short` lista apenas os 5 arquivos versionados acima como modificados, e nenhum `.env`.
