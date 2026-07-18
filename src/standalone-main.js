import "./styles/app.css";
import "./styles/auth-shell.css";
import {
  mountStandaloneApplication,
  renderStandaloneStartupError
} from "./startup/standalone-main.js";

const root = document.querySelector("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

Promise.resolve()
  .then(() => mountStandaloneApplication(root))
  .catch(error => {
    console.error("Triangle standalone startup failed", {
      error,
      stack: error?.stack,
      startupMode: "standalone"
    });
    renderStandaloneStartupError(root);
  });
