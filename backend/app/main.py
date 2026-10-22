"""API OTIF com leitura direta e read-only do JUND.

Dados ERP sao consultados no SQL Server e mesclados, por PV01_ID, com etapas,
confirmacoes e historicos manuais armazenados no banco proprio.

ATENCAO (seguranca): este esqueleto NAO possui autenticacao. Antes de ir para
producao e obrigatorio proteger a API com login/controle de acesso, pois o time
comercial estara alterando o numero oficial de OTIF da empresa.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import Base, engine
from .observability import (
    register_pyroscope_span_processor,
    setup_logging,
    setup_profiling,
    setup_tracing,
)
from .pedidos_direto import ErpIndisponivelError
from .routers import config as config_router
from .routers import comercial, confirmacoes, etapas, metrics, pedidos

settings = get_settings()

# Logging primeiro: os logs de startup (inclusive os do setup de tracing) ja
# saem em stdout com o formato e a correlacao de trace corretos.
setup_logging(settings.log_level)

# Conveniencia de desenvolvimento no SQLite: cria tabelas ausentes. Colunas em
# tabelas existentes continuam sendo geridas por Alembic (`alembic upgrade head`).
if settings.database_url.startswith("sqlite"):
    Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Pyroscope e iniciado por processo, no startup (seguro mesmo com --workers).
    # O bridge de Span Profiles precisa rodar DEPOIS do profiler ja configurado.
    profiler_ready = setup_profiling()
    register_pyroscope_span_processor(profiler_ready=profiler_ready)
    yield


app = FastAPI(
    title="OTIF API",
    version="0.1.0",
    description="Calculo de OTIF do recebimento do pedido ate a chegada no cliente.",
    lifespan=lifespan,
)

# A instrumentacao precisa acontecer antes do app comecar a atender requisicoes.
setup_tracing(app)

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
app.include_router(comercial.router)


@app.exception_handler(ErpIndisponivelError)
def erp_indisponivel(_: Request, exc: ErpIndisponivelError):
    return JSONResponse(
        status_code=503,
        content={"detail": str(exc)},
        headers={"Retry-After": "15"},
    )


@app.get("/health", tags=["infra"])
def health():
    # version/commit/environment vem do pipeline (APP_*) e permitem ao deploy
    # confirmar que a versao publicada e a esperada.
    return {
        "status": "ok",
        "service": "otif-backend",
        "version": settings.app_version,
        "commit": settings.app_commit,
        "environment": settings.app_environment,
        "erp_source": settings.erp_source,
        "erp_read_mode": settings.erp_read_mode,
    }
