"""Configuracao de logging com correlacao logs <-> traces.

Adiciona `trace_id` e `span_id` a cada `LogRecord`, obtidos do span
OpenTelemetry ativo no momento do log. Esses campos permitem correlacionar
logs (Loki) com traces (Tempo) no Grafana.

Sem span ativo (tracing desligado, span nao amostrado ou fora de requisicao
instrumentada) os campos ficam como "-". Se os pacotes opentelemetry nao
estiverem instalados, o filtro apenas usa "-" e a aplicacao sobe normalmente.
"""
import logging
import logging.config
from typing import Any

_configured = False

_LOG_FORMAT = (
    "%(asctime)s %(levelname)s trace_id=%(trace_id)s span_id=%(span_id)s "
    "%(name)s: %(message)s"
)
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# O log de acesso do uvicorn passa client_addr/method/path/status como args
# posicionais e depende de `uvicorn.logging.AccessFormatter` para montar
# `request_line`. Por isso o formatter de acesso estende a classe do uvicorn,
# apenas prefixando timestamp/nivel/trace/span.
_UVICORN_ACCESS_FORMAT = (
    "%(asctime)s %(levelname)s trace_id=%(trace_id)s span_id=%(span_id)s "
    '%(name)s: %(client_addr)s - "%(request_line)s" %(status_code)s'
)


class TraceCorrelationFilter(logging.Filter):
    """Injeta `trace_id`/`span_id` do span OpenTelemetry atual no LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = "-"
        record.span_id = "-"

        try:
            from opentelemetry import trace

            span_context = trace.get_current_span().get_span_context()
            if span_context is not None and span_context.is_valid:
                record.trace_id = format(span_context.trace_id, "032x")
                record.span_id = format(span_context.span_id, "016x")
        except Exception:
            # Inclusive ImportError: correlacao nunca pode derrubar o logging.
            pass

        return True


def _access_formatter_config() -> dict[str, Any]:
    try:
        import uvicorn.logging  # noqa: F401

        return {
            "()": "uvicorn.logging.AccessFormatter",
            "fmt": _UVICORN_ACCESS_FORMAT,
            "datefmt": _DATE_FORMAT,
            "use_colors": False,
        }
    except ImportError:
        return {"format": _LOG_FORMAT, "datefmt": _DATE_FORMAT}


def _build_logging_config(log_level: str) -> dict[str, Any]:
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {"trace_correlation": {"()": TraceCorrelationFilter}},
        "formatters": {
            "default": {"format": _LOG_FORMAT, "datefmt": _DATE_FORMAT},
            "access": _access_formatter_config(),
        },
        "handlers": {
            "default": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "default",
                "filters": ["trace_correlation"],
            },
            "access": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "access",
                "filters": ["trace_correlation"],
            },
        },
        "loggers": {
            "": {"handlers": ["default"], "level": log_level},
            "uvicorn": {"handlers": ["default"], "level": log_level, "propagate": False},
            "uvicorn.error": {"handlers": ["default"], "level": log_level, "propagate": False},
            "uvicorn.access": {"handlers": ["access"], "level": log_level, "propagate": False},
        },
    }


def setup_logging(log_level: str = "INFO") -> None:
    """Configura logging em stdout com correlacao de trace. Idempotente."""
    global _configured

    if _configured:
        return

    logging.config.dictConfig(_build_logging_config(log_level.upper()))
    _configured = True
