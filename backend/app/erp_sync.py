"""Camada de sincronizacao com o ERP.

No esqueleto, `buscar_pedidos_erp()` gera dados FAKE. Em producao, a versao
SQL Server abriria uma conexao read-only com o Jundsoft e leria os pedidos.

A ideia e que o resto da aplicacao nunca fale direto com o Jundsoft: ele so
consome o formato normalizado retornado aqui. Trocar o mock pela consulta real
nao afeta models, routers nem frontend.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from faker import Faker

from .config import get_settings

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
    """Gera pedidos fake simulando o que viria do ERP.

    Distribui as datas nos ultimos ~6 meses e injeta cenarios variados:
    faturamento parcial (falha In Full), faturamento atrasado (atraso interno)
    e pedidos recentes ainda sem confirmacao (pendentes).
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
        # A data solicitada pelo cliente ja embute o lead time (12 a 25 dias).
        data_solicitada = data_pedido + timedelta(days=random.randint(12, 25))

        itens = []
        for n_item in range(1, random.randint(1, 4) + 1):
            sku, desc = random.choice(PRODUTOS)
            qtd_pedida = random.choice([10, 20, 50, 100, 200, 500])

            # 15% dos itens faturam parcial (vai falhar In Full).
            if random.random() < 0.15:
                qtd_faturada = int(qtd_pedida * random.uniform(0.4, 0.9))
            else:
                qtd_faturada = qtd_pedida

            # Faturamento (proxy da expedicao). No caso normal (~80%) fatura com
            # folga antes do prazo, deixando tempo para o transporte. Em ~20% ha
            # atraso interno: fatura em cima do prazo ou depois dele.
            if random.random() < 0.20:
                data_faturamento = data_solicitada - timedelta(days=random.randint(-4, 2))
            else:
                data_faturamento = data_solicitada - timedelta(days=random.randint(6, 12))

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
                "cliente": random.choice(clientes),
                "data_pedido": data_pedido,
                "data_solicitada_cliente": data_solicitada,
                "itens": itens,
            }
        )

    return pedidos


# Query do Jundsoft. Mapeamento validado contra a base real:
#   numero pedido      -> TB_PV_01.PV01_NUMERO_CLIENTE (fallback PV01_NUMERO_INTERNO)
#   data solicitada    -> TB_PV_01.PV01_DATA_DIGITACAO_H (timestamp de digitacao)
#   cliente            -> TB_CD_01.CD01_NOME
#   sku / descricao    -> TB_CD_04.CD04_CODIGO_INTERNO / TB_PV_02.PV02_DESCRICAO
#   qtd pedida/faturada-> TB_PV_02.PV02_QTDE / PV02_QTDE_FATURADA
#   data faturamento   -> MAX(TB_FT_01.FT01_DATA_EMISSAO) por pedido (nao cancelada)
_SQL_JUNDSOFT = """
SELECT
    h.PV01_ID,
    h.PV01_NUMERO_CLIENTE,
    h.PV01_NUMERO_INTERNO,
    cli.CD01_NOME,
    h.PV01_DATA_PEDIDO,
    h.PV01_DATA_DIGITACAO_H,
    i.PV02_ITEM,
    i.PV02_DESCRICAO,
    prod.CD04_CODIGO_INTERNO,
    i.PV02_QTDE,
    i.PV02_QTDE_FATURADA,
    ft.data_faturamento
FROM TB_PV_01 h
JOIN TB_PV_02 i ON i.PV01_ID = h.PV01_ID
LEFT JOIN TB_CD_01 cli ON cli.CD01_ID = h.CD01_ID
LEFT JOIN TB_CD_04 prod ON prod.CD04_ID = i.CD04_ID
LEFT JOIN (
    SELECT PV01_ID, MAX(FT01_DATA_EMISSAO) AS data_faturamento
    FROM TB_FT_01 WHERE FT01_CANCELADA = 0
    GROUP BY PV01_ID
) ft ON ft.PV01_ID = h.PV01_ID
WHERE h.PV01_CANCELADO = 0 AND h.PV01_EFETIVADO = 1
  AND h.PV01_DATA_DIGITACAO_H >= DATEADD(month, -{meses}, GETDATE())
ORDER BY h.PV01_ID, i.PV02_ITEM
"""


def _dt(valor):
    return valor.date() if valor is not None else None


def _buscar_pedidos_sqlserver(meses: int) -> list[dict]:
    import pyodbc  # importado aqui para nao ser dependencia no modo mock

    settings = get_settings()
    conn = pyodbc.connect(settings.jundsoft_conn_str, timeout=15, readonly=True)
    try:
        cur = conn.cursor()
        cur.execute(_SQL_JUNDSOFT.format(meses=int(meses)))
        pedidos: dict[int, dict] = {}
        for r in cur.fetchall():
            pv01 = r.PV01_ID
            pedido = pedidos.get(pv01)
            if pedido is None:
                numero = (r.PV01_NUMERO_CLIENTE or "").strip() or f"INT-{r.PV01_NUMERO_INTERNO}"
                pedido = {
                    "erp_id": pv01,
                    "numero": numero,
                    "cliente": (r.CD01_NOME or "(sem cadastro)").strip(),
                    "data_pedido": _dt(r.PV01_DATA_PEDIDO),
                    "data_solicitada_cliente": _dt(r.PV01_DATA_DIGITACAO_H),
                    "itens": [],
                }
                pedidos[pv01] = pedido
            pedido["itens"].append(
                {
                    "item_numero": int(r.PV02_ITEM or 0),
                    "sku": (r.CD04_CODIGO_INTERNO or "").strip(),
                    "descricao": (r.PV02_DESCRICAO or "").strip(),
                    "qtd_pedida": float(r.PV02_QTDE or 0),
                    "qtd_faturada": float(r.PV02_QTDE_FATURADA or 0),
                    "data_faturamento": _dt(r.data_faturamento),
                }
            )
        return list(pedidos.values())
    finally:
        conn.close()


def buscar_pedidos_erp(qtd_pedidos: int = 120, seed: int | None = 42, meses: int = 12) -> list[dict]:
    """Ponto unico de entrada dos dados do ERP.

    Retorna uma lista de pedidos normalizados. O restante da aplicacao depende
    apenas deste formato, independente da origem (mock ou SQL Server).
    """
    settings = get_settings()
    if settings.erp_source == "mock":
        return _gerar_pedidos_fake(qtd_pedidos, seed)
    if settings.erp_source == "sqlserver":
        return _buscar_pedidos_sqlserver(meses)
    raise ValueError(f"erp_source invalido: {settings.erp_source!r}")
