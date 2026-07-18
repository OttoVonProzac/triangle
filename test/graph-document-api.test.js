import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGraphApiServer } from "../server/server.js";
import { FileGraphDocumentStore } from "../server/persistence/file-graph-document-store.js";
import { AuthVerificationError } from "../server/auth/verify-supabase-token.js";
import { TRIANGLE_NEEDS_MAP_TYPE } from "../src/graph/graph-types.js";
import { createDefaultGraphState } from "../src/graph/graph-state.js";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "triangle-graph-doc-api-"));
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

function authHeaders(token = "token-a") {
  return {
    Authorization: `Bearer ${token}`
  };
}

test("generic graph API creates, lists, reads, updates, and renames documents", async () => {
  const rootDir = await tempRoot();
  const tokenToUser = new Map([
    ["token-a", USER_A],
    ["token-b", USER_B]
  ]);
  const server = createGraphApiServer({
    graphStore: new FileGraphDocumentStore({ rootDir }),
    async verifyAccessToken(token) {
      const userId = tokenToUser.get(token);
      if (!userId) {
        throw new AuthVerificationError("invalid token");
      }
      return { userId };
    },
    serveBuiltClient: false,
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });
  const baseUrl = await listen(server);

  try {
    const created = await request(baseUrl, "/api/graphs", {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: TRIANGLE_NEEDS_MAP_TYPE,
        title: "API graph"
      })
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.graph.type, TRIANGLE_NEEDS_MAP_TYPE);

    const graphId = created.body.graph.id;
    const state = createDefaultGraphState();
    state.content.bubbles["blue-learn"].text = "Saved through generic API";

    const saved = await request(baseUrl, `/api/graphs/${graphId}`, {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ state })
    });
    assert.equal(saved.status, 200);
    assert.equal(
      saved.body.graph.state.content.bubbles["blue-learn"].text,
      "Saved through generic API"
    );

    const renamed = await request(baseUrl, `/api/graphs/${graphId}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title: "Renamed graph" })
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.graph.id, graphId);
    assert.equal(renamed.body.graph.title, "Renamed graph");

    const listA = await request(baseUrl, "/api/graphs", {
      headers: authHeaders("token-a")
    });
    const listB = await request(baseUrl, "/api/graphs", {
      headers: authHeaders("token-b")
    });
    assert.equal(listA.body.graphs.length, 1);
    assert.equal(listB.body.graphs.length, 0);
  } finally {
    server.close();
  }
});

test("/api/graph compatibility delegates to the migrated generic document", async () => {
  const rootDir = await tempRoot();
  const legacy = createDefaultGraphState();
  legacy.content.bubbles["blue-health"].text = "Legacy compatibility";
  await fs.mkdir(path.join(rootDir, USER_A), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, USER_A, "graph.json"),
    `${JSON.stringify(legacy, null, 2)}\n`,
    "utf8"
  );

  const server = createGraphApiServer({
    graphStore: new FileGraphDocumentStore({ rootDir }),
    async verifyAccessToken() {
      return { userId: USER_A };
    },
    serveBuiltClient: false,
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });
  const baseUrl = await listen(server);

  try {
    const compat = await request(baseUrl, "/api/graph", {
      headers: authHeaders()
    });
    const list = await request(baseUrl, "/api/graphs", {
      headers: authHeaders()
    });
    const generic = await request(baseUrl, `/api/graphs/${list.body.graphs[0].id}`, {
      headers: authHeaders()
    });

    assert.equal(compat.status, 200);
    assert.equal(compat.body.exists, true);
    assert.equal(compat.body.document.id, generic.body.graph.id);
    assert.equal(
      compat.body.graph.content.bubbles["blue-health"].text,
      generic.body.graph.state.content.bubbles["blue-health"].text
    );

    compat.body.graph.content.bubbles["blue-health"].text = "Updated through compatibility";
    const savedCompat = await request(baseUrl, "/api/graph", {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(compat.body.graph)
    });
    const reloadedGeneric = await request(baseUrl, `/api/graphs/${generic.body.graph.id}`, {
      headers: authHeaders()
    });

    assert.equal(savedCompat.status, 200);
    assert.equal(
      reloadedGeneric.body.graph.state.content.bubbles["blue-health"].text,
      "Updated through compatibility"
    );
  } finally {
    server.close();
  }
});
