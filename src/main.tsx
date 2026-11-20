import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "../src/styles/theme.css";
import "./vite-env.d.ts";

// 註冊 PWA Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    import("./pwa/registerSW").then(({ registerSWWithUpdatePrompt }) => registerSWWithUpdatePrompt());
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
