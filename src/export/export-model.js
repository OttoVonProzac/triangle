import { normalizeGraphState } from "../graph/graph-state.js";

export const EXPORT_SECTIONS = Object.freeze([
  {
    id: "child-development",
    title: "Développement de l'enfant",
    bubbleIds: Object.freeze([
      "blue-learn",
      "blue-health",
      "blue-identity",
      "blue-relations",
      "blue-family"
    ])
  },
  {
    id: "parental-role",
    title: "Rôle parental",
    bubbleIds: Object.freeze([
      "violet-care",
      "violet-engagement",
      "violet-protect",
      "violet-support",
      "violet-frame"
    ])
  },
  {
    id: "environment",
    title: "Environnement",
    bubbleIds: Object.freeze([
      "teal-history",
      "teal-people",
      "teal-home",
      "teal-work"
    ])
  }
]);

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function oneLine(text) {
  return normalizeText(text).replace(/\s+/g, " ") || "Sans titre";
}

export function buildExportModel(graphState) {
  const graph = normalizeGraphState(graphState);

  return {
    title: "Triangle des besoins",
    graphId: graph.graphId,
    updatedAt: graph.updatedAt,
    sections: EXPORT_SECTIONS.map(section => ({
      id: section.id,
      title: section.title,
      bubbles: section.bubbleIds.map(id => {
        const text = normalizeText(graph.content.bubbles[id]?.text);

        return {
          id,
          title: oneLine(text),
          text
        };
      })
    }))
  };
}
