/**
 * @typedef {Object} GraphLoadResult
 * @property {boolean} exists
 * @property {import("../graph/graph-state.js").GraphState=} graph
 */

/**
 * A graph repository stores canonical graph state. Implementations can use
 * localStorage, files, or a future database without changing Triangle display.
 *
 * @typedef {Object} GraphRepository
 * @property {() => Promise<GraphLoadResult>|GraphLoadResult} load
 * @property {(graph: Object) => Promise<{graph: Object}>|{graph: Object}} save
 */

export function assertGraphRepository(repository) {
  if (
    !repository ||
    typeof repository !== "object" ||
    typeof repository.load !== "function" ||
    typeof repository.save !== "function"
  ) {
    throw new Error("Graph repository must provide load() and save(graph).");
  }
}
