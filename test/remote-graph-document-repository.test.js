import assert from "node:assert/strict";
import test from "node:test";
import {
  RemoteGraphDocumentRepository,
  ResilientGraphDocumentRepository
} from "../src/persistence/remote-graph-document-repository.js";
import { createGraphDocument } from "../src/graph/graph-document.js";
import { TRIANGLE_NEEDS_MAP_TYPE } from "../src/graph/graph-types.js";

const GRAPH_ID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test("remote repository normalizes list and document payloads", async () => {
  const graph = createGraphDocument({
    id: GRAPH_ID,
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "Remote graph",
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });
  const requests = [];
  const repository = new RemoteGraphDocumentRepository({
    async getAccessToken() {
      return "token";
    },
    async fetchImpl(url, options) {
      requests.push({ url, options });
      if (options.method === "GET" && String(url).includes("?type=")) {
        return jsonResponse({
          graphs: [
            {
              id: graph.id,
              type: graph.type,
              title: `  ${graph.title}  `,
              createdAt: graph.createdAt,
              updatedAt: graph.updatedAt
            }
          ]
        });
      }

      return jsonResponse({ graph });
    }
  });

  const listed = await repository.listGraphs({ type: TRIANGLE_NEEDS_MAP_TYPE });
  const loaded = await repository.loadGraph(GRAPH_ID);

  assert.equal(listed.graphs[0].title, "Remote graph");
  assert.equal(loaded.graph.state.graphId, "triangle");
  assert.equal(requests[0].url, "/api/graphs?type=triangle-needs-map");
  assert.equal(requests[1].url, `/api/graphs/${GRAPH_ID}`);
});

test("resilient repository falls back locally when initial list fails", async () => {
  const calls = [];
  const fallbackGraph = createGraphDocument({
    id: GRAPH_ID,
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "Fallback graph",
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });
  const primaryError = new Error("API unavailable");
  const repository = new ResilientGraphDocumentRepository({
    primaryRepository: {
      async listGraphs() {
        calls.push("primary:list");
        throw primaryError;
      },
      async createGraph() {
        calls.push("primary:create");
        throw new Error("should not use primary after fallback");
      }
    },
    fallbackRepository: {
      async listGraphs() {
        calls.push("fallback:list");
        return { graphs: [] };
      },
      async createGraph() {
        calls.push("fallback:create");
        return { graph: fallbackGraph };
      }
    }
  });

  const list = await repository.listGraphs();
  const created = await repository.createGraph({
    type: TRIANGLE_NEEDS_MAP_TYPE
  });

  assert.deepEqual(list, { graphs: [] });
  assert.equal(created.graph.title, "Fallback graph");
  assert.deepEqual(calls, ["primary:list", "fallback:list", "fallback:create"]);
  assert.equal(repository.lastPrimaryError, primaryError);
});
