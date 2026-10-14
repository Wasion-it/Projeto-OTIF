import { useEffect, useRef, useState } from "react";

// O padrão mostra só o que responde "onde está e o que fazer"; o resto fica
// aqui, sob demanda.
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
        className="btn btn-sec"
        aria-expanded={aberto}
        aria-haspopup="true"
        onClick={() => setAberto((valor) => !valor)}
      >
        Colunas ({totalVisiveis})
      </button>

      {aberto && (
        <div className="popover" role="group" aria-label="Colunas visíveis">
          <div className="popover-head">
            <span>Colunas visíveis</span>
            <button type="button" className="btn btn-texto btn-p" onClick={onRestaurar}>
              Restaurar padrão
            </button>
          </div>
          <ul className="popover-lista">
            {colunas
              .filter((coluna) => coluna.fixa)
              .map((coluna) => (
                <li key={coluna.key}>
                  <label className="opcao fixa">
                    <input type="checkbox" checked disabled readOnly />
                    <span>{coluna.label}</span>
                    <small>sempre</small>
                  </label>
                </li>
              ))}
            {opcionais.map((coluna) => (
              <li key={coluna.key}>
                <label className="opcao">
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
