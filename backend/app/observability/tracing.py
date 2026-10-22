"""Tracing distribuido (OpenTelemetry), opcional via `TRACING_ENABLED`.

Desabilitado por padrao: nada e instrumentado e os pacotes opentelemetry nem
sao importados. Exporta spans via OTLP/HTTP para o Grafana Alloy.
"""
import logging

from fastapi import FastAPI

from ..config import get_settings

logger = logging.getLogger(__name__)

_instrumented = False
_pyroscope_bridge_registered = False

# Unico TracerProvider da aplicacao. Guardado para que o bridge de Span Profiles
# possa anexar o PyroscopeSpanProcessor depois, sem recriar o provider.
_tracer_provider = None


def setup_tracing(app: FastAPI) -> None:
    """Instrumenta FastAPI e SQLAlchemy. Chamar uma vez, logo apos criar o app."""
    global _instrumented, _tracer_provider

    settings = get_settings()
    if not settings.tracing_enabled:
        logger.info("Tracing desabilitado (TRACING_ENABLED=false).")
        return

    if _instrumented:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.warning(
            "Tracing habilitado, mas os pacotes opentelemetry nao estao instalados "
            "(pip install -r requirements-observability.txt)."
        )
        return

    resource = Resource.create(
        {
            "service.name": settings.tracing_service_name,
            "service.version": settings.app_version,
            "deployment.environment": settings.tracing_environment,
        }
    )

    provider = TracerProvider(resource=resource)
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.tracing_otlp_endpoint))
    )
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(
        app,
        tracer_provider=provider,
        excluded_urls=settings.tracing_excluded_urls,
    )
    _instrument_sqlalchemy(provider)

    _tracer_provider = provider
    _instrumented = True
    logger.info(
        "Tracing habilitado: service=%s environment=%s endpoint=%s",
        settings.tracing_service_name,
        settings.tracing_environment,
        settings.tracing_otlp_endpoint,
    )


def register_pyroscope_span_processor(*, profiler_ready: bool) -> None:
    """Liga o `PyroscopeSpanProcessor` ao TracerProvider existente.

    Correlaciona traces (Tempo) com profiles de CPU (Pyroscope). Deve rodar
    DEPOIS de `setup_profiling()` e so e registrado se o profiler subiu, porque
    o processor chama APIs do pyroscope a cada span criado.
    """
    global _pyroscope_bridge_registered

    if _pyroscope_bridge_registered:
        return

    settings = get_settings()
    if not (settings.tracing_enabled and settings.pyroscope_enabled):
        return

    if not profiler_ready:
        logger.warning(
            "Pyroscope habilitado, mas o profiler nao subiu; "
            "PyroscopeSpanProcessor nao registrado."
        )
        return

    if _tracer_provider is None:
        logger.warning("TracerProvider ausente; PyroscopeSpanProcessor nao registrado.")
        return

    try:
        from pyroscope.otel import PyroscopeSpanProcessor
    except ImportError:
        logger.warning(
            "Span profiles habilitados, mas o pacote pyroscope-otel nao esta instalado "
            "(pip install -r requirements-observability.txt)."
        )
        return

    try:
        _tracer_provider.add_span_processor(PyroscopeSpanProcessor())
    except Exception:
        logger.exception("Falha ao registrar o PyroscopeSpanProcessor.")
        return

    _pyroscope_bridge_registered = True
    logger.info("Span profiles habilitado: PyroscopeSpanProcessor registrado.")


def _instrument_sqlalchemy(provider) -> None:
    try:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

        from ..database import engine

        SQLAlchemyInstrumentor().instrument(engine=engine, tracer_provider=provider)
    except ImportError:
        logger.debug("opentelemetry-instrumentation-sqlalchemy nao instalado; ignorando.")
    except Exception:
        logger.exception("Falha ao instrumentar o SQLAlchemy.")
