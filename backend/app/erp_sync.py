"""Camada de sincronizacao com o ERP.

No modo mock, `buscar_pedidos_erp()` gera dados fake. Em producao, a versao
SQL Server abre uma conexao read-only com o Jundsoft e le os pedidos.

O restante da aplicacao nunca fala direto com o Jundsoft: ele consome somente o
formato normalizado retornado aqui.
"""
from __future__ import annotations

import logging
import random
import re
from datetime import date, datetime, timedelta

from faker import Faker

from .config import get_settings

logger = logging.getLogger(__name__)
fake = Faker("pt_BR")

PRODUTOS = [
    ("SKU-1001", "Caixa Papelao 40x30"),
    ("SKU-1002", "Filme Stretch 500mm"),
    ("SKU-1003", "Fita Adesiva 48mm"),
    ("SKU-1004", "Pallet PBR 1.00x1.20"),
    ("SKU-1005", "Etiqueta Termica 100x150"),
    ("SKU-1006", "Saco Plastico 60x80"),
    ("SKU-1007", "Cinta Poliester 16mm"),
    ("SKU-1008", "Bobina Kraft 80g"),
]


def _gerar_pedidos_fake(qtd_pedidos: int, seed: int | None) -> list[dict]:
    """Gera pedidos fake no mesmo formato normalizado do JUND.

    A data de digitacao e o Contract Date sao campos independentes. Alguns
    pedidos ficam sem Contract Date para exercitar o alerta operacional; isso
    nunca dispara calculo por SLA ou qualquer outro fallback.
    """
    if seed is not None:
        random.seed(seed)
        Faker.seed(seed)

    hoje = date.today()
    clientes = [fake.company() for _ in range(18)]
    pedidos: list[dict] = []

    for i in range(qtd_pedidos):
        dias_atras = random.randint(0, 180)
        data_pedido = hoje - timedelta(days=dias_atras)
        data_digitacao = data_pedido + timedelta(days=random.randint(0, 2))
        data_planejada_fake = data_digitacao + timedelta(days=random.randint(12, 25))
        contract_date = data_planejada_fake if random.random() >= 0.08 else None

        # Um unico marco de faturamento por pedido, equivalente ao MAX usado no
        # JUND. Parte dos pedidos permanece sem faturamento para exercitar a
        # etapa automatica de espera.
        if random.random() < 0.20:
            faturamento_em = None
        else:
            if random.random() < 0.20:
                data_faturamento = data_planejada_fake - timedelta(
                    days=random.randint(-4, 2)
                )
            else:
                data_faturamento = data_planejada_fake - timedelta(
                    days=random.randint(6, 12)
                )
            faturamento_em = datetime(
                data_faturamento.year,
                data_faturamento.month,
                data_faturamento.day,
                random.randint(7, 18),
                random.randint(0, 59),
                random.randint(0, 59),
            )

        # Embarque encerra automaticamente o tempo em Estoque e e a propria
        # data da Expedicao. Nem todo pedido faturado ja embarcou.
        embarque_em = (
            faturamento_em + timedelta(hours=random.randint(2, 96))
            if faturamento_em is not None and random.random() >= 0.30
            else None
        )
        nota_fiscal_numero = str(50000 + i) if faturamento_em is not None else None
        nota_fiscal_serie = "1" if faturamento_em is not None else None

        itens = []
        for n_item in range(1, random.randint(1, 4) + 1):
            sku, desc = random.choice(PRODUTOS)
            qtd_pedida = random.choice([10, 20, 50, 100, 200, 500])

            # Sem nota o pedido ainda nao foi faturado; quando ha nota, 15% dos
            # itens ficam parciais para exercitar In Full.
            if faturamento_em is None:
                qtd_faturada = 0
            elif random.random() < 0.15:
                qtd_faturada = int(qtd_pedida * random.uniform(0.4, 0.9))
            else:
                qtd_faturada = qtd_pedida

            data_faturamento = (
                faturamento_em.date() if faturamento_em is not None else None
            )

            itens.append(
                {
                    "item_numero": n_item,
                    "sku": sku,
                    "descricao": desc,
                    "qtd_pedida": qtd_pedida,
                    "qtd_faturada": qtd_faturada,
                    "data_faturamento": data_faturamento,
                }
            )

        pedidos.append(
            {
                "erp_id": None,
                "numero": f"PED-{2026000 + i}",
                "numero_interno": str(10000 + i),
                "cliente": random.choice(clientes),
                "data_pedido": data_pedido,
                "data_solicitada_cliente": data_digitacao,
                "contract_date": contract_date,
                "faturamento_em": faturamento_em,
                "embarque_em": embarque_em,
                "nota_fiscal_numero": nota_fiscal_numero,
                "nota_fiscal_serie": nota_fiscal_serie,
                "itens": itens,
            }
        )

    return pedidos


# Query do Jundsoft. Mapeamento validado contra a base real:
#   numero pedido      -> TB_PV_01.PV01_NUMERO_CLIENTE (fallback PV01_NUMERO_INTERNO)
#   data digitacao     -> TB_PV_01.PV01_DATA_DIGITACAO_H
#   Contract Date      -> TB_PV_02.PV02_DIAS_ENTREGA (texto DD/MM/AAAA)
#   cliente            -> TB_CD_01.CD01_NOME
#   sku / descricao    -> TB_CD_04.CD04_CODIGO_INTERNO / TB_PV_02.PV02_DESCRICAO
#   qtd pedida/faturada-> TB_PV_02.PV02_QTDE / PV02_QTDE_FATURADA
#   faturamento/NF    -> ultima TB_FT_01 nao cancelada por emissao/FT01_ID
#   embarque          -> FT01_DATA_EMBARQUE da mesma nota fiscal
# Campos da tela Comercial (somente leitura, por item):
#   preco / total     -> TB_PV_02.PV02_VALOR_UNITARIO; total = preco x quantidade
#   item do cliente   -> TB_PV_02.PV02_PEDIDO_CLIENTE_ITEM_XML
#   cod. do cliente   -> texto "... CÓD.: x" de TB_PV_02.PV02_APLICACAO
#   contrato / serial -> texto livre de TB_PV_01.PV01_OBS_NF ("CONTRATO: n",
#                        "Serial Item n: a à b"); so os trechos extraidos saem
#                        daqui, o texto bruto (dados bancarios) nunca e exposto
#   NF do item        -> nota nao cancelada que contem o item (TB_FT_02.PV02_ID)
_SQL_JUNDSOFT = """
SELECT
    h.PV01_ID,
    h.PV01_NUMERO_CLIENTE,
    h.PV01_NUMERO_INTERNO,
    h.PV01_OBS_NF,
    cli.CD01_NOME,
    h.PV01_DATA_PEDIDO,
    h.PV01_DATA_DIGITACAO_H,
    TRY_CONVERT(
        date,
        NULLIF(LTRIM(RTRIM(i.PV02_DIAS_ENTREGA)), ''),
        103
    ) AS contract_date,
    i.PV02_ID,
    i.PV02_ITEM,
    i.PV02_DESCRICAO,
    i.PV02_APLICACAO,
    i.PV02_PEDIDO_CLIENTE_ITEM_XML,
    i.PV02_VALOR_UNITARIO,
    prod.CD04_CODIGO_INTERNO,
    i.PV02_QTDE,
    i.PV02_QTDE_FATURADA,
    ft.faturamento_em,
    ft.embarque_em,
    ft.nota_fiscal_numero,
    ft.nota_fiscal_serie,
    fi.nf_item_numero,
    fi.nf_item_serie,
    fi.nf_item_emissao,
    fi.nf_item_embarque,
    fi.nf_item_entrega
FROM TB_PV_01 h
JOIN TB_PV_02 i ON i.PV01_ID = h.PV01_ID
LEFT JOIN TB_CD_01 cli ON cli.CD01_ID = h.CD01_ID
LEFT JOIN TB_CD_04 prod ON prod.CD04_ID = i.CD04_ID
OUTER APPLY (
    SELECT TOP (1)
        f1.FT01_NOTA AS nf_item_numero,
        f1.FT01_SERIE AS nf_item_serie,
        f1.FT01_DATA_EMISSAO_H AS nf_item_emissao,
        f1.FT01_DATA_EMBARQUE AS nf_item_embarque,
        f1.FT01_DATA_ENTREGA AS nf_item_entrega
    FROM TB_FT_02 f2
    JOIN TB_FT_01 f1 ON f1.FT01_ID = f2.FT01_ID
    WHERE f2.PV02_ID = i.PV02_ID
      AND f1.FT01_CANCELADA = 0
      AND f1.FT01_DATA_EMISSAO_H IS NOT NULL
    ORDER BY f1.FT01_DATA_EMISSAO_H DESC, f1.FT01_ID DESC
) fi
OUTER APPLY (
    SELECT TOP (1)
        f.FT01_DATA_EMISSAO_H AS faturamento_em,
        f.FT01_DATA_EMBARQUE AS embarque_em,
        f.FT01_NOTA AS nota_fiscal_numero,
        f.FT01_SERIE AS nota_fiscal_serie
    FROM TB_FT_01 f
    WHERE f.PV01_ID = h.PV01_ID
      AND f.FT01_CANCELADA = 0
      AND f.FT01_DATA_EMISSAO_H IS NOT NULL
    ORDER BY f.FT01_DATA_EMISSAO_H DESC, f.FT01_ID DESC
) ft
WHERE h.PV01_CANCELADO = 0 AND h.PV01_EFETIVADO = 1
  AND h.PV01_DATA_DIGITACAO_H >= DATEADD(month, -{meses}, GETDATE())
ORDER BY h.PV01_ID, i.PV02_ITEM
"""


def _dt(valor):
    """Normaliza datas do pyodbc, que podem chegar como date, datetime ou texto ISO."""
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str):
        texto = valor.strip()
        try:
            return datetime.fromisoformat(texto).date()
        except ValueError as exc:
            raise ValueError(f"Data inesperada retornada pelo JUND: {valor!r}") from exc
    raise TypeError(f"Tipo de data inesperado retornado pelo JUND: {type(valor).__name__}")


def _datetime_erp(valor):
    """Preserva data e hora retornadas pelo JUND sem inventar fuso."""
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor
    if isinstance(valor, date):
        return datetime(valor.year, valor.month, valor.day)
    if isinstance(valor, str):
        texto = valor.strip()
        try:
            parsed = datetime.fromisoformat(texto)
        except ValueError as exc:
            raise ValueError(
                f"Data/hora inesperada retornada pelo JUND: {valor!r}"
            ) from exc
        return parsed
    raise TypeError(
        f"Tipo de data/hora inesperado retornado pelo JUND: {type(valor).__name__}"
    )


def _texto_erp(valor) -> str | None:
    """Normaliza identificadores ERP como texto sem perder sufixos."""
    if valor is None:
        return None
    texto = str(valor).strip()
    return texto or None


_RE_CONTRATO = re.compile(r"CONTRATO\s*:?\s*([0-9][0-9A-Za-z./\-]*)", re.IGNORECASE)
_RE_SERIAL = re.compile(r"Serial\s+Item\s+(\d+)\s*:\s*([^;*]+)", re.IGNORECASE)
# "CÓD." pode chegar com 1 ou 2 caracteres no lugar do "Ó", conforme o driver.
_RE_COD_CLIENTE = re.compile(
    r"C.{1,2}D\.?\s*:\s*([0-9A-Za-z][0-9A-Za-z.\-/]*)", re.IGNORECASE
)


def extrair_contrato(obs: str | None) -> str | None:
    """Numero do contrato escrito em PV01_OBS_NF ("CONTRATO: 4600092216")."""
    if not obs:
        return None
    achado = _RE_CONTRATO.search(obs)
    return achado.group(1).rstrip(".-/") if achado else None


def extrair_seriais(obs: str | None) -> dict[int, str]:
    """Faixas de numero de serie por item do cliente ("Serial Item 10: a à b")."""
    if not obs:
        return {}
    return {
        int(item): faixa.strip().rstrip(". ")
        for item, faixa in _RE_SERIAL.findall(obs)
        if faixa.strip().rstrip(". ")
    }


def extrair_cod_cliente(aplicacao: str | None) -> str | None:
    """Codigo do material no cliente, escrito em PV02_APLICACAO ("CÓD.: 50-000-...")."""
    if not aplicacao:
        return None
    achado = _RE_COD_CLIENTE.search(aplicacao)
    return achado.group(1).rstrip(".-/") if achado else None


def _total_item(unitario, quantidade) -> float | None:
    """Total do item = preco unitario x quantidade (sem IPI, frete ou seguro)."""
    if unitario is None or quantidade is None:
        return None
    return round(float(unitario) * float(quantidade), 2)


def _decimal_ou_none(valor) -> float | None:
    return float(valor) if valor is not None else None


def _buscar_pedidos_sqlserver(meses: int) -> list[dict]:
    import pyodbc  # importado aqui para nao ser dependencia no modo mock

    settings = get_settings()
    conn = pyodbc.connect(settings.jundsoft_conn_str, timeout=15, readonly=True)
    try:
        cur = conn.cursor()
        cur.execute(_SQL_JUNDSOFT.format(meses=int(meses)))
        pedidos: dict[int, dict] = {}
        seriais_por_pedido: dict[int, dict[int, str]] = {}
        for r in cur.fetchall():
            pv01 = r.PV01_ID
            pedido = pedidos.get(pv01)
            if pedido is None:
                numero_interno = (
                    str(r.PV01_NUMERO_INTERNO).strip()
                    if r.PV01_NUMERO_INTERNO is not None
                    else None
                )
                numero = (r.PV01_NUMERO_CLIENTE or "").strip() or (
                    f"INT-{numero_interno}" if numero_interno else "(sem numero)"
                )
                pedido = {
                    "erp_id": pv01,
                    "numero": numero,
                    "numero_interno": numero_interno,
                    "cliente": (r.CD01_NOME or "(sem cadastro)").strip(),
                    "data_pedido": _dt(r.PV01_DATA_PEDIDO),
                    "data_solicitada_cliente": _dt(r.PV01_DATA_DIGITACAO_H),
                    "contract_date": None,
                    "faturamento_em": _datetime_erp(r.faturamento_em),
                    "embarque_em": _datetime_erp(r.embarque_em),
                    "nota_fiscal_numero": _texto_erp(r.nota_fiscal_numero),
                    "nota_fiscal_serie": _texto_erp(r.nota_fiscal_serie),
                    "contrato": extrair_contrato(r.PV01_OBS_NF),
                    "itens": [],
                }
                pedidos[pv01] = pedido
                seriais_por_pedido[pv01] = extrair_seriais(r.PV01_OBS_NF)

            contract_date = _dt(r.contract_date)
            contract_date_atual = pedido["contract_date"]
            if contract_date is not None:
                if contract_date_atual is not None and contract_date != contract_date_atual:
                    logger.warning(
                        "Contract Date divergente entre itens do pedido JUND PV01_ID=%s: "
                        "%s e %s; usando a data mais antiga.",
                        pv01,
                        contract_date_atual,
                        contract_date,
                    )
                    pedido["contract_date"] = min(contract_date_atual, contract_date)
                elif contract_date_atual is None:
                    pedido["contract_date"] = contract_date

            item_cliente = (
                int(r.PV02_PEDIDO_CLIENTE_ITEM_XML)
                if r.PV02_PEDIDO_CLIENTE_ITEM_XML
                else None
            )
            pedido["itens"].append(
                {
                    "item_numero": int(r.PV02_ITEM or 0),
                    "sku": (r.CD04_CODIGO_INTERNO or "").strip(),
                    "descricao": (r.PV02_DESCRICAO or "").strip(),
                    "qtd_pedida": float(r.PV02_QTDE or 0),
                    "qtd_faturada": float(r.PV02_QTDE_FATURADA or 0),
                    "data_faturamento": (
                        pedido["faturamento_em"].date()
                        if pedido["faturamento_em"] is not None
                        else None
                    ),
                    # Campos da tela Comercial (somente leitura).
                    "item_cliente": item_cliente,
                    "cod_cliente": extrair_cod_cliente(r.PV02_APLICACAO),
                    "valor_unitario": _decimal_ou_none(r.PV02_VALOR_UNITARIO),
                    "valor_total": _total_item(r.PV02_VALOR_UNITARIO, r.PV02_QTDE),
                    "serial": (
                        seriais_por_pedido[pv01].get(item_cliente)
                        if item_cliente is not None
                        else None
                    ),
                    "nf_numero": _texto_erp(r.nf_item_numero),
                    "nf_serie": _texto_erp(r.nf_item_serie),
                    "nf_emissao": _datetime_erp(r.nf_item_emissao),
                    "nf_embarque": _dt(r.nf_item_embarque),
                    "nf_entrega": _dt(r.nf_item_entrega),
                }
            )
        return list(pedidos.values())
    finally:
        conn.close()


def _aplicar_lem_automatico(pedidos: list[dict], meses: int) -> None:
    """Anexa inicio/fim da inspecao LEM (jigadb) a cada pedido do JUND.

    Com LEM automatico todos os pedidos recebem ``lem_automatico=True``; os que
    ainda nao tem OS INSP ficam com inicio/fim nulos (LEM pendente).
    """
    if not get_settings().lem_automatico:
        return
    from .jigadb_lem import buscar_inspecoes_por_pedido

    inspecoes = buscar_inspecoes_por_pedido(meses)
    for pedido in pedidos:
        inicio, fim = inspecoes.get(pedido["erp_id"], (None, None))
        pedido["lem_automatico"] = True
        pedido["lem_inicio_em"] = inicio
        pedido["lem_fim_em"] = fim


def _aplicar_producao_automatica(pedidos: list[dict], meses: int) -> None:
    """Anexa inicio/fim da Producao (jigadb) a cada pedido do JUND.

    Com Producao automatica todos os pedidos recebem ``producao_automatica=True``;
    os sem lacracao ficam com inicio/fim nulos e os ainda em andamento so com o
    inicio (o fim aparece quando todos os lotes terminam).
    """
    if not get_settings().producao_automatica:
        return
    from .jigadb_producao import buscar_producao_por_pedido

    producao = buscar_producao_por_pedido(meses)
    for pedido in pedidos:
        inicio, fim = producao.get(pedido["erp_id"], (None, None))
        pedido["producao_automatica"] = True
        pedido["producao_inicio_em"] = inicio
        pedido["producao_fim_em"] = fim


def buscar_pedidos_erp(
    qtd_pedidos: int = 120,
    seed: int | None = 42,
    meses: int = 12,
) -> list[dict]:
    """Retorna pedidos normalizados do mock ou do SQL Server read-only."""
    settings = get_settings()
    if settings.erp_source == "mock":
        return _gerar_pedidos_fake(qtd_pedidos, seed)
    if settings.erp_source == "sqlserver":
        pedidos = _buscar_pedidos_sqlserver(meses)
        _aplicar_lem_automatico(pedidos, meses)
        _aplicar_producao_automatica(pedidos, meses)
        return pedidos
    raise ValueError(f"erp_source invalido: {settings.erp_source!r}")
