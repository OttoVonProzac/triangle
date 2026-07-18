import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  GraphStateValidationError,
  prepareGraphForStorage
} from "../src/graph/graph-state.js";
import {
  assertSupportedGraphType,
  GraphDocumentValidationError,
  MAX_GRAPH_DOCUMENT_BODY_BYTES
} from "../src/graph/graph-document.js";
import { createSupabaseTokenVerifier, AuthVerificationError } from "./auth/verify-supabase-token.js";
import { FileGraphStore, FileGraphStoreError } from "./persistence/file-graph-store.js";
import {
  FileGraphDocumentStore,
  FileGraphDocumentStoreError
} from "./persistence/file-graph-document-store.js";

const DEFAULT_PORT = 4174;
const DEFAULT_GRAPH_DATA_DIR = path.resolve(process.cwd(), "data", "users");

class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function parseIntegerEnv(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function loadDotEnvFile({
  filePath = path.resolve(process.cwd(), ".env"),
  env = process.env
} = {}) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }

  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in env)) {
      env[key] = value;
    }
  });

  return true;
}

function writeJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AuthVerificationError("Missing bearer token.");
  }

  return match[1].trim();
}

async function readJsonBody(request, bodyLimitBytes) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > bodyLimitBytes) {
      throw new ApiError(
        413,
        "request_body_too_large",
        `Request body exceeds ${bodyLimitBytes} bytes.`
      );
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    throw new ApiError(400, "missing_json_body", "Expected a JSON request body.");
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

async function verifyRequest(request, verifyAccessToken) {
  const token = getBearerToken(request);
  return verifyAccessToken(token);
}

function apiErrorPayload(error) {
  return {
    error: {
      code: error.code || "internal_error",
      message: error.message || "Internal server error."
    }
  };
}

function statusForError(error) {
  if (error instanceof ApiError) {
    return error.statusCode;
  }

  if (error instanceof AuthVerificationError) {
    return error.statusCode;
  }

  if (error instanceof GraphStateValidationError) {
    return 400;
  }

  if (error instanceof GraphDocumentValidationError) {
    return 400;
  }

  if (error instanceof FileGraphStoreError && error.code === "invalid_user_id") {
    return 401;
  }

  if (error instanceof FileGraphStoreError) {
    return 500;
  }

  if (
    error instanceof FileGraphDocumentStoreError &&
    error.code === "invalid_user_id"
  ) {
    return 401;
  }

  if (
    error instanceof FileGraphDocumentStoreError &&
    error.code === "graph_not_found"
  ) {
    return 404;
  }

  if (
    error instanceof FileGraphDocumentStoreError &&
    (
      error.code === "invalid_graph_id" ||
      error.code === "path_traversal"
    )
  ) {
    return 400;
  }

  if (error instanceof FileGraphDocumentStoreError) {
    return 500;
  }

  return 500;
}

function parseGraphCollectionRoute(pathname) {
  const match = pathname.match(/^\/api\/graphs(?:\/([^/]+))?$/);

  if (!match) {
    return null;
  }

  return {
    graphId: match[1] ? decodeURIComponent(match[1]) : null
  };
}

function storeSupportsGraphDocuments(graphStore) {
  return (
    graphStore &&
    typeof graphStore.listGraphs === "function" &&
    typeof graphStore.createGraph === "function" &&
    typeof graphStore.readGraph === "function" &&
    typeof graphStore.writeGraphState === "function" &&
    typeof graphStore.renameGraph === "function"
  );
}

async function serveStatic(request, response, staticRoot) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end();
    return;
  }

  const url = new URL(request.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(staticRoot, `.${requestedPath}`);
  const rootWithSeparator = staticRoot.endsWith(path.sep)
    ? staticRoot
    : `${staticRoot}${path.sep}`;

  if (!resolved.startsWith(rootWithSeparator)) {
    response.writeHead(404);
    response.end();
    return;
  }

  let filePath = resolved;
  try {
    await fs.stat(filePath);
  } catch {
    filePath = path.join(staticRoot, "index.html");
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".js"
          ? "text/javascript; charset=utf-8"
          : ext === ".css"
            ? "text/css; charset=utf-8"
            : "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    response.end(content);
  } catch {
    response.writeHead(404);
    response.end();
  }
}

export function createGraphApiServer({
  graphStore,
  verifyAccessToken,
  bodyLimitBytes = MAX_GRAPH_DOCUMENT_BODY_BYTES,
  staticRoot = path.resolve(process.cwd(), "dist"),
  serveBuiltClient = true,
  now = () => new Date()
}) {
  if (!graphStore) {
    throw new Error("createGraphApiServer requires graphStore.");
  }

  if (typeof verifyAccessToken !== "function") {
    throw new Error("createGraphApiServer requires verifyAccessToken.");
  }

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const graphCollectionRoute = parseGraphCollectionRoute(url.pathname);
    const supportsGraphDocuments = storeSupportsGraphDocuments(graphStore);

    try {
      if (graphCollectionRoute) {
        if (!supportsGraphDocuments) {
          throw new ApiError(404, "not_found", "Not found.");
        }

        const verified = await verifyRequest(request, verifyAccessToken);
        const userId = verified.userId;
        const graphId = graphCollectionRoute.graphId;

        if (!graphId) {
          if (request.method === "GET") {
            const type = url.searchParams.get("type");
            if (type) {
              assertSupportedGraphType(type);
            }

            const result = await graphStore.listGraphs(userId, {
              ...(type ? { type } : {}),
              now
            });
            writeJson(response, 200, {
              graphs: result.graphs
            });
            return;
          }

          if (request.method === "POST") {
            const body = await readJsonBody(request, bodyLimitBytes);
            const graph = await graphStore.createGraph(userId, {
              type: body.type,
              title: body.title,
              state: body.state,
              now
            });
            writeJson(response, 201, {
              graph
            });
            return;
          }

          throw new ApiError(405, "method_not_allowed", "Method not allowed.");
        }

        if (request.method === "GET") {
          const result = await graphStore.readGraph(userId, graphId, { now });
          if (!result.exists) {
            throw new FileGraphDocumentStoreError(
              "Graph document not found.",
              "graph_not_found"
            );
          }

          writeJson(response, 200, {
            graph: result.graph
          });
          return;
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(request, bodyLimitBytes);
          const state = body?.state && typeof body.state === "object"
            ? body.state
            : body;
          const graph = await graphStore.writeGraphState(userId, graphId, state, {
            now
          });
          writeJson(response, 200, {
            graph
          });
          return;
        }

        if (request.method === "PATCH") {
          const body = await readJsonBody(request, bodyLimitBytes);
          const graph = await graphStore.renameGraph(userId, graphId, body.title, {
            now
          });
          writeJson(response, 200, {
            graph
          });
          return;
        }

        throw new ApiError(405, "method_not_allowed", "Method not allowed.");
      }

      if (url.pathname === "/api/graph") {
        const verified = await verifyRequest(request, verifyAccessToken);
        const userId = verified.userId;

        if (request.method === "GET") {
          if (supportsGraphDocuments) {
            const result = await graphStore.readCompatibilityGraph(userId, {
              now
            });

            if (!result.exists) {
              writeJson(response, 200, { exists: false });
              return;
            }

            writeJson(response, 200, {
              exists: true,
              graph: result.graph.state,
              document: result.graph
            });
            return;
          }

          const result = await graphStore.readGraph(userId);
          writeJson(response, 200, result);
          return;
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(request, bodyLimitBytes);

          if (supportsGraphDocuments) {
            const saved = await graphStore.writeCompatibilityGraph(userId, body, {
              now
            });
            writeJson(response, 200, {
              graph: saved.state,
              document: saved,
              schemaVersion: saved.state.schemaVersion,
              updatedAt: saved.state.updatedAt
            });
            return;
          }

          const graph = prepareGraphForStorage(body, { now });
          const saved = await graphStore.writeGraph(userId, graph);
          writeJson(response, 200, {
            graph: saved,
            schemaVersion: saved.schemaVersion,
            updatedAt: saved.updatedAt
          });
          return;
        }

        throw new ApiError(405, "method_not_allowed", "Method not allowed.");
      }

      if (serveBuiltClient) {
        await serveStatic(request, response, staticRoot);
        return;
      }

      throw new ApiError(404, "not_found", "Not found.");
    } catch (error) {
      const statusCode = statusForError(error);
      writeJson(response, statusCode, apiErrorPayload(error));
    }
  });
}

export function createServerFromEnv(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const graphDataDir = env.GRAPH_DATA_DIR || DEFAULT_GRAPH_DATA_DIR;
  const bodyLimitBytes = parseIntegerEnv(
    env.GRAPH_BODY_LIMIT_BYTES,
    MAX_GRAPH_DOCUMENT_BODY_BYTES
  );
  const maxFileBytes = parseIntegerEnv(
    env.GRAPH_FILE_SIZE_LIMIT_BYTES,
    undefined
  );

  const graphStore = new FileGraphDocumentStore({
    rootDir: graphDataDir,
    ...(maxFileBytes ? { maxFileBytes } : {})
  });
  const verifyAccessToken = createSupabaseTokenVerifier({
    supabaseUrl,
    supabaseAnonKey
  });

  return createGraphApiServer({
    graphStore,
    verifyAccessToken,
    bodyLimitBytes
  });
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  await loadDotEnvFile();
  const port = parseIntegerEnv(process.env.PORT, DEFAULT_PORT);
  const server = createServerFromEnv(process.env);

  server.listen(port, () => {
    console.log(`Triangle server listening on http://localhost:${port}`);
  });
}

export { DEFAULT_GRAPH_DATA_DIR, DEFAULT_PORT };
