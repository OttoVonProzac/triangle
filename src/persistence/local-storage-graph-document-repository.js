import {
  createEmptyGraphIndex,
  createGraphDocument,
  graphSummaryFromDocument,
  normalizeGraphDocument,
  normalizeGraphIndex,
  sortGraphSummaries
} from "../graph/graph-document.js";
import { normalizeStateForType } from "../graph/graph-types.js";

export const GRAPH_DRAFT_STORAGE_KEY_PREFIX = "graph-draft-v2";
export const GRAPH_INDEX_CACHE_STORAGE_KEY_PREFIX = "graph-index-cache-v1";
export const GRAPH_ACTIVE_STORAGE_KEY_PREFIX = "graph-active-v1";
const GRAPH_DEMO_INDEX_STORAGE_KEY_PREFIX = "graph-demo-index-v1";
const GRAPH_DEMO_DOCUMENT_STORAGE_KEY_PREFIX = "graph-demo-document-v1";

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

function randomUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join("")
  ].join("-");
}

function safeJsonParse(raw) {
  return raw ? JSON.parse(raw) : null;
}

export class LocalStorageGraphDocumentDraftRepository {
  constructor({
    storage = globalThis.localStorage,
    userId,
    graphId,
    graphType,
    storageKey = `${GRAPH_DRAFT_STORAGE_KEY_PREFIX}:${userId}:${graphId}`,
    legacyStorageKeys = [],
    now = () => new Date()
  }) {
    this.storage = storage;
    this.userId = userId;
    this.graphId = graphId;
    this.graphType = graphType;
    this.storageKey = storageKey;
    this.legacyStorageKeys = legacyStorageKeys;
    this.now = now;
  }

  load() {
    if (!this.storage) {
      return { exists: false };
    }

    const draft = safeJsonParse(this.storage.getItem(this.storageKey));
    if (draft) {
      const graph = normalizeStateForType(
        this.graphType,
        draft.graph || draft,
        { now: this.now }
      );

      return {
        exists: true,
        graph,
        pending: Boolean(draft.pending),
        updatedAt: draft.updatedAt || graph.updatedAt
      };
    }

    for (const legacyKey of this.legacyStorageKeys) {
      const legacy = safeJsonParse(this.storage.getItem(legacyKey));
      if (!legacy) {
        continue;
      }

      const graph = normalizeStateForType(this.graphType, legacy, {
        now: this.now
      });

      return {
        exists: true,
        graph,
        pending: true,
        updatedAt: graph.updatedAt,
        migratedFromLegacy: true
      };
    }

    return { exists: false };
  }

  save(graph, { pending = false } = {}) {
    if (this.storage) {
      const normalized = normalizeStateForType(this.graphType, graph, {
        now: this.now
      });
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          schemaVersion: 1,
          pending: Boolean(pending),
          updatedAt: isoTimestamp(this.now),
          graph: normalized
        })
      );
    }

    return {
      graph
    };
  }
}

export class LocalGraphWorkspacePreferences {
  constructor({
    storage = globalThis.localStorage,
    userId,
    activeKey = `${GRAPH_ACTIVE_STORAGE_KEY_PREFIX}:${userId}`,
    indexCacheKey = `${GRAPH_INDEX_CACHE_STORAGE_KEY_PREFIX}:${userId}`
  }) {
    this.storage = storage;
    this.activeKey = activeKey;
    this.indexCacheKey = indexCacheKey;
  }

  loadActiveGraphId() {
    return this.storage?.getItem(this.activeKey) || null;
  }

  saveActiveGraphId(graphId) {
    if (this.storage && graphId) {
      this.storage.setItem(this.activeKey, graphId);
    }
  }

  loadIndexCache() {
    if (!this.storage) {
      return { graphs: [] };
    }

    const raw = this.storage.getItem(this.indexCacheKey);
    if (!raw) {
      return { graphs: [] };
    }

    return {
      graphs: normalizeGraphIndex(JSON.parse(raw)).graphs
    };
  }

  saveIndexCache(graphs) {
    if (!this.storage) {
      return;
    }

    this.storage.setItem(
      this.indexCacheKey,
      JSON.stringify({
        ...createEmptyGraphIndex(),
        graphs: sortGraphSummaries(graphs)
      })
    );
  }
}

export class BrowserGraphDocumentRepository {
  constructor({
    storage = globalThis.localStorage,
    userId = "demo-local",
    indexKey = null,
    documentKeyPrefix = null,
    now = () => new Date(),
    randomId = randomUuid
  } = {}) {
    this.storage = storage;
    this.userId = userId;
    this.now = now;
    this.randomId = randomId;
    this.indexKey = indexKey || `${GRAPH_DEMO_INDEX_STORAGE_KEY_PREFIX}:${userId}`;
    this.documentKeyPrefix =
      documentKeyPrefix || `${GRAPH_DEMO_DOCUMENT_STORAGE_KEY_PREFIX}:${userId}`;
  }

  listGraphs({ type = null } = {}) {
    const index = this.#loadIndex();
    const graphs = type
      ? index.graphs.filter(summary => summary.type === type)
      : index.graphs;

    return {
      graphs: sortGraphSummaries(graphs)
    };
  }

  createGraph({ type, title = null, state = null }) {
    const graph = createGraphDocument({
      id: this.randomId(),
      type,
      title,
      state,
      now: this.now
    });

    this.#saveDocument(graph);
    this.#upsertSummary(graphSummaryFromDocument(graph));

    return {
      graph
    };
  }

  loadGraph(id) {
    const raw = this.storage?.getItem(this.#documentKey(id));
    if (!raw) {
      const error = new Error("Graph document not found.");
      error.status = 404;
      error.code = "graph_not_found";
      throw error;
    }

    return {
      graph: normalizeGraphDocument(JSON.parse(raw), { now: this.now })
    };
  }

  saveGraphState(id, state) {
    const current = this.loadGraph(id).graph;
    const graph = normalizeGraphDocument(
      {
        ...current,
        updatedAt: isoTimestamp(this.now),
        state
      },
      { now: this.now }
    );

    this.#saveDocument(graph);
    this.#upsertSummary(graphSummaryFromDocument(graph));

    return {
      graph
    };
  }

  renameGraph(id, title) {
    const current = this.loadGraph(id).graph;
    const graph = normalizeGraphDocument(
      {
        ...current,
        title,
        updatedAt: isoTimestamp(this.now)
      },
      { now: this.now }
    );

    this.#saveDocument(graph);
    this.#upsertSummary(graphSummaryFromDocument(graph));

    return {
      graph
    };
  }

  #loadIndex() {
    if (!this.storage) {
      return createEmptyGraphIndex();
    }

    const raw = this.storage.getItem(this.indexKey);
    return raw ? normalizeGraphIndex(JSON.parse(raw)) : createEmptyGraphIndex();
  }

  #saveIndex(index) {
    this.storage?.setItem(this.indexKey, JSON.stringify(normalizeGraphIndex(index)));
  }

  #upsertSummary(summary) {
    const index = this.#loadIndex();
    this.#saveIndex({
      ...index,
      graphs: sortGraphSummaries([
        ...index.graphs.filter(existing => existing.id !== summary.id),
        summary
      ])
    });
  }

  #saveDocument(graph) {
    this.storage?.setItem(
      this.#documentKey(graph.id),
      JSON.stringify(normalizeGraphDocument(graph))
    );
  }

  #documentKey(id) {
    return `${this.documentKeyPrefix}:${id}`;
  }
}
