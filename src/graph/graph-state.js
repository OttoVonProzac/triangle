export const GRAPH_SCHEMA_VERSION = 1;
export const GRAPH_ID = "triangle";
export const LEGACY_LOCAL_STORAGE_KEY = "child-development-map-v5";
export const MAX_BUBBLE_TEXT_LENGTH = 2000;
export const MAX_GRAPH_BODY_BYTES = 64 * 1024;
export const MAX_GRAPH_FILE_BYTES = 128 * 1024;

export const DEFAULT_BUBBLE_TEXTS = Object.freeze({
  "blue-learn": "Apprendre, découvrir",
  "blue-health": "Santé",
  "blue-identity": "Identité",
  "blue-relations": "Ma relation\navec les autres",
  "blue-family": "Relations familiales",
  "violet-care": "Prendre soin",
  "violet-engagement": "Engagement\nrelationnel",
  "violet-protect": "Protéger",
  "violet-support": "Soutenir,\nencourager",
  "violet-frame": "Donner un cadre",
  "teal-history": "Histoire et\nfonctionnement familial",
  "teal-people": "Personnes\nressource",
  "teal-home": "Habiter",
  "teal-work": "Activité\nprofessionnelle"
});

export const BUBBLE_IDS = Object.freeze(Object.keys(DEFAULT_BUBBLE_TEXTS));
const BUBBLE_ID_SET = new Set(BUBBLE_IDS);

export class GraphStateValidationError extends Error {
  constructor(message, code = "invalid_graph_state") {
    super(message);
    this.name = "GraphStateValidationError";
    this.code = code;
  }
}

function isoTimestamp(now = new Date()) {
  if (typeof now === "function") {
    return isoTimestamp(now());
  }

  if (now instanceof Date) {
    return now.toISOString();
  }

  if (typeof now === "string") {
    return now;
  }

  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertObject(value, message, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GraphStateValidationError(message, code);
  }
}

export function isKnownBubbleId(id) {
  return BUBBLE_ID_SET.has(id);
}

export function createDefaultBubbleMap() {
  return Object.fromEntries(
    BUBBLE_IDS.map(id => [id, { text: DEFAULT_BUBBLE_TEXTS[id] }])
  );
}

export function createDefaultGraphState({ now = new Date() } = {}) {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    graphId: GRAPH_ID,
    updatedAt: isoTimestamp(now),
    content: {
      bubbles: createDefaultBubbleMap()
    }
  };
}

export function cloneGraphState(graphState) {
  return clone(graphState);
}

export function graphStateFromBubbleTexts(texts, { now = new Date() } = {}) {
  assertObject(texts, "Legacy graph data must be an object.", "invalid_legacy_graph");

  const graph = createDefaultGraphState({ now });

  Object.entries(texts).forEach(([id, text]) => {
    if (!isKnownBubbleId(id)) {
      throw new GraphStateValidationError(
        `Unknown bubble id: ${id}`,
        "unknown_bubble_id"
      );
    }

    if (typeof text !== "string") {
      throw new GraphStateValidationError(
        `Bubble text for ${id} must be a string.`,
        "invalid_bubble_text"
      );
    }

    if (text.length > MAX_BUBBLE_TEXT_LENGTH) {
      throw new GraphStateValidationError(
        `Bubble text for ${id} exceeds ${MAX_BUBBLE_TEXT_LENGTH} characters.`,
        "bubble_text_too_large"
      );
    }

    graph.content.bubbles[id] = { text };
  });

  return graph;
}

export function normalizeGraphState(input, { now = new Date() } = {}) {
  assertObject(input, "Graph state must be an object.", "invalid_graph_state");

  if (input.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    throw new GraphStateValidationError(
      `Unsupported graph schema version: ${input.schemaVersion}`,
      "unsupported_schema_version"
    );
  }

  if (input.graphId !== GRAPH_ID) {
    throw new GraphStateValidationError(
      `Unexpected graph id: ${input.graphId}`,
      "unexpected_graph_id"
    );
  }

  assertObject(input.content, "Graph content must be an object.", "invalid_graph_content");
  assertObject(
    input.content.bubbles,
    "Graph content.bubbles must be an object.",
    "invalid_graph_bubbles"
  );

  const normalized = createDefaultGraphState({
    now: typeof input.updatedAt === "string" ? input.updatedAt : now
  });

  Object.entries(input.content.bubbles).forEach(([id, bubble]) => {
    if (!isKnownBubbleId(id)) {
      throw new GraphStateValidationError(
        `Unknown bubble id: ${id}`,
        "unknown_bubble_id"
      );
    }

    assertObject(
      bubble,
      `Bubble ${id} must be an object.`,
      "invalid_bubble"
    );

    if (typeof bubble.text !== "string") {
      throw new GraphStateValidationError(
        `Bubble text for ${id} must be a string.`,
        "invalid_bubble_text"
      );
    }

    if (bubble.text.length > MAX_BUBBLE_TEXT_LENGTH) {
      throw new GraphStateValidationError(
        `Bubble text for ${id} exceeds ${MAX_BUBBLE_TEXT_LENGTH} characters.`,
        "bubble_text_too_large"
      );
    }

    normalized.content.bubbles[id] = { text: bubble.text };
  });

  return normalized;
}

export function prepareGraphForStorage(input, { now = new Date() } = {}) {
  const graph = normalizeGraphState(input, { now });
  graph.updatedAt = isoTimestamp(now);
  return graph;
}

export function validateGraphState(input, options = {}) {
  try {
    return {
      ok: true,
      graph: normalizeGraphState(input, options)
    };
  } catch (error) {
    if (error instanceof GraphStateValidationError) {
      return {
        ok: false,
        error
      };
    }

    throw error;
  }
}
