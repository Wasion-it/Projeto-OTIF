# Projeto OTIF

Sistema para calcular o **OTIF** (On Time In Full) da empresa, do recebimento do
pedido ate a chegada no cliente. Integra dados do ERP (Jundsoft) com confirmacoes
de entrega inseridas manualmente pelo time comercial.

> Estado atual: **esqueleto rodavel com dados fake**. O ERP e simulado por um mock;
> nenhuma conexao real com o Jundsoft e feita ainda.

## Como o OTIF e calculado

Avaliado por **item de pedido** e depois agregado:

- **On Time** = data de entrega real (manual) `<=` data solicitada pelo cliente (ERP)
- **In Full** = quantidade faturada (ERP) `>=` quantidade pedida (ERP), e marcada como recebida completa
- **OTIF** = On Time **E** In Full

Enquanto nao ha confirmacao de entrega, o item fica **pendente** (nao entra nas taxas).
A **data de faturamento** e usada como proxy da expedicao para separar
atraso **interno** (faturou depois do prazo) de atraso de **transporte**.

## Arquitetura

```
Jundsoft (SQL Server, read-only)          [mock no esqueleto]
        |
        v
  erp_sync.buscar_pedidos_erp()  --> banco proprio (SQLite/Postgres) --> FastAPI --> React
                                            ^
                          confirmacoes manuais (time comercial)
```

O banco proprio guarda os dados sincronizados do ERP + os inputs manuais + serve o
OTIF calculado. A aplicacao nunca escreve no ERP.

## Estrutura

```
backend/
  app/
    config.py       # settings (DATABASE_URL, erp_source, jundsoft_url)
    database.py     # engine/sessao SQLAlchemy
    models.py       # Pedido, ItemPedido, ConfirmacaoEntrega
    otif.py         # regras de calculo do OTIF
    schemas.py      # contratos da API
    queries.py      # consultas com filtros
    erp_sync.py     # mock do ERP + stub da consulta SQL Server
    seed.py         # popula dados fake
    routers/        # pedidos, confirmacoes, metrics
frontend/
  src/              # React + Vite (dashboard, tabela, modal de confirmacao)
```

## Integracao com o Jundsoft (SQL Server)

Mapeamento validado contra a base real (`erp_sync.py`):

| Dado do OTIF | Origem no Jundsoft |
|---|---|
| Nº do pedido | `TB_PV_01.PV01_NUMERO_CLIENTE` (fallback `PV01_NUMERO_INTERNO`) |
| Data solicitada | `TB_PV_01.PV01_DATA_DIGITACAO_H` (timestamp de digitacao) |
| Cliente | `TB_CD_01.CD01_NOME` |
| SKU / descricao | `TB_CD_04.CD04_CODIGO_INTERNO` / `TB_PV_02.PV02_DESCRICAO` |
| Qtd pedida / faturada | `TB_PV_02.PV02_QTDE` / `PV02_QTDE_FATURADA` |
| Data de faturamento | `MAX(TB_FT_01.FT01_DATA_EMISSAO)` por pedido (nao cancelada) |

Filtros: apenas pedidos nao cancelados e efetivados (`PV01_CANCELADO=0 AND PV01_EFETIVADO=1`),
dentro da janela de meses informada. A conexao e **somente leitura** (`readonly=True`).

Rodar o sync real (com `ERP_SOURCE=sqlserver` e credenciais no `.env`):

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.sync --meses 12
```

O sync e **idempotente** (chaveia por `PV01_ID`) e **preserva as confirmacoes manuais**:
ao reprocessar, so atualiza os campos vindos do ERP, nunca apaga entregas ja confirmadas.

> Recomendacao: usar um usuario SQL **somente leitura** dedicado (nao o `SYSADM`).

## Indicador de prazo (pedidos em aberto)

Cada item ainda nao entregue mostra a contagem regressiva ate o prazo
(`prazo_entrega = data_solicitada + PRAZO_ENTREGA_DIAS`):

- `dias_restantes`: dias ate o prazo (negativo = vencido).
- `situacao_prazo`: `no_prazo`, `atencao` (faltam <= `DIAS_ALERTA_PRAZO`, padrao 7)
  ou `vencido`.

O painel resume os pendentes nessas tres faixas (cards clicaveis para filtrar) e a
tabela mostra "faltam Xd" / "vence hoje" / "vencido ha Xd" por item.

## Como rodar

### Backend (FastAPI)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install fastapi==0.115.5 uvicorn==0.32.1 pydantic==2.10.3 pydantic-settings==2.6.1 python-dateutil==2.9.0.post0 Faker==33.1.0 "typing_extensions>=4.12"
.\.venv\Scripts\python.exe -m pip install SQLAlchemy==2.0.36 --no-deps

# popular dados fake
.\.venv\Scripts\python.exe -m app.seed --reset

# subir a API (http://localhost:8000 , docs em /docs)
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

> **Nota (Python 32-bit):** o `SQLAlchemy` e instalado com `--no-deps` porque a
> dependencia opcional `greenlet` nao tem wheel pronta para `win32` e falha ao
> compilar. O modo sincrono do SQLAlchemy (usado aqui) nao precisa de `greenlet`.
> Para producao, recomenda-se **Python 64-bit**, onde `pip install -r requirements.txt`
> funciona direto.

### Frontend (React + Vite)

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173
```

## Endpoints principais

| Metodo | Rota                  | Descricao                                  |
|--------|-----------------------|--------------------------------------------|
| GET    | `/health`             | status da API                              |
| GET    | `/metrics/otif`       | OTIF %, On Time %, In Full %, motivos       |
| GET    | `/metrics/tendencia`  | OTIF por mes                                |
| GET    | `/pedidos/itens`      | itens com status OTIF + prazo (filtros: data/cliente/status/situacao_prazo) |
| POST   | `/confirmacoes`       | registra/atualiza confirmacao de entrega   |
| DELETE | `/confirmacoes/{id}`  | remove confirmacao de um item              |

Filtros de data usam `data_ini` / `data_fim` (formato `AAAA-MM-DD`).

## Proximos passos (para producao)

1. **Autenticacao/autorizacao** na API. Hoje NAO ha login; o time comercial altera
   o numero oficial de OTIF, entao isso e obrigatorio antes de expor.
2. **Regra do On Time (SLA):** a data solicitada e o momento da digitacao do pedido.
   Falta definir o prazo aceitavel de entrega a partir dela (ex.: X dias) para o
   calculo de On Time nao ficar preso a "entrega no mesmo dia".
3. **Agendar o sync** (`python -m app.sync`) para rodar periodicamente e usar um
   usuario SQL **somente leitura** dedicado no lugar do `SYSADM`.
4. **Trocar SQLite por Postgres** (definir `DATABASE_URL`) e adicionar migrations (Alembic).
5. Acordar formalmente com comercial/logistica as tolerancias de In Full.
```
