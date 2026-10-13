import { useEffect, useRef } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock.js";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function ModalDialog({
  title,
  titleId,
  subtitle,
  busy = false,
  onClose,
  children,
}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);

  onCloseRef.current = onClose;
  busyRef.current = busy;
  useBodyScrollLock();

  function solicitarFechamento() {
    if (!busyRef.current) onCloseRef.current?.();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    const focoAnterior = document.activeElement;

    const frame = requestAnimationFrame(() => {
      const primeiroCampo = dialog?.querySelector(
        "input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
      );
      (primeiroCampo || dialog)?.focus();
    });

    function onKeyDown(event) {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          onCloseRef.current?.();
        }
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const focaveis = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(
        (elemento) => elemento.getClientRects().length > 0
      );
      if (focaveis.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? ultimo : primeiro).focus();
      } else if (event.shiftKey && document.activeElement === primeiro) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected) {
        requestAnimationFrame(() => focoAnterior.focus());
      }
    };
  }, []);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) solicitarFechamento();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        tabIndex={-1}
        ref={dialogRef}
      >
        <h3 id={titleId}>{title}</h3>
        {subtitle && <div className="modal-sub">{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
