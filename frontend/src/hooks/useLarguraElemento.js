import { useLayoutEffect, useState } from "react";

// Largura real do elemento, em pixels. Permite desenhar SVG em coordenadas
// reais em vez de usar preserveAspectRatio="none", que distorce traços,
// círculos e texto quando o container muda de largura.
//
// useLayoutEffect (e não useEffect) porque a medição precisa acontecer antes da
// pintura: com useEffect o gráfico aparece vazio por um frame.
export function useLarguraElemento(ref) {
  const [largura, setLargura] = useState(0);

  useLayoutEffect(() => {
    const elemento = ref.current;
    if (!elemento) return undefined;

    setLargura(Math.round(elemento.getBoundingClientRect().width));

    const observador = new ResizeObserver((entradas) => {
      const medida = entradas[0]?.contentRect?.width ?? 0;
      setLargura(Math.round(medida));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [ref]);

  return largura;
}
