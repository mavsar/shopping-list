import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { defineElement } from "@lordicon/element";

import App from "./App";
import "./styles.css";

if (typeof window !== "undefined" && !window.customElements.get("lord-icon")) {
  defineElement();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
