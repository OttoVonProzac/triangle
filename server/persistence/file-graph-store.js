import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  GraphStateValidationError,
  MAX_GRAPH_FILE_BYTES,
  normalizeGraphState
} from "../../src/graph/graph-state.js";

const SUPABASE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class FileGraphStoreError extends Error {
  constructor(message, code = "file_graph_store_error") {
    super(message);
    this.name = "FileGraphStoreError";
    this.code = code;
  }
}

function assertSafeUserId(userId) {
  if (typeof userId !== "string" || !SUPABASE_UUID_PATTERN.test(userId)) {
    throw new FileGraphStoreError(
      "Authenticated user id is not a valid Supabase UUID.",
      "invalid_user_id"
    );
  }
}

function isMissingFile(error) {
  return error && error.code === "ENOENT";
}

export class FileGraphStore {
  constructor({
    rootDir,
    maxFileBytes = MAX_GRAPH_FILE_BYTES,
    filesystem = fs,
    randomId = () => crypto.randomUUID()
  }) {
    if (!rootDir) {
      throw new Error("FileGraphStore requires a rootDir.");
    }

    this.rootDir = path.resolve(rootDir);
    this.maxFileBytes = maxFileBytes;
    this.fs = filesystem;
    this.randomId = randomId;
  }

  graphPathForUser(userId) {
    assertSafeUserId(userId);

    const userDir = path.resolve(this.rootDir, userId);
    const rootWithSeparator = this.rootDir.endsWith(path.sep)
      ? this.rootDir
      : `${this.rootDir}${path.sep}`;

    if (!userDir.startsWith(rootWithSeparator)) {
      throw new FileGraphStoreError(
        "Resolved user graph path escapes the graph data directory.",
        "path_traversal"
      );
    }

    return path.join(userDir, "graph.json");
  }

  async readGraph(userId) {
    const graphPath = this.graphPathForUser(userId);

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
      throw new FileGraphStoreError(
        `Graph file exceeds ${this.maxFileBytes} bytes.`,
        "graph_file_too_large"
      );
    }

    let graph;
    try {
      const raw = await this.fs.readFile(graphPath, "utf8");
      graph = normalizeGraphState(JSON.parse(raw));
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof GraphStateValidationError) {
        throw new FileGraphStoreError(
          "Stored graph file is corrupted or uses an unsupported schema.",
          "corrupt_graph_file"
        );
      }

      throw error;
    }

    return {
      exists: true,
      graph
    };
  }

  async writeGraph(userId, graph) {
    const graphPath = this.graphPathForUser(userId);
    const userDir = path.dirname(graphPath);
    const tempPath = path.join(
      userDir,
      `.graph-${process.pid}-${Date.now()}-${this.randomId()}.tmp`
    );
    const formatted = `${JSON.stringify(graph, null, 2)}\n`;

    if (Buffer.byteLength(formatted, "utf8") > this.maxFileBytes) {
      throw new FileGraphStoreError(
        `Graph file exceeds ${this.maxFileBytes} bytes.`,
        "graph_file_too_large"
      );
    }

    try {
      await this.fs.mkdir(userDir, { recursive: true });
      await this.fs.writeFile(tempPath, formatted, "utf8");
      await this.fs.rename(tempPath, graphPath);
      return graph;
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
