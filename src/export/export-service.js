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

export function sanitizeFilenameSegment(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function exportFilename(
  extension,
  { now = new Date(), title = "", prefix = "triangle" } = {}
) {
  const slug = sanitizeFilenameSegment(title);
  const fallback = `${sanitizeFilenameSegment(prefix) || "triangle"}-${formatExportDate(now)}`;

  return `${slug || fallback}.${extension}`;
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
  graphDocument = null,
  graphState,
  graphAdapter = null,
  stageElement,
  clipboard = typeof navigator === "undefined" ? null : navigator.clipboard,
  documentRef = typeof document === "undefined" ? null : document,
  now = new Date()
}) {
  const activeState = graphDocument?.state || graphState;
  const title = graphDocument?.title || "Triangle des besoins";
  const activeDocument = graphDocument
    ? { ...graphDocument, state: activeState }
    : { title, state: activeState };
  const filenameOptions = {
    now,
    title,
    prefix: graphAdapter?.filenamePrefix || "triangle"
  };
  const model = buildExportModel(activeState, { title });

  if (format === "pdf") {
    const filename = exportFilename("pdf", filenameOptions);
    if (graphAdapter?.exportPdf) {
      await graphAdapter.exportPdf({ stageElement, filename, graphDocument });
    } else {
      await exportStageToPdf(stageElement, { filename });
    }
    return { ok: true, type: "download" };
  }

  if (format === "markdown") {
    const markdown = graphAdapter?.buildMarkdown
      ? graphAdapter.buildMarkdown(activeDocument)
      : buildMarkdownExport(model);
    downloadBlob(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
      exportFilename("md", filenameOptions),
      documentRef
    );
    return { ok: true, type: "download" };
  }

  if (format === "json") {
    downloadBlob(
      new Blob([buildJsonExport(graphDocument ? activeDocument : activeState)], {
        type: "application/json;charset=utf-8"
      }),
      exportFilename("json", filenameOptions),
      documentRef
    );
    return { ok: true, type: "download" };
  }

  if (format === "text") {
    const plainText = graphAdapter?.buildPlainText
      ? graphAdapter.buildPlainText(activeDocument)
      : buildPlainTextExport(model);
    await writeClipboardText(
      plainText,
      clipboard,
      documentRef
    );
    return { ok: true, type: "clipboard" };
  }

  throw new Error(`Unsupported export format: ${format}`);
}
