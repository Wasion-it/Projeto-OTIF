import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
// Fontes auto-hospedadas (sem CDN): Plex Sans para a interface e Plex Sans
// Condensed para números e cabeçalhos densos.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-sans-condensed/500.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "@fontsource/ibm-plex-sans-condensed/700.css";
import App from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{ className: "toast-otif", duration: 4000 }}
    />
  </React.StrictMode>
);
