import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultGraphState } from "../src/graph/graph-state.js";
import { createGraphApiServer, loadDotEnvFile } from "../server/server.js";
import { FileGraphStore } from "../server/persistence/file-graph-store.js";
import { AuthVerificationError } from "../server/auth/verify-supabase-token.js";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "triangle-api-"));
}

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

test("API rejects missing bearer tokens", async () => {
  const rootDir = await tempRoot();
  const server = createGraphApiServer({
    graphStore: new FileGraphStore({ rootDir }),
    async verifyAccessToken() {
      return { userId: USER_A };
    },
    serveBuiltClient: false
  });
  const baseUrl = await listen(server);

  try {
    const response = await request(baseUrl, "/api/graph");
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, "unauthorized");
  } finally {
    server.close();
  }
});

test("server CLI env loader reads .env without overriding existing env", async () => {
  const rootDir = await tempRoot();
  const envPath = path.join(rootDir, ".env");
  const env = {
    SUPABASE_URL: "already-set"
  };
  await fs.writeFile(
    envPath,
    [
      "SUPABASE_URL=from-file",
      "SUPABASE_ANON_KEY=\"anon-from-file\"",
      "GRAPH_DATA_DIR=./data/users"
    ].join("\n"),
    "utf8"
  );

  const loaded = await loadDotEnvFile({
    filePath: envPath,
    env
  });

  assert.equal(loaded, true);
  assert.equal(env.SUPABASE_URL, "already-set");
  assert.equal(env.SUPABASE_ANON_KEY, "anon-from-file");
  assert.equal(env.GRAPH_DATA_DIR, "./data/users");
});

test("server CLI env loader ignores a missing .env file", async () => {
  const rootDir = await tempRoot();
  const loaded = await loadDotEnvFile({
    filePath: path.join(rootDir, ".env"),
    env: {}
  });

  assert.equal(loaded, false);
});

test("API rejects invalid bearer tokens", async () => {
  const rootDir = await tempRoot();
  const server = createGraphApiServer({
    graphStore: new FileGraphStore({ rootDir }),
    async verifyAccessToken() {
      throw new AuthVerificationError("invalid token");
    },
    serveBuiltClient: false
  });
  const baseUrl = await listen(server);

  try {
    const response = await request(baseUrl, "/api/graph", {
      headers: {
        Authorization: "Bearer invalid"
      }
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.error.message, "invalid token");
  } finally {
    server.close();
  }
});

test("API rejects unknown bubble ids and oversized request bodies", async () => {
  const rootDir = await tempRoot();
  const server = createGraphApiServer({
    graphStore: new FileGraphStore({ rootDir }),
    async verifyAccessToken() {
      return { userId: USER_A };
    },
    bodyLimitBytes: 256,
    serveBuiltClient: false
  });
  const baseUrl = await listen(server);

  try {
    const badGraph = createDefaultGraphState();
    badGraph.content.bubbles["unknown"] = { text: "bad" };

    const unknown = await request(baseUrl, "/api/graph", {
      method: "PUT",
      headers: {
        Authorization: "Bearer good",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(badGraph)
    });
    assert.equal(unknown.status, 413);

    const sizeOkServer = createGraphApiServer({
      graphStore: new FileGraphStore({ rootDir }),
      async verifyAccessToken() {
        return { userId: USER_A };
      },
      serveBuiltClient: false
    });
    const sizeOkBaseUrl = await listen(sizeOkServer);

    try {
      const unknownWithRoom = await request(sizeOkBaseUrl, "/api/graph", {
        method: "PUT",
        headers: {
          Authorization: "Bearer good",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(badGraph)
      });
      assert.equal(unknownWithRoom.status, 400);
      assert.equal(unknownWithRoom.body.error.code, "unknown_bubble_id");
    } finally {
      sizeOkServer.close();
    }

    const oversized = await request(baseUrl, "/api/graph", {
      method: "PUT",
      headers: {
        Authorization: "Bearer good",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ payload: "x".repeat(512) })
    });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.error.code, "request_body_too_large");
  } finally {
    server.close();
  }
});

test("local end-to-end API writes distinct human-readable files for two mocked users", async () => {
  const rootDir = await tempRoot();
  const tokenToUser = new Map([
    ["token-a", USER_A],
    ["token-b", USER_B]
  ]);
  const server = createGraphApiServer({
    graphStore: new FileGraphStore({ rootDir }),
    async verifyAccessToken(token) {
      const userId = tokenToUser.get(token);
      if (!userId) {
        throw new AuthVerificationError("invalid token");
      }
      return { userId };
    },
    serveBuiltClient: false,
    now: () => new Date("2026-07-15T00:00:00.000Z")
  });
  const baseUrl = await listen(server);

  try {
    const missing = await request(baseUrl, "/api/graph", {
      headers: {
        Authorization: "Bearer token-a"
      }
    });
    assert.deepEqual(missing.body, { exists: false });

    const graphA = createDefaultGraphState();
    const graphB = createDefaultGraphState();
    graphA.content.bubbles["blue-learn"].text = "Alpha user";
    graphB.content.bubbles["blue-learn"].text = "Beta user";

    const savedA = await request(baseUrl, "/api/graph", {
      method: "PUT",
      headers: {
        Authorization: "Bearer token-a",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ...graphA, userId: USER_B })
    });
    const savedB = await request(baseUrl, "/api/graph", {
      method: "PUT",
      headers: {
        Authorization: "Bearer token-b",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(graphB)
    });

    assert.equal(savedA.status, 200);
    assert.equal(savedB.status, 200);
    assert.equal(savedA.body.graph.content.bubbles["blue-learn"].text, "Alpha user");
    assert.equal(savedB.body.graph.content.bubbles["blue-learn"].text, "Beta user");

    const reloadedA = await request(baseUrl, "/api/graph", {
      headers: {
        Authorization: "Bearer token-a"
      }
    });
    const reloadedB = await request(baseUrl, "/api/graph", {
      headers: {
        Authorization: "Bearer token-b"
      }
    });

    assert.equal(reloadedA.status, 200);
    assert.equal(reloadedB.status, 200);
    assert.equal(reloadedA.body.graph.content.bubbles["blue-learn"].text, "Alpha user");
    assert.equal(reloadedB.body.graph.content.bubbles["blue-learn"].text, "Beta user");

    const userAFile = path.join(rootDir, USER_A, "graph.json");
    const userBFile = path.join(rootDir, USER_B, "graph.json");
    const [fileA, fileB] = await Promise.all([
      fs.readFile(userAFile, "utf8"),
      fs.readFile(userBFile, "utf8")
    ]);

    assert.match(fileA, /\n  "schemaVersion": 1,/);
    assert.match(fileA, /Alpha user/);
    assert.match(fileB, /Beta user/);
    assert.doesNotMatch(fileA, /"userId"/);
    assert.notEqual(userAFile, userBFile);
  } finally {
    server.close();
  }
});

test("API returns corrupt_graph_file without replacing invalid JSON", async () => {
  const rootDir = await tempRoot();
  await fs.mkdir(path.join(rootDir, USER_A), { recursive: true });
  const graphPath = path.join(rootDir, USER_A, "graph.json");
  await fs.writeFile(graphPath, "{bad json", "utf8");

  const server = createGraphApiServer({
    graphStore: new FileGraphStore({ rootDir }),
    async verifyAccessToken() {
      return { userId: USER_A };
    },
    serveBuiltClient: false
  });
  const baseUrl = await listen(server);

  try {
    const response = await request(baseUrl, "/api/graph", {
      headers: {
        Authorization: "Bearer token-a"
      }
    });

    assert.equal(response.status, 500);
    assert.equal(response.body.error.code, "corrupt_graph_file");
    assert.equal(await fs.readFile(graphPath, "utf8"), "{bad json");
  } finally {
    server.close();
  }
});
