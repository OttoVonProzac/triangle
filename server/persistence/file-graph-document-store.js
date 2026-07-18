import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createEmptyGraphIndex,
  createGraphDocument,
  GRAPH_UUID_PATTERN,
  graphSummaryFromDocument,
  MAX_GRAPH_DOCUMENT_FILE_BYTES,
  normalizeGraphDocument,
  normalizeGraphIndex,
  prepareGraphDocumentStateForStorage,
  renameGraphDocument,
  sortGraphSummaries
} from "../../src/graph/graph-document.js";
import { TRIANGLE_NEEDS_MAP_TYPE } from "../../src/graph/graph-types.js";
import {
  GraphStateValidationError,
  normalizeGraphState
} from "../../src/graph/graph-state.js";

const LEGACY_GRAPH_ID_NAMESPACE = "triangle-mvp-1.2-legacy-graph";

export class FileGraphDocumentStoreError extends Error {
  constructor(message, code = "file_graph_document_store_error") {
    super(message);
    this.name = "FileGraphDocumentStoreError";
    this.code = code;
  }
}

function assertSafeUuid(value, label, code) {
  if (typeof value !== "string" || !GRAPH_UUID_PATTERN.test(value)) {
    throw new FileGraphDocumentStoreError(`${label} must be a valid UUID.`, code);
  }
}

function isMissingFile(error) {
  return error && error.code === "ENOENT";
}

function deterministicUuid(namespace, value) {
  const hash = crypto
    .createHash("sha256")
    .update(namespace)
    .update(":")
    .update(value)
    .digest("hex");
  const variant = (Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80;

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variant.toString(16).padStart(2, "0")}${hash.slice(18, 20)}`,
    hash.slice(20, 32)
  ].join("-");
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class FileGraphDocumentStore {
  constructor({
    rootDir,
    maxFileBytes = MAX_GRAPH_DOCUMENT_FILE_BYTES,
    filesystem = fs,
    randomId = () => crypto.randomUUID()
  }) {
    if (!rootDir) {
      throw new Error("FileGraphDocumentStore requires a rootDir.");
    }

    this.rootDir = path.resolve(rootDir);
    this.maxFileBytes = maxFileBytes;
    this.fs = filesystem;
    this.randomId = randomId;
  }

  userDirForUser(userId) {
    assertSafeUuid(
      userId,
      "Authenticated user id",
      "invalid_user_id"
    );

    const userDir = path.resolve(this.rootDir, userId);
    const rootWithSeparator = this.rootDir.endsWith(path.sep)
      ? this.rootDir
      : `${this.rootDir}${path.sep}`;

    if (!userDir.startsWith(rootWithSeparator)) {
      throw new FileGraphDocumentStoreError(
        "Resolved user graph path escapes the graph data directory.",
        "path_traversal"
      );
    }

    return userDir;
  }

  indexPathForUser(userId) {
    return path.join(this.userDirForUser(userId), "graphs-index.json");
  }

  legacyGraphPathForUser(userId) {
    return path.join(this.userDirForUser(userId), "graph.json");
  }

  graphsDirForUser(userId) {
    return path.join(this.userDirForUser(userId), "graphs");
  }

  graphPathForUser(userId, graphId) {
    assertSafeUuid(graphId, "Graph id", "invalid_graph_id");

    const graphsDir = this.graphsDirForUser(userId);
    const graphPath = path.resolve(graphsDir, `${graphId}.json`);
    const dirWithSeparator = graphsDir.endsWith(path.sep)
      ? graphsDir
      : `${graphsDir}${path.sep}`;

    if (!graphPath.startsWith(dirWithSeparator)) {
      throw new FileGraphDocumentStoreError(
        "Resolved graph path escapes the graph data directory.",
        "path_traversal"
      );
    }

    return graphPath;
  }

  legacyGraphIdForUser(userId) {
    assertSafeUuid(userId, "Authenticated user id", "invalid_user_id");
    return deterministicUuid(LEGACY_GRAPH_ID_NAMESPACE, userId);
  }

  async listGraphs(userId, { type = null, now = new Date() } = {}) {
    const index = await this.ensureMigrated(userId, { now });
    const summaries = type
      ? index.graphs.filter(summary => summary.type === type)
      : index.graphs;

    return {
      graphs: sortGraphSummaries(summaries)
    };
  }

  async createGraph(userId, { type, title = null, state = null, now = new Date() }) {
    await this.ensureMigrated(userId, { now });

    const document = createGraphDocument({
      id: this.randomId(),
      type,
      title,
      state,
      now
    });

    await this.#writeDocument(userId, document);
    await this.#upsertIndexSummary(userId, graphSummaryFromDocument(document));

    return document;
  }

  async readGraph(userId, graphId, { now = new Date() } = {}) {
    await this.ensureMigrated(userId, { now });
    return this.#readDocumentIfExists(userId, graphId, { now });
  }

  async writeGraphState(userId, graphId, state, { now = new Date() } = {}) {
    const result = await this.readGraph(userId, graphId, { now });

    if (!result.exists) {
      throw new FileGraphDocumentStoreError(
        "Graph document not found.",
        "graph_not_found"
      );
    }

    const document = prepareGraphDocumentStateForStorage(result.graph, state, {
      now
    });

    await this.#writeDocument(userId, document);
    await this.#upsertIndexSummary(userId, graphSummaryFromDocument(document));

    return document;
  }

  async renameGraph(userId, graphId, title, { now = new Date() } = {}) {
    const result = await this.readGraph(userId, graphId, { now });

    if (!result.exists) {
      throw new FileGraphDocumentStoreError(
        "Graph document not found.",
        "graph_not_found"
      );
    }

    const document = renameGraphDocument(result.graph, title, { now });

    await this.#writeDocument(userId, document);
    await this.#upsertIndexSummary(userId, graphSummaryFromDocument(document));

    return document;
  }

  async readCompatibilityGraph(userId, { now = new Date() } = {}) {
    const index = await this.ensureMigrated(userId, { now });
    const graphId = this.#compatibilityGraphId(userId, index);

    if (!graphId) {
      return { exists: false };
    }

    const result = await this.#readDocumentIfExists(userId, graphId, { now });

    if (!result.exists) {
      return { exists: false };
    }

    return result;
  }

  async writeCompatibilityGraph(userId, state, { now = new Date() } = {}) {
    const index = await this.ensureMigrated(userId, { now });
    const graphId =
      this.#compatibilityGraphId(userId, index) ||
      this.legacyGraphIdForUser(userId);
    const existing = await this.#readDocumentIfExists(userId, graphId, { now });

    if (existing.exists) {
      return this.writeGraphState(userId, graphId, state, { now });
    }

    const document = createGraphDocument({
      id: graphId,
      type: TRIANGLE_NEEDS_MAP_TYPE,
      title: "Triangle initial",
      state,
      now
    });

    await this.#writeDocument(userId, document);
    await this.#upsertIndexSummary(userId, graphSummaryFromDocument(document));

    return document;
  }

  async ensureMigrated(userId, { now = new Date() } = {}) {
    let index = await this.#readIndex(userId);
    const legacyGraphId = this.legacyGraphIdForUser(userId);
    const legacyDocument = await this.#readDocumentIfExists(userId, legacyGraphId, {
      now
    });

    let migratedDocument = legacyDocument.exists ? legacyDocument.graph : null;
    const legacyExists = await this.#fileExists(this.legacyGraphPathForUser(userId));

    if (!migratedDocument && legacyExists) {
      const legacyGraph = await this.#readLegacyGraph(userId);
      migratedDocument = createGraphDocument({
        id: legacyGraphId,
        type: TRIANGLE_NEEDS_MAP_TYPE,
        title: "Triangle initial",
        createdAt: legacyGraph.updatedAt,
        updatedAt: legacyGraph.updatedAt,
        state: legacyGraph,
        now
      });
      await this.#writeDocument(userId, migratedDocument);
    }

    if (migratedDocument) {
      const nextIndex = {
        ...index,
        migration: {
          legacyGraphMigrated: true,
          legacyGraphId
        },
        graphs: sortGraphSummaries([
          ...index.graphs.filter(summary => summary.id !== legacyGraphId),
          graphSummaryFromDocument(migratedDocument)
        ])
      };
      index = sameJson(index, nextIndex)
        ? nextIndex
        : await this.#writeIndex(userId, nextIndex);
    }

    return this.#repairIndexFromDocuments(userId, index);
  }

  #compatibilityGraphId(userId, index) {
    const legacyGraphId = this.legacyGraphIdForUser(userId);

    if (index.graphs.some(summary => summary.id === legacyGraphId)) {
      return legacyGraphId;
    }

    const triangleGraphs = sortGraphSummaries(
      index.graphs.filter(summary => summary.type === TRIANGLE_NEEDS_MAP_TYPE)
    );

    return triangleGraphs[0]?.id || null;
  }

  async #readIndex(userId) {
    const indexPath = this.indexPathForUser(userId);

    let stat;
    try {
      stat = await this.fs.stat(indexPath);
    } catch (error) {
      if (isMissingFile(error)) {
        return createEmptyGraphIndex();
      }
      throw error;
    }

    if (stat.size > this.maxFileBytes) {
      throw new FileGraphDocumentStoreError(
        `Graph index file exceeds ${this.maxFileBytes} bytes.`,
        "graph_index_too_large"
      );
    }

    try {
      const raw = await this.fs.readFile(indexPath, "utf8");
      return normalizeGraphIndex(JSON.parse(raw));
    } catch (error) {
      if (error instanceof SyntaxError || error.name === "GraphDocumentValidationError") {
        throw new FileGraphDocumentStoreError(
          "Stored graph index is corrupted or uses an unsupported schema.",
          "corrupt_graph_index"
        );
      }

      throw error;
    }
  }

  async #writeIndex(userId, index) {
    const indexPath = this.indexPathForUser(userId);
    const normalized = normalizeGraphIndex(index);
    await this.#writeJsonAtomically(path.dirname(indexPath), indexPath, normalized, "graphs-index");
    return normalized;
  }

  async #readDocumentIfExists(userId, graphId, { now = new Date() } = {}) {
    const graphPath = this.graphPathForUser(userId, graphId);

    let stat;
    try {
      stat = await this.fs.stat(graphPath);
    } catch (error) {
      if (isMissingFile(error)) {
        return { exists: false };
      }
      throw error;
    }

    if (stat.size > this.maxFileBytes) {
      throw new FileGraphDocumentStoreError(
        `Graph document file exceeds ${this.maxFileBytes} bytes.`,
        "graph_document_too_large"
      );
    }

    try {
      const raw = await this.fs.readFile(graphPath, "utf8");
      return {
        exists: true,
        graph: normalizeGraphDocument(JSON.parse(raw), { now })
      };
    } catch (error) {
      if (error instanceof SyntaxError || error.name === "GraphDocumentValidationError") {
        throw new FileGraphDocumentStoreError(
          "Stored graph document is corrupted or uses an unsupported schema.",
          "corrupt_graph_document"
        );
      }

      throw error;
    }
  }

  async #writeDocument(userId, document) {
    const normalized = normalizeGraphDocument(document);
    const graphPath = this.graphPathForUser(userId, normalized.id);
    await this.#writeJsonAtomically(
      path.dirname(graphPath),
      graphPath,
      normalized,
      `graph-${normalized.id}`
    );
    return normalized;
  }

  async #readLegacyGraph(userId) {
    const legacyPath = this.legacyGraphPathForUser(userId);

    let stat;
    try {
      stat = await this.fs.stat(legacyPath);
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }
      throw error;
    }

    if (stat.size > this.maxFileBytes) {
      throw new FileGraphDocumentStoreError(
        `Legacy graph file exceeds ${this.maxFileBytes} bytes.`,
        "graph_file_too_large"
      );
    }

    try {
      const raw = await this.fs.readFile(legacyPath, "utf8");
      return normalizeGraphState(JSON.parse(raw));
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof GraphStateValidationError) {
        throw new FileGraphDocumentStoreError(
          "Stored graph file is corrupted or uses an unsupported schema.",
          "corrupt_graph_file"
        );
      }

      throw error;
    }
  }

  async #repairIndexFromDocuments(userId, index) {
    const graphsDir = this.graphsDirForUser(userId);
    let entries = [];

    try {
      entries = await this.fs.readdir(graphsDir);
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }

    const documents = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) {
        continue;
      }

      const graphId = entry.slice(0, -".json".length);
      if (!GRAPH_UUID_PATTERN.test(graphId)) {
        continue;
      }

      const result = await this.#readDocumentIfExists(userId, graphId);
      if (result.exists) {
        documents.push(result.graph);
      }
    }

    const nextIndex = normalizeGraphIndex({
      ...index,
      graphs: sortGraphSummaries(documents.map(graphSummaryFromDocument))
    });

    if (!sameJson(index, nextIndex)) {
      return this.#writeIndex(userId, nextIndex);
    }

    return nextIndex;
  }

  async #upsertIndexSummary(userId, summary) {
    const index = await this.#readIndex(userId);
    const nextIndex = {
      ...index,
      graphs: sortGraphSummaries([
        ...index.graphs.filter(existing => existing.id !== summary.id),
        summary
      ])
    };

    return this.#writeIndex(userId, nextIndex);
  }

  async #fileExists(filePath) {
    try {
      await this.fs.stat(filePath);
      return true;
    } catch (error) {
      if (isMissingFile(error)) {
        return false;
      }
      throw error;
    }
  }

  async #writeJsonAtomically(directory, filePath, value, label) {
    const tempPath = path.join(
      directory,
      `.${label}-${process.pid}-${Date.now()}-${this.randomId()}.tmp`
    );
    const formatted = `${JSON.stringify(value, null, 2)}\n`;

    if (Buffer.byteLength(formatted, "utf8") > this.maxFileBytes) {
      throw new FileGraphDocumentStoreError(
        `Graph file exceeds ${this.maxFileBytes} bytes.`,
        "graph_file_too_large"
      );
    }

    try {
      await this.fs.mkdir(directory, { recursive: true });
      await this.fs.writeFile(tempPath, formatted, "utf8");
      await this.fs.rename(tempPath, filePath);
    } catch (error) {
      try {
        await this.fs.unlink(tempPath);
      } catch (cleanupError) {
        if (!isMissingFile(cleanupError)) {
          error.cleanupError = cleanupError;
        }
      }
      throw error;
    }
  }
}
