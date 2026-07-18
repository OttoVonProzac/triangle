import {
  createDefaultStateForType,
  getGraphTypeDefinition,
  normalizeStateForType,
  prepareStateForStorage
} from "./graph-types.js";

export const GRAPH_DOCUMENT_SCHEMA_VERSION = 1;
export const GRAPH_INDEX_SCHEMA_VERSION = 1;
export const MAX_GRAPH_TITLE_LENGTH = 120;
export const MAX_GRAPH_DOCUMENT_BODY_BYTES = 96 * 1024;
export const MAX_GRAPH_DOCUMENT_FILE_BYTES = 192 * 1024;
export const GRAPH_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class GraphDocumentValidationError extends Error {
  constructor(message, code = "invalid_graph_document") {
    super(message);
    this.name = "GraphDocumentValidationError";
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
    throw new GraphDocumentValidationError(message, code);
  }
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

export function isValidGraphDocumentId(id) {
  return typeof id === "string" && GRAPH_UUID_PATTERN.test(id);
}

export function assertValidGraphDocumentId(id) {
  if (!isValidGraphDocumentId(id)) {
    throw new GraphDocumentValidationError(
      "Graph document id must be a valid UUID.",
      "invalid_graph_id"
    );
  }

  return id;
}

export function normalizeGraphTitle(title, { fallback = null } = {}) {
  const candidate = title == null ? fallback : title;

  if (typeof candidate !== "string") {
    throw new GraphDocumentValidationError(
      "Graph title must be a string.",
      "invalid_graph_title"
    );
  }

  const normalized = candidate.replace(/\s+/g, " ").trim();

  if (!normalized) {
    throw new GraphDocumentValidationError(
      "Graph title cannot be empty.",
      "empty_graph_title"
    );
  }

  if (normalized.length > MAX_GRAPH_TITLE_LENGTH) {
    throw new GraphDocumentValidationError(
      `Graph title exceeds ${MAX_GRAPH_TITLE_LENGTH} characters.`,
      "graph_title_too_large"
    );
  }

  return normalized;
}

export function assertSupportedGraphType(type) {
  const definition = getGraphTypeDefinition(type);

  if (!definition) {
    throw new GraphDocumentValidationError(
      `Unsupported graph type: ${type}`,
      "unsupported_graph_type"
    );
  }

  return definition.type;
}

export function defaultGraphTitleForType(type, { now = new Date() } = {}) {
  const definition = getGraphTypeDefinition(type);
  const dateValue = typeof now === "function" ? now() : now;
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const yyyyMmDd =
    date instanceof Date && !Number.isNaN(date.getTime())
      ? date.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  return `${definition?.defaultTitlePrefix || "Graph"} du ${yyyyMmDd}`;
}

export function createGraphDocument({
  id,
  type,
  title = null,
  state = null,
  createdAt = null,
  updatedAt = null,
  now = new Date()
}) {
  const timestamp = isoTimestamp(now);
  const normalizedType = assertSupportedGraphType(type);
  const created = createdAt || timestamp;
  const updated = updatedAt || timestamp;

  assertValidGraphDocumentId(id);

  if (!isIsoTimestamp(created)) {
    throw new GraphDocumentValidationError(
      "Graph document createdAt must be an ISO timestamp.",
      "invalid_created_at"
    );
  }

  if (!isIsoTimestamp(updated)) {
    throw new GraphDocumentValidationError(
      "Graph document updatedAt must be an ISO timestamp.",
      "invalid_updated_at"
    );
  }

  return {
    schemaVersion: GRAPH_DOCUMENT_SCHEMA_VERSION,
    id,
    type: normalizedType,
    title: normalizeGraphTitle(title, {
      fallback: defaultGraphTitleForType(normalizedType, { now: created })
    }),
    createdAt: created,
    updatedAt: updated,
    state: state
      ? normalizeStateForType(normalizedType, state, { now })
      : createDefaultStateForType(normalizedType, { now: updated })
  };
}

export function normalizeGraphDocument(input, { now = new Date() } = {}) {
  assertObject(
    input,
    "Graph document must be an object.",
    "invalid_graph_document"
  );

  if (input.schemaVersion !== GRAPH_DOCUMENT_SCHEMA_VERSION) {
    throw new GraphDocumentValidationError(
      `Unsupported graph document schema version: ${input.schemaVersion}`,
      "unsupported_graph_document_schema"
    );
  }

  return createGraphDocument({
    id: input.id,
    type: input.type,
    title: input.title,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    state: input.state,
    now
  });
}

export function prepareGraphDocumentStateForStorage(
  document,
  nextState,
  { now = new Date() } = {}
) {
  const normalized = normalizeGraphDocument(document, { now });
  const updatedAt = isoTimestamp(now);

  return {
    ...normalized,
    updatedAt,
    state: prepareStateForStorage(normalized.type, nextState, { now })
  };
}

export function renameGraphDocument(document, title, { now = new Date() } = {}) {
  const normalized = normalizeGraphDocument(document, { now });

  return {
    ...normalized,
    title: normalizeGraphTitle(title),
    updatedAt: isoTimestamp(now)
  };
}

export function cloneGraphDocument(document) {
  return clone(normalizeGraphDocument(document));
}

export function graphSummaryFromDocument(document) {
  const normalized = normalizeGraphDocument(document);

  return {
    id: normalized.id,
    type: normalized.type,
    title: normalized.title,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt
  };
}

export function normalizeGraphSummary(input) {
  assertObject(input, "Graph summary must be an object.", "invalid_graph_summary");
  assertValidGraphDocumentId(input.id);
  assertSupportedGraphType(input.type);

  if (!isIsoTimestamp(input.createdAt)) {
    throw new GraphDocumentValidationError(
      "Graph summary createdAt must be an ISO timestamp.",
      "invalid_created_at"
    );
  }

  if (!isIsoTimestamp(input.updatedAt)) {
    throw new GraphDocumentValidationError(
      "Graph summary updatedAt must be an ISO timestamp.",
      "invalid_updated_at"
    );
  }

  return {
    id: input.id,
    type: input.type,
    title: normalizeGraphTitle(input.title),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export function createEmptyGraphIndex() {
  return {
    schemaVersion: GRAPH_INDEX_SCHEMA_VERSION,
    migration: {
      legacyGraphMigrated: false,
      legacyGraphId: null
    },
    graphs: []
  };
}

export function normalizeGraphIndex(input) {
  assertObject(input, "Graph index must be an object.", "invalid_graph_index");

  if (input.schemaVersion !== GRAPH_INDEX_SCHEMA_VERSION) {
    throw new GraphDocumentValidationError(
      `Unsupported graph index schema version: ${input.schemaVersion}`,
      "unsupported_graph_index_schema"
    );
  }

  const migration =
    input.migration && typeof input.migration === "object"
      ? input.migration
      : {};
  const legacyGraphId =
    migration.legacyGraphId == null
      ? null
      : assertValidGraphDocumentId(migration.legacyGraphId);

  if (!Array.isArray(input.graphs)) {
    throw new GraphDocumentValidationError(
      "Graph index graphs must be an array.",
      "invalid_graph_index"
    );
  }

  return {
    schemaVersion: GRAPH_INDEX_SCHEMA_VERSION,
    migration: {
      legacyGraphMigrated: Boolean(migration.legacyGraphMigrated),
      legacyGraphId
    },
    graphs: input.graphs.map(normalizeGraphSummary)
  };
}

export function sortGraphSummaries(summaries) {
  return [...summaries].sort((left, right) => {
    const updated = right.updatedAt.localeCompare(left.updatedAt);
    if (updated) {
      return updated;
    }

    const created = right.createdAt.localeCompare(left.createdAt);
    if (created) {
      return created;
    }

    const title = left.title.localeCompare(right.title);
    if (title) {
      return title;
    }

    return left.id.localeCompare(right.id);
  });
}
