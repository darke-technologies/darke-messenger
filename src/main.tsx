import ReactDOM from "react-dom/client";
import "./styles.css";
import { initTheme } from "./theme";
import App from "./App";

initTheme();

// No StrictMode: its double-mount races the native browse webview.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
