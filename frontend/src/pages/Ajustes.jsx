import { useEffect, useState } from "react";
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

  if (carregando) return <p className="txt-sec">Carregando parâmetros…</p>;

  return (
    <form className="form form-estreito" onSubmit={salvarParametros}>
      {erro && (
        <div className="faixa-erro" role="alert">
          <span>{erro}</span>
        </div>
      )}

      <label className="campo">
        <span className="campo-rotulo">Meta de OTIF (%)</span>
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          aria-describedby="cfg-meta-ajuda"
          required
        />
        <span className="campo-ajuda" id="cfg-meta-ajuda">
          Abaixo dela, o OTIF aparece em vermelho na Visão geral.
        </span>
      </label>

      <label className="campo">
        <span className="campo-rotulo">Alertar antes do Contract Date (dias)</span>
        <input
          type="number"
          min="0"
          max="365"
          value={diasAlerta}
          onChange={(e) => setDiasAlerta(e.target.value)}
          aria-describedby="cfg-dias-ajuda"
          required
        />
        <span className="campo-ajuda" id="cfg-dias-ajuda">
          Pedidos pendentes nessa janela entram em Atenção.
        </span>
      </label>

      <p className="txt-sec">
        O prazo oficial é o Contract Date informado pelo comercial no pedido do JUND. Ele não é
        calculado a partir da digitação. Pedidos sem essa data ficam fora de On Time e OTIF até a
        correção.
      </p>

      <div className="modal-acoes form-acoes-esq">
        <button className="btn btn-pri" type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar parâmetros"}
        </button>
      </div>
    </form>
  );
}
