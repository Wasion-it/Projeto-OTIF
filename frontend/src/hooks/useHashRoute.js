import { useEffect, useState } from "react";

export const ROTAS_VALIDAS = ["visao-geral", "pedidos", "ajustes"];

function rotaAtual() {
  const h = window.location.hash.replace(/^#\/?/, "");
  return ROTAS_VALIDAS.includes(h) ? h : "visao-geral";
}

// Roteamento leve por hash (sem dependência externa). Suporta back/forward do navegador
// e links diretos (#/pedidos).
export function useHashRoute() {
  const [route, setRoute] = useState(rotaAtual());

  useEffect(() => {
    const onHash = () => setRoute(rotaAtual());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (r) => {
    window.location.hash = `/${r}`;
  };

  return { route, navigate };
}
