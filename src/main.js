import "./styles/app.css";
import "./styles/auth-shell.css";
import { isDemoModeLocation } from "./startup/startup-mode.js";

const root = document.querySelector("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

if (isDemoModeLocation(window.location)) {
  const { mountDemoApplication } = await import("./startup/demo-main.js");
  await mountDemoApplication(root);
} else {
  const { mountAuthenticatedApplication } = await import(
    "./startup/authenticated-main.js"
  );
  mountAuthenticatedApplication(root);
}
