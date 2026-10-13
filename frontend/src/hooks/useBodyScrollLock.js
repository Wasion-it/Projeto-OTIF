import { useEffect } from "react";

let quantidadeLocks = 0;
let overflowAnterior = "";

export function useBodyScrollLock() {
  useEffect(() => {
    if (quantidadeLocks === 0) {
      overflowAnterior = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    quantidadeLocks += 1;

    return () => {
      quantidadeLocks = Math.max(0, quantidadeLocks - 1);
      if (quantidadeLocks === 0) {
        document.body.style.overflow = overflowAnterior;
      }
    };
  }, []);
}
