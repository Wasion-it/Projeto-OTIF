import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
// Uma família, auto-hospedada (sem CDN), nos três pesos usados.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import App from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      closeButton
      toastOptions={{ className: "toast", duration: 4000 }}
    />
  </React.StrictMode>
);
