import {
  graphStateFromBubbleTexts,
  LEGACY_LOCAL_STORAGE_KEY,
  normalizeGraphState
} from "../graph/graph-state.js";

const LOCAL_DRAFT_STORAGE_KEY_PREFIX = "triangle-graph-draft-v1";

export class LocalStorageGraphRepository {
  constructor({
    storage = globalThis.localStorage,
    userId = "",
    storageKey = userId
      ? `${LOCAL_DRAFT_STORAGE_KEY_PREFIX}:${userId}`
      : LOCAL_DRAFT_STORAGE_KEY_PREFIX,
    legacyStorageKey = LEGACY_LOCAL_STORAGE_KEY,
    now = () => new Date()
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.legacyStorageKey = legacyStorageKey;
    this.now = now;
  }

  load() {
    if (!this.storage) {
      return { exists: false };
    }

    const draft = this.storage.getItem(this.storageKey);
    if (draft) {
      return {
        exists: true,
        graph: normalizeGraphState(JSON.parse(draft), { now: this.now })
      };
    }

    const legacy = this.storage.getItem(this.legacyStorageKey);
    if (!legacy) {
      return {
        exists: false
      };
    }

    const parsed = JSON.parse(legacy);
    return {
      exists: true,
      graph: graphStateFromBubbleTexts(parsed, { now: this.now })
    };
  }

  save(graph) {
    if (this.storage) {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify(normalizeGraphState(graph, { now: this.now }))
      );
    }

    return {
      graph
    };
  }
}

export { LOCAL_DRAFT_STORAGE_KEY_PREFIX };
