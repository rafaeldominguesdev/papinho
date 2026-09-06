import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "./index.css";
/** mostra o erro na tela em vez de morrer com tela branca — pra dar pra ver
 *  e mandar print quando algo quebra. */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("[papinho] render crash:", err, info.componentStack);
  }
  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#0b0a0b",
            color: "#f1eeef",
            font: '12px ui-monospace, "JetBrains Mono", monospace',
            padding: 24,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          <div style={{ color: "#ff3b3b", fontWeight: 700, marginBottom: 12 }}>
            a interface quebrou — {this.state.err.message}
          </div>
          {this.state.err.stack}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => this.setState({ err: null })}
              style={{
                background: "#ff3b3b",
                color: "#0b0a0b",
                border: 0,
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              tentar de novo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

let overlay: HTMLDivElement | null = null;
function showGlobalError(kind: string, msg: string) {
  console.error(`[papinho] ${kind}:`, msg);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:99999;max-height:40vh;overflow:auto;" +
      "background:#2a0d0d;color:#ffd7d7;font:11px ui-monospace,monospace;padding:10px 14px;" +
      "border-top:2px solid #ff3b3b;white-space:pre-wrap";
    overlay.onclick = () => {
      overlay?.remove();
      overlay = null;
    };
    document.body.appendChild(overlay);
  }
  overlay.textContent = `[${kind}] ${msg}\n(clique pra fechar)`;
}
window.addEventListener("error", (e) =>
  showGlobalError("erro", `${e.message} — ${e.filename}:${e.lineno}`),
);
window.addEventListener("unhandledrejection", (e) =>
  showGlobalError("promise", String((e as PromiseRejectionEvent).reason)),
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
