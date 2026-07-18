import { EXPORT_FORMATS, exportGraph } from "./export-service.js";

const NORMAL_LABEL = "Export";
const BUSY_LABEL = "Export...";
const COPIED_LABEL = "Copié ✓";
const ERROR_LABEL = "Erreur";

function logExportError(error) {
  if (import.meta.env?.DEV) {
    console.error(error);
  }
}

function renderExportControl(container) {
  container.innerHTML = `
    <form class="export-toolbar" aria-label="Exporter le triangle">
      <select class="export-format" aria-label="Format d'export">
        ${EXPORT_FORMATS.map(format => `
          <option value="${format.value}">${format.label}</option>
        `).join("")}
      </select>
      <button class="export-button" type="submit">${NORMAL_LABEL}</button>
    </form>
  `;
}

export function mountExportControl({
  container,
  graphController,
  stageElement
}) {
  if (!container) {
    return () => {};
  }

  let restoreTimer = null;
  let disposed = false;
  renderExportControl(container);

  const form = container.querySelector(".export-toolbar");
  const select = container.querySelector(".export-format");
  const button = container.querySelector(".export-button");

  function clearRestoreTimer() {
    if (restoreTimer) {
      clearTimeout(restoreTimer);
      restoreTimer = null;
    }
  }

  function restoreNormalLabel(delayMs = 0) {
    clearRestoreTimer();

    if (delayMs) {
      restoreTimer = setTimeout(() => {
        if (!disposed) {
          button.textContent = NORMAL_LABEL;
        }
      }, delayMs);
      return;
    }

    button.textContent = NORMAL_LABEL;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearRestoreTimer();

    button.disabled = true;
    select.disabled = true;
    button.textContent = BUSY_LABEL;

    try {
      const result = await exportGraph({
        format: select.value,
        graphState: graphController.getState(),
        stageElement
      });

      if (result.type === "clipboard") {
        button.textContent = COPIED_LABEL;
        restoreNormalLabel(1400);
      } else {
        restoreNormalLabel();
      }
    } catch (error) {
      logExportError(error);
      button.textContent = ERROR_LABEL;
      restoreNormalLabel(1600);
    } finally {
      if (!disposed) {
        button.disabled = false;
        select.disabled = false;
      }
    }
  }

  form.addEventListener("submit", handleSubmit);

  return () => {
    disposed = true;
    clearRestoreTimer();
    form.removeEventListener("submit", handleSubmit);
    container.replaceChildren();
  };
}
