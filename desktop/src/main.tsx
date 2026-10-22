import React from "react";
import ReactDOM from "react-dom/client";
import "@vietdesk/ui/tokens.css";
import "./styles.css";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Không tìm thấy phần tử #root trong index.html");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
