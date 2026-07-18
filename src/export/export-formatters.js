function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildJsonExport(value) {
  return JSON.stringify(clone(value), null, 2) + "\n";
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
