import {
  graphStateFromBubbleTexts,
  LEGACY_LOCAL_STORAGE_KEY
} from "../graph/graph-state.js";

export class LocalStorageGraphRepository {
  constructor({
    storage = globalThis.localStorage,
    storageKey = LEGACY_LOCAL_STORAGE_KEY,
    now = () => new Date()
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.now = now;
  }

  load() {
    if (!this.storage) {
      return { exists: false };
    }

    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      return { exists: false };
    }

    const parsed = JSON.parse(raw);
    return {
      exists: true,
      graph: graphStateFromBubbleTexts(parsed, { now: this.now })
    };
  }

  save(graph) {
    return { graph };
  }
}
