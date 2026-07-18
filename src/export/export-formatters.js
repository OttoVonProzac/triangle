import { cloneGraphState } from "../graph/graph-state.js";

export function buildJsonExport(graphState) {
  return JSON.stringify(cloneGraphState(graphState), null, 2) + "\n";
}

export function buildMarkdownExport(model) {
  const lines = [`# ${model.title}`, ""];

  model.sections.forEach(section => {
    lines.push(`## ${section.title}`, "");

    section.bubbles.forEach(bubble => {
      lines.push(`### ${bubble.title}`, "");
    });
  });

  return lines.join("\n").trimEnd() + "\n";
}

export function buildPlainTextExport(model) {
  const lines = [model.title, ""];

  model.sections.forEach(section => {
    lines.push(section.title);

    section.bubbles.forEach(bubble => {
      lines.push(`- ${bubble.title}`);
    });

    lines.push("");
  });

  return lines.join("\n").trimEnd() + "\n";
}
