import assert from "node:assert/strict";
import test from "node:test";
import { GraphController } from "../src/graph/graph-controller.js";
import { createDefaultGraphState } from "../src/graph/graph-state.js";

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for condition.");
}

test("serialized saves preserve newest edit when an older request finishes later", async () => {
  const initialGraph = createDefaultGraphState();
  const saves = [];
  const resolvers = [];
  const controller = new GraphController({
    remoteRepository: {
      async load() {
        return {
          exists: true,
          graph: initialGraph
        };
      },
      save(graph) {
        saves.push(graph);
        return new Promise(resolve => {
          resolvers.push(resolve);
        });
      }
    },
    debounceMs: 10
  });

  await controller.initialize();
  controller.setBubbleText("blue-learn", "older edit");
  const flushPromise = controller.flush({ timeoutMs: null });
  await waitFor(() => saves.length === 1);

  controller.setBubbleText("blue-learn", "middle edit");
  controller.setBubbleText("blue-learn", "newer edit");
  resolvers[0]({ graph: saves[0] });

  await waitFor(() => saves.length === 2);
  assert.equal(saves[0].content.bubbles["blue-learn"].text, "older edit");
  assert.equal(saves[1].content.bubbles["blue-learn"].text, "newer edit");

  resolvers[1]({ graph: saves[1] });
  const result = await flushPromise;

  assert.equal(result.ok, true);
  assert.equal(controller.isDirty(), false);
  assert.equal(
    controller.getState().content.bubbles["blue-learn"].text,
    "newer edit"
  );
  controller.destroy();
});

test("remote state wins over legacy local state and is not overwritten on initialization", async () => {
  const remoteGraph = createDefaultGraphState();
  const localGraph = createDefaultGraphState();
  remoteGraph.content.bubbles["blue-learn"].text = "Remote graph";
  localGraph.content.bubbles["blue-learn"].text = "Local legacy graph";
  let saveCount = 0;

  const controller = new GraphController({
    remoteRepository: {
      async load() {
        return {
          exists: true,
          graph: remoteGraph
        };
      },
      async save(graph) {
        saveCount += 1;
        return { graph };
      }
    },
    localRepository: {
      load() {
        return {
          exists: true,
          graph: localGraph
        };
      },
      save(graph) {
        return { graph };
      }
    },
    debounceMs: 1
  });

  await controller.initialize();
  await new Promise(resolve => setTimeout(resolve, 5));

  assert.equal(
    controller.getState().content.bubbles["blue-learn"].text,
    "Remote graph"
  );
  assert.equal(saveCount, 0);
  controller.destroy();
});

test("legacy local state is migrated once when no remote file exists", async () => {
  const localGraph = createDefaultGraphState();
  localGraph.content.bubbles["blue-learn"].text = "Migrated once";
  const saves = [];

  const controller = new GraphController({
    remoteRepository: {
      async load() {
        return { exists: false };
      },
      async save(graph) {
        saves.push(graph);
        return { graph };
      }
    },
    localRepository: {
      load() {
        return {
          exists: true,
          graph: localGraph
        };
      },
      save(graph) {
        return { graph };
      }
    }
  });

  await controller.initialize();
  await controller.flush({ timeoutMs: null });
  await controller.flush({ timeoutMs: null });

  assert.equal(saves.length, 1);
  assert.equal(saves[0].content.bubbles["blue-learn"].text, "Migrated once");
  assert.equal(controller.isDirty(), false);
  controller.destroy();
});

test("malformed save responses keep dirty state", async () => {
  const controller = new GraphController({
    remoteRepository: {
      async load() {
        return {
          exists: true,
          graph: createDefaultGraphState()
        };
      },
      async save() {
        return {};
      }
    }
  });

  await controller.initialize();
  controller.setBubbleText("blue-learn", "Still dirty");

  const result = await controller.flush({ timeoutMs: null });

  assert.equal(result.ok, false);
  assert.equal(controller.isDirty(), true);
  assert.equal(
    controller.getState().content.bubbles["blue-learn"].text,
    "Still dirty"
  );
  controller.destroy();
});

test("failed save keeps dirty state and can be retried", async () => {
  let shouldFail = true;
  let saveCount = 0;
  const controller = new GraphController({
    remoteRepository: {
      async load() {
        return {
          exists: true,
          graph: createDefaultGraphState()
        };
      },
      async save(graph) {
        saveCount += 1;

        if (shouldFail) {
          throw new Error("network down");
        }

        return { graph };
      }
    }
  });

  await controller.initialize();
  controller.setBubbleText("blue-health", "Retained after failure");

  const failed = await controller.flush({ timeoutMs: null });
  assert.equal(failed.ok, false);
  assert.equal(controller.isDirty(), true);
  assert.equal(controller.getStatus().status, "error");

  shouldFail = false;
  const retried = await controller.flush({ timeoutMs: null });

  assert.equal(retried.ok, true);
  assert.equal(controller.isDirty(), false);
  assert.equal(saveCount, 2);
  assert.equal(
    controller.getState().content.bubbles["blue-health"].text,
    "Retained after failure"
  );
  controller.destroy();
});
