import { useEffect, useState } from "react";
import { FloppyDisk, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api } from "../api.js";

export default function Ajustes({ onConfigChange }) {
  const [meta, setMeta] = useState(95);
  const [diasAlerta, setDiasAlerta] = useState(7);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      setErro(null);
      try {
        const cfg = await api.config();
        setMeta(cfg.meta_otif);
        setDiasAlerta(cfg.dias_alerta_prazo);
      } catch (e) {
        setErro(e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  async function salvarParametros(e) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const cfg = await api.salvarConfig({
        meta_otif: Number(meta),
        dias_alerta_prazo: Number(diasAlerta),
      });
      toast.success("Parâmetros salvos.");
      onConfigChange?.(cfg);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <p className="vazio">Carregando parâmetros…</p>;

  return (
    <>
      {erro && (
        <div className="erro" role="alert">
          <WarningCircle className="ico" size={18} weight="fill" aria-hidden="true" />
          <span>{erro}</span>
        </div>
      )}

      <div className="ajustes-grid">
        <section className="panel" aria-labelledby="ajustes-meta">
          <div className="panel-head">
            <h3 id="ajustes-meta">Meta e alertas</h3>
          </div>
          <form className="form-grid" onSubmit={salvarParametros}>
            <label htmlFor="cfg-meta">
              Meta de OTIF
              <span className="campo-unidade">
                <input
                  id="cfg-meta"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={meta}
                  onChange={(e) => setMeta(e.target.value)}
                  aria-describedby="cfg-meta-ajuda"
                  required
                />
                <span aria-hidden="true">%</span>
              </span>
              <span className="campo-ajuda" id="cfg-meta-ajuda">
                Percentual que define verde ou vermelho nos indicadores.
              </span>
            </label>
            <label htmlFor="cfg-dias">
              Alertar antes do Contract Date
              <span className="campo-unidade">
                <input
                  id="cfg-dias"
                  type="number"
                  min="0"
                  max="365"
                  value={diasAlerta}
                  onChange={(e) => setDiasAlerta(e.target.value)}
                  aria-describedby="cfg-dias-ajuda"
                  required
                />
                <span aria-hidden="true">dias</span>
              </span>
              <span className="campo-ajuda" id="cfg-dias-ajuda">
                Pedidos pendentes nessa janela entram em Atenção.
              </span>
            </label>
            <div className="form-acoes">
              <button className="btn" type="submit" disabled={salvando}>
                <FloppyDisk className="ico" size={16} weight="bold" aria-hidden="true" />
                {salvando ? "Salvando…" : "Salvar parâmetros"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel config-note" aria-labelledby="fonte-contract-date">
          <div className="panel-head">
            <h3 id="fonte-contract-date">De onde vem o prazo</h3>
          </div>
          <p>
            O prazo oficial é o <strong>Contract Date informado pelo comercial no pedido do
            JUND</strong>. Ele não é calculado a partir da data de digitação e não usa SLA
            como alternativa.
          </p>
          <p>
            Pedidos sem uma data válida ficam sinalizados para correção no JUND e não entram
            no cálculo de On Time ou OTIF.
          </p>
        </section>
      </div>
    </>
  );
}
