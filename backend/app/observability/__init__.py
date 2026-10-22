"""Observabilidade da OTIF API: logs correlacionados, tracing e profiling.

Tudo e opcional e desligado por padrao (TRACING_ENABLED / PYROSCOPE_ENABLED).
Os pacotes opentelemetry e pyroscope sao importados sob demanda, entao o
ambiente local sem eles continua subindo normalmente.
"""
from .log_config import setup_logging
from .profiling import setup_profiling
from .tracing import register_pyroscope_span_processor, setup_tracing

__all__ = [
    "register_pyroscope_span_processor",
    "setup_logging",
    "setup_profiling",
    "setup_tracing",
]
