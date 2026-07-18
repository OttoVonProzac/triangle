import {
  buildJsonExport,
  buildMarkdownExport,
  buildPlainTextExport
} from "./export-formatters.js";
import { buildExportModel } from "./export-model.js";
import { exportStageToPdf } from "./pdf-export.js";

export const EXPORT_FORMATS = Object.freeze([
  { value: "pdf", label: "PDF" },
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "text", label: "Plain text" }
]);

export function formatExportDate(now = new Date()) {
  const date = typeof now === "function" ? now() : now;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

export function exportFilename(extension, { now = new Date() } = {}) {
  return `triangle-${formatExportDate(now)}.${extension}`;
}

function downloadBlob(blob, filename, documentRef = document) {
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement("a");

  link.href = url;
  link.download = filename;
  link.style.display = "none";
  documentRef.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function writeClipboardText(text, clipboard, documentRef = document) {
  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return;
  }

  const textarea = documentRef.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  documentRef.body.append(textarea);
  textarea.select();

  const copied = documentRef.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

export async function exportGraph({
  format,
  graphState,
  stageElement,
  clipboard = typeof navigator === "undefined" ? null : navigator.clipboard,
  documentRef = typeof document === "undefined" ? null : document,
  now = new Date()
}) {
  const model = buildExportModel(graphState);

  if (format === "pdf") {
    await exportStageToPdf(stageElement, {
      filename: exportFilename("pdf", { now })
    });
    return { ok: true, type: "download" };
  }

  if (format === "markdown") {
    downloadBlob(
      new Blob([buildMarkdownExport(model)], { type: "text/markdown;charset=utf-8" }),
      exportFilename("md", { now }),
      documentRef
    );
    return { ok: true, type: "download" };
  }

  if (format === "json") {
    downloadBlob(
      new Blob([buildJsonExport(graphState)], {
        type: "application/json;charset=utf-8"
      }),
      exportFilename("json", { now }),
      documentRef
    );
    return { ok: true, type: "download" };
  }

  if (format === "text") {
    await writeClipboardText(
      buildPlainTextExport(model),
      clipboard,
      documentRef
    );
    return { ok: true, type: "clipboard" };
  }

  throw new Error(`Unsupported export format: ${format}`);
}
