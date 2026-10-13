"""API OTIF com leitura direta e read-only do JUND.

Dados ERP sao consultados no SQL Server e mesclados, por PV01_ID, com etapas,
confirmacoes e historicos manuais armazenados no banco proprio.

ATENCAO (seguranca): este esqueleto NAO possui autenticacao. Antes de ir para
producao e obrigatorio proteger a API com login/controle de acesso, pois o time
comercial estara alterando o numero oficial de OTIF da empresa.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import Base, engine
from .pedidos_direto import ErpIndisponivelError
from .routers import config as config_router
from .routers import confirmacoes, etapas, metrics, pedidos

settings = get_settings()

# Conveniencia de desenvolvimento no SQLite: cria tabelas ausentes. Colunas em
# tabelas existentes continuam sendo geridas por Alembic (`alembic upgrade head`).
if settings.database_url.startswith("sqlite"):
    Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="OTIF API",
    version="0.1.0",
    description="Calculo de OTIF do recebimento do pedido ate a chegada no cliente.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pedidos.router)
app.include_router(confirmacoes.router)
app.include_router(etapas.router)
app.include_router(metrics.router)
app.include_router(config_router.router)


@app.exception_handler(ErpIndisponivelError)
def erp_indisponivel(_: Request, exc: ErpIndisponivelError):
    return JSONResponse(
        status_code=503,
        content={"detail": str(exc)},
        headers={"Retry-After": "15"},
    )


@app.get("/health", tags=["infra"])
def health():
    return {
        "status": "ok",
        "erp_source": settings.erp_source,
        "erp_read_mode": settings.erp_read_mode,
    }
