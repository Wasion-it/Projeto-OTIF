import { useEffect, useState } from "react";

// Preferências de visualização (densidade, colunas visíveis, linhas por página)
// são escolhas do operador, não estado de domínio: ficam no navegador para que
// recarregar a página não jogue a tabela de volta no padrão.
export function usePreferencia(chave, valorInicial) {
  const [valor, setValor] = useState(() => {
    try {
      const bruto = window.localStorage.getItem(chave);
      if (bruto == null) return valorInicial;
      return JSON.parse(bruto);
    } catch {
      return valorInicial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // Navegação privada ou quota cheia: a preferência apenas não persiste.
    }
  }, [chave, valor]);

  return [valor, setValor];
}
