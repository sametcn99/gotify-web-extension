import { createRoot } from "react-dom/client";
import App from "../app/App";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("App root element not found");
}

const reactRoot = createRoot(rootElement);
reactRoot.render(<App />);
