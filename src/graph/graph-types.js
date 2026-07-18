import {
  createDefaultGraphState,
  normalizeGraphState,
  prepareGraphForStorage
} from "./graph-state.js";

export const TRIANGLE_NEEDS_MAP_TYPE = "triangle-needs-map";

const GRAPH_TYPE_DEFINITIONS = Object.freeze({
  [TRIANGLE_NEEDS_MAP_TYPE]: Object.freeze({
    type: TRIANGLE_NEEDS_MAP_TYPE,
    displayName: "Triangle",
    createDefaultState: createDefaultGraphState,
    normalizeState: normalizeGraphState,
    prepareStateForStorage: prepareGraphForStorage,
    defaultTitlePrefix: "Triangle"
  })
});

export function getGraphTypeDefinition(type) {
  return typeof type === "string" ? GRAPH_TYPE_DEFINITIONS[type] || null : null;
}

export function listSupportedGraphTypes() {
  return Object.keys(GRAPH_TYPE_DEFINITIONS);
}

export function isSupportedGraphType(type) {
  return Boolean(getGraphTypeDefinition(type));
}

export function createDefaultStateForType(type, options = {}) {
  const definition = getGraphTypeDefinition(type);

  if (!definition) {
    throw new Error(`Unsupported graph type: ${type}`);
  }

  return definition.createDefaultState(options);
}

export function normalizeStateForType(type, state, options = {}) {
  const definition = getGraphTypeDefinition(type);

  if (!definition) {
    throw new Error(`Unsupported graph type: ${type}`);
  }

  return definition.normalizeState(state, options);
}

export function prepareStateForStorage(type, state, options = {}) {
  const definition = getGraphTypeDefinition(type);

  if (!definition) {
    throw new Error(`Unsupported graph type: ${type}`);
  }

  return definition.prepareStateForStorage(state, options);
}
