import { useEffect, useRef, useState } from "react";
import { Columns } from "@phosphor-icons/react";

// A grade tem 14 colunas possíveis. Mostrar todas garante scroll horizontal em
// qualquer monitor, então o padrão é o subconjunto que responde "o que preciso
// agir agora?" e o resto fica aqui, sob demanda.
export default function SeletorColunas({ colunas, visiveis, onChange, onRestaurar }) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef(null);
  const gatilhoRef = useRef(null);

  const opcionais = colunas.filter((coluna) => !coluna.fixa);
  const totalVisiveis = colunas.filter(
    (coluna) => coluna.fixa || visiveis.includes(coluna.key)
  ).length;

  useEffect(() => {
    if (!aberto) return undefined;

    function aoClicarFora(evento) {
      if (!containerRef.current?.contains(evento.target)) setAberto(false);
    }
    function aoTeclar(evento) {
      if (evento.key !== "Escape") return;
      evento.stopPropagation();
      setAberto(false);
      gatilhoRef.current?.focus();
    }

    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  function alternar(chave) {
    onChange(
      visiveis.includes(chave)
        ? visiveis.filter((item) => item !== chave)
        : [...visiveis, chave]
    );
  }

  return (
    <div className="popover-wrap" ref={containerRef}>
      <button
        type="button"
        ref={gatilhoRef}
        className={`btn-sec btn-compacto ${aberto ? "ativo" : ""}`}
        aria-expanded={aberto}
        aria-haspopup="true"
        onClick={() => setAberto((valor) => !valor)}
      >
        <Columns className="ico" size={16} aria-hidden="true" />
        Colunas <span className="btn-contador">{totalVisiveis}</span>
      </button>

      {aberto && (
        <div className="popover" role="group" aria-label="Colunas visíveis">
          <div className="popover-head">
            <span>Colunas visíveis</span>
            <button type="button" className="btn-link" onClick={onRestaurar}>
              Restaurar padrão
            </button>
          </div>
          <ul className="popover-lista">
            {colunas
              .filter((coluna) => coluna.fixa)
              .map((coluna) => (
                <li key={coluna.key}>
                  <label className="popover-opcao fixa">
                    <input type="checkbox" checked disabled readOnly />
                    <span>{coluna.label}</span>
                    <small>sempre</small>
                  </label>
                </li>
              ))}
            {opcionais.map((coluna) => (
              <li key={coluna.key}>
                <label className="popover-opcao">
                  <input
                    type="checkbox"
                    checked={visiveis.includes(coluna.key)}
                    onChange={() => alternar(coluna.key)}
                  />
                  <span>{coluna.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
