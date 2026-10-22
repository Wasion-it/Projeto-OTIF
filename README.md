# Projeto OTIF

Sistema para acompanhar **OTIF (On Time In Full)** do recebimento do pedido até a
entrega ao cliente. Os pedidos vêm do Jundsoft por conexão SQL Server somente
leitura; confirmações de entrega e etapas internas são registradas na aplicação.

## Regra oficial do OTIF

A unidade de avaliação é o **pedido**:

- **Contract Date**: data de entrega informada pelo comercial no pedido do JUND.
- **On Time**: data de entrega real `<= Contract Date`.
- **In Full**: todos os itens faturados integralmente e o pedido confirmado como
  recebido completo.
- **OTIF**: On Time **e** In Full.

A data de digitação é mantida somente para rastreabilidade, filtros de período e
tendência. **Ela nunca é somada a um SLA para criar o prazo.**

Pedidos sem Contract Date válido recebem o status `sem_contract_date`, aparecem
como pendência para correção no JUND e ficam fora dos denominadores de OTIF e On
Time. Não há fallback por SLA.

Enquanto há Contract Date, mas ainda não há confirmação de entrega, o pedido fica
`pendente`. A aplicação mostra os dias até a data oficial nas faixas `no_prazo`,
`atencao` e `vencido`. A antecedência de `atencao` é configurada por
`DIAS_ALERTA_PRAZO` (padrão: 7 dias).

A data de faturamento é usada como proxy da expedição para distinguir atraso
interno (faturamento após o Contract Date) de atraso de transporte.

## Arquitetura

```text
Jundsoft (SQL Server, read-only) ──────────────> FastAPI ──> React
                                                    ^
Banco próprio (âncoras PV01_ID + confirmações/etapas/históricos manuais)
```

A API consulta o JUND diretamente e mescla os dados manuais pelo `PV01_ID`. Um
cache em memória de poucos segundos evita repetir a consulta nas chamadas
simultâneas do dashboard; a interface atualiza automaticamente a cada 30 segundos.
A aplicação nunca escreve no Jundsoft. O banco próprio pode ser SQLite em
desenvolvimento ou PostgreSQL em produção. `ERP_READ_MODE=snapshot` existe apenas
para rollback; antes de ativá-lo é obrigatório executar `sync.py`, pois âncoras
criadas no modo direto são excluídas das métricas snapshot.

### Fluxo operacional interno

```text
Pedido → PCP → Produção ─────────────┐
       └→ Comercial / agendamento ───┴→ Inspeção LEM → Faturamento → Estoque → Expedição → Entrega
```

O **Comercial pode agendar a inspeção antecipadamente**, sem esperar o PCP ou a
Produção serem concluídos. O agendamento fica registrado em paralelo ao fluxo
produtivo e não altera a etapa atual da Produção.

O LEM só inicia quando as duas condições forem atendidas: a data agendada chegou
e a Produção foi concluída. Portanto, seu marco zero é a data mais tardia entre
`inspecao_agendada_data` e `producao_fim`. Antes desse marco o LEM permanece em
**espera programada com zero dias parados**; somente depois começa a contagem e
a duração usada nos indicadores de gargalo.

Depois do LEM, **Faturamento** é uma etapa automática. Ela usa a última data/hora
de emissão não cancelada do pedido no JUND (`FT01_DATA_EMISSAO_H`). Enquanto a consulta não trouxer esse timestamp,
o processo permanece aguardando Faturamento e a Expedição não pode ser confirmada manualmente.

Após o Faturamento, **Estoque** também é automático: começa no faturamento e
termina em `FT01_DATA_EMBARQUE`. Enquanto o JUND não informar o embarque, o
pedido permanece em Estoque e a Expedição fica bloqueada. Esse campo foi
confirmado como a fonte oficial, embora ainda não tenha cobertura nos pedidos
atuais do JUND.

Enquanto o pedido estiver no **PCP**, o operador pode confirmar o planejamento
ou usar **Negar produção**. A negativa exige motivo e uma nova data prevista,
não avança a etapa e é gravada em histórico permanente. Quando o PCP confirmar
posteriormente, todas as negativas abertas são marcadas como resolvidas, sem
apagar os registros anteriores.

## Mapeamento do Jundsoft

| Dado | Origem |
|---|---|
| ID do pedido | `TB_PV_01.PV01_ID` |
| Nº do pedido | `TB_PV_01.PV01_NUMERO_CLIENTE` (fallback `PV01_NUMERO_INTERNO`) |
| Data de digitação | `TB_PV_01.PV01_DATA_DIGITACAO_H` |
| **Contract Date** | `TB_PV_02.PV02_DIAS_ENTREGA` |
| Cliente | `TB_CD_01.CD01_NOME` |
| SKU / descrição | `TB_CD_04.CD04_CODIGO_INTERNO` / `TB_PV_02.PV02_DESCRICAO` |
| Quantidade pedida/faturada | `TB_PV_02.PV02_QTDE` / `PV02_QTDE_FATURADA` |
| Data/hora de faturamento | Última `TB_FT_01.FT01_DATA_EMISSAO_H` não cancelada |
| Nota fiscal / série | `TB_FT_01.FT01_NOTA` / `FT01_SERIE` da mesma última nota |
| Data/hora de embarque | `FT01_DATA_EMBARQUE` da mesma última nota fiscal |

`PV02_DIAS_ENTREGA` é convertido de `DD/MM/AAAA` com:

```sql
TRY_CONVERT(
    date,
    NULLIF(LTRIM(RTRIM(i.PV02_DIAS_ENTREGA)), ''),
    103
)
```

Texto vazio ou inválido resulta em Contract Date ausente. Se itens do mesmo
pedido tiverem datas válidas divergentes, a leitura registra um warning e usa a
data mais antiga como consolidação conservadora.

A consulta direta considera pedidos efetivados e não cancelados. O banco local
mantém apenas uma âncora por `PV01_ID` e os registros manuais; `sync.py` permanece
como ferramenta legada de rollback, não sendo necessário para atualizar o painel.

## Estrutura principal

```text
backend/
  app/
    erp_sync.py     # consulta read-only e normalização do JUND
    pedidos_direto.py # cache, âncoras e merge com dados manuais
    sync.py         # ferramenta legada para rollback do snapshot
    models.py       # modelos SQLAlchemy
    otif.py         # regra Contract Date / OTIF
    avaliacao.py    # carga e avaliação reutilizada pela API
    routers/        # pedidos, métricas, confirmações, etapas e config
  alembic/          # migrations
  tests/            # validações automatizadas
frontend/
  src/              # React + Vite
```

## Configuração

Copie `backend/.env.example` para `backend/.env` e ajuste os valores necessários.
Variáveis principais:

```dotenv
DATABASE_URL=sqlite:///./otif.db
ERP_SOURCE=mock
DIAS_ALERTA_PRAZO=7
META_OTIF=95
```

Para o JUND real, use `ERP_SOURCE=sqlserver` e configure as variáveis
`JUNDSOFT_*` com um usuário dedicado de somente leitura.

## Como rodar

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head

# Dados fake (somente ERP_SOURCE=mock)
.\.venv\Scripts\python.exe -m app.seed --reset

# Com ERP_SOURCE=sqlserver e ERP_READ_MODE=direct, a própria API consulta o JUND.
# API: http://localhost:8000 (Swagger em /docs)
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

> Em um banco SQLite já existente, execute `alembic upgrade head` antes de iniciar
> a API. `Base.metadata.create_all()` cria tabelas novas, mas não adiciona colunas
> a uma tabela existente.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

O frontend usa `http://localhost:8000` por padrão. Para outra URL, defina
`VITE_API_URL` conforme `frontend/.env.example`.

## Endpoints principais

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | estado da API e origem do ERP |
| GET/PUT | `/config` | meta OTIF e antecedência do alerta |
| GET | `/metrics/otif` | OTIF, On Time, In Full e qualidade do Contract Date |
| GET | `/metrics/tendencia` | indicadores por mês de digitação |
| GET | `/metrics/clientes` | ranking por cliente |
| GET | `/pedidos` | pedidos avaliados e paginados |
| POST | `/confirmacoes` | cria/atualiza confirmação de entrega |
| DELETE | `/confirmacoes/{pedido_id}` | remove confirmação |
| PUT | `/etapas/{pedido_id}/confirmar` | confirma atomicamente PCP, Produção, LEM ou Expedição |
| POST | `/etapas/{pedido_id}/negar-producao` | registra negativa histórica do PCP |
| PUT | `/etapas/{pedido_id}/comercial` | registra antecipadamente a agenda da inspeção |
| GET/PUT/DELETE | `/etapas/{pedido_id}` | consulta, edição administrativa completa ou remoção |

`GET /pedidos` aceita `data_ini`, `data_fim`, `cliente`, `status`,
`situacao_prazo`, `sort`, `order`, `page` e `page_size`. O período continua
filtrando a **data de digitação**. Status válidos incluem `pendente`, `otif`,
`falha` e `sem_contract_date`.

O contrato retorna `contract_date` como campo canônico. `prazo_entrega` é mantido
temporariamente como alias nullable com o mesmo valor para compatibilidade.

## Migrations e validação

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m pytest -q

cd ..\frontend
npm run build
```

As tabelas e colunas antigas de SLA permanecem fisicamente nesta primeira etapa
apenas para rollback, mas não são usadas no cálculo nem expostas pela API/UI.

## CI/CD e deploy

Mesmo padrão do Sistema de RH: runners internos (`wasion-runners`), imagens
imutáveis no `registry.wasion.com.br` e deploy em Docker Swarm atrás do Traefik.

| Workflow | Quando roda | O que faz |
|---|---|---|
| `pr-validation.yml` | PR para `main`/`develop` | pytest + build do frontend, DevSecOps (pip-audit, npm audit, Bandit, Trivy) e build das imagens sem publicar |
| `scheduled-validation.yml` | segunda 03:00 UTC ou manual | mesmas verificações, para pegar CVEs novas sem código novo |
| `deploy-production.yml` | **manual** (`workflow_dispatch`) | valida, publica `sha-<commit>`, faz deploy no Swarm, confirma o commit em `/health`, registra annotation no Grafana e cria o release |

O deploy só termina com sucesso se o Swarm não precisar fazer rollback e se o
`/health` público devolver o `commit` publicado. Os `includes-*.yml` são as peças
reutilizáveis.

### Preparar o servidor (uma vez)

No manager do Swarm, crie os segredos da aplicação. Eles nunca passam pelo GitHub:

```bash
printf '%s' '<senha-do-postgres>'  | docker secret create otif_postgres_password -
printf '%s' '<senha-do-jundsoft>'  | docker secret create otif_jundsoft_password -
printf '%s' '<senha-do-jigadb>'    | docker secret create otif_jigadb_password -
```

Os três são obrigatórios, mesmo com `LEM_SOURCE=manual` (use um valor qualquer para
o `jigadb`). Use usuários **somente leitura** no Jundsoft e no jigadb. A rede
`controle_overlay` (Traefik e Alloy) precisa existir. O runner precisa estar
liberado para este repositório no grupo de runners da organização. O domínio
`otif.wasion.com.br` fica fixo no `docker-compose.prod.yml` e no workflow de
deploy (como no RH): o DNS precisa apontar para o Traefik e o certificado TLS
precisa cobrir esse nome.

### Configuração no GitHub

Secrets (Settings > Secrets and variables > Actions > Secrets):
`DEPLOY_PROD_SSH_KEY`, `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`, `GRAFANA_ANNOTATION_TOKEN`.

Variables (aba Variables):

| Variável | Obrigatória | Exemplo / observação |
|---|---|---|
| `DEPLOY_PROD_HOST` | sim | hostname do manager do Swarm |
| `DEPLOY_PROD_USER` | sim | usuário SSH do deploy |
| `DEPLOY_PROD_PATH` | sim | diretório do manifesto no servidor |
| `GRAFANA_URL` | sim | URL base do Grafana |
| `JUNDSOFT_HOST` / `JUNDSOFT_USERNAME` | sim | `JUNDSOFT_PORT`, `JUNDSOFT_DATABASE` têm default |
| `ERP_SOURCE`, `ERP_READ_MODE` | não | default `sqlserver` / `direct` |
| `JUNDSOFT_TRUST_SERVER_CERTIFICATE` | não | default `false`; `true` só com certificado autoassinado |
| `LEM_SOURCE`, `PRODUCAO_SOURCE` | não | default `manual`; `jigadb` exige `JIGADB_*` |
| `JIGADB_HOST`, `JIGADB_PORT`, `JIGADB_DATABASE`, `JIGADB_USERNAME` | se usar `jigadb` | |
| `DEPLOY_PROD_HOST_FINGERPRINT` | não | fixa a chave SSH do servidor (recomendado) |

Crie também o environment `prod` (Settings > Environments) se quiser exigir
aprovação manual antes do deploy.

### Observabilidade

O backend exporta traces (OpenTelemetry → Alloy → Tempo), profiles (Pyroscope) e
logs em stdout com `trace_id`/`span_id` para correlação no Loki. Tudo vem desligado
por padrão (`TRACING_ENABLED`, `PYROSCOPE_ENABLED`) e é ligado no
`docker-compose.prod.yml`. `/health` devolve `version`, `commit` e `environment`.
Cada deploy gera uma annotation no Grafana (tags `deploy`, `otif`, `prod`).

## Antes de produção

- adicionar autenticação e autorização;
- monitorar disponibilidade/latência da consulta read-only ao JUND;
- usar cache compartilhado caso a API rode com múltiplos workers;
- monitorar pedidos `sem_contract_date` como problema de qualidade cadastral;
- formalizar responsáveis pelas confirmações de entrega e causas de falha.
