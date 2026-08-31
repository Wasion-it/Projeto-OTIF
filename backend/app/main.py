"""Aplicacao FastAPI do sistema de OTIF (esqueleto com dados fake).

Fluxo em producao (nao incluso neste esqueleto):
    Jundsoft (SQL Server, read-only) -> job de sync -> este banco -> API -> React
Aqui o "ERP" e substituido pelo seed de dados fake (ver seed.py).

ATENCAO (seguranca): este esqueleto NAO possui autenticacao. Antes de ir para
producao e obrigatorio proteger a API com login/controle de acesso, pois o time
comercial estara alterando o numero oficial de OTIF da empresa.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import Base, engine
from .routers import confirmacoes, metrics, pedidos

settings = get_settings()

# Cria as tabelas do banco proprio (para o esqueleto). Em producao, usar migrations (Alembic).
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
app.include_router(metrics.router)


@app.get("/health", tags=["infra"])
def health():
    return {
        "status": "ok",
        "erp_source": settings.erp_source,
        "prazo_entrega_dias": settings.prazo_entrega_dias,
    }
