"""Continuous profiling (Grafana Pyroscope), opcional via `PYROSCOPE_ENABLED`.

Fluxo: FastAPI -> Pyroscope SDK -> Grafana Alloy (`PYROSCOPE_SERVER_ADDRESS`)
-> Pyroscope -> Grafana. Apenas CPU profiling, com tags de baixa cardinalidade.
Falhas na inicializacao sao registradas e nao impedem a aplicacao de subir.
"""
import logging

from ..config import get_settings

logger = logging.getLogger(__name__)

_profiler_started = False


def setup_profiling() -> bool:
    """Inicializa o profiler, se habilitado. Chamar uma vez por processo, no startup.

    Retorna True se o profiler esta ativo; False se desabilitado ou se a
    inicializacao falhou. O retorno alimenta `register_pyroscope_span_processor`,
    que so deve ligar o bridge de Span Profiles sobre um profiler que subiu.
    """
    global _profiler_started

    if _profiler_started:
        return True

    settings = get_settings()
    if not settings.pyroscope_enabled:
        logger.info("Pyroscope profiling desabilitado (PYROSCOPE_ENABLED=false).")
        return False

    try:
        import pyroscope

        pyroscope.configure(
            application_name=settings.pyroscope_application_name,
            server_address=settings.pyroscope_server_address,
            cpu_enabled=True,
            mem_enabled=False,
            sample_rate=100,
            tags={
                "environment": settings.pyroscope_environment,
                "service_name": settings.pyroscope_application_name,
            },
        )
    except ImportError:
        logger.warning(
            "Pyroscope habilitado, mas o pacote pyroscope-io nao esta instalado "
            "(pip install -r requirements-observability.txt)."
        )
        return False
    except Exception:
        logger.exception("Falha ao inicializar o Pyroscope.")
        return False

    _profiler_started = True
    logger.info(
        "Pyroscope inicializado application=%s server=%s environment=%s",
        settings.pyroscope_application_name,
        settings.pyroscope_server_address,
        settings.pyroscope_environment,
    )
    return True
