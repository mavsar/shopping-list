import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { defineElement } from "@lordicon/element";

import App from "./App";
import "./styles.css";

if (typeof window !== "undefined" && !window.customElements.get("lord-icon")) {
  defineElement();
}

declare global {
  interface Window {
    __shoppingListAppHeightBound?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__shoppingListAppHeightBound) {
  const updateAppHeight = () => {
    document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
  };

  updateAppHeight();

  window.addEventListener("resize", updateAppHeight);
  window.addEventListener("orientationchange", updateAppHeight);
  window.addEventListener("pageshow", updateAppHeight);
  window.visualViewport?.addEventListener("resize", updateAppHeight);

  window.__shoppingListAppHeightBound = true;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
