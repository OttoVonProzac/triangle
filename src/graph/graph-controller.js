import {
  BUBBLE_IDS,
  cloneGraphState,
  createDefaultGraphState,
  isKnownBubbleId,
  MAX_BUBBLE_TEXT_LENGTH,
  normalizeGraphState
} from "./graph-state.js";

const SAVE_STATUS = Object.freeze({
  IDLE: "idle",
  SAVING: "saving",
  SAVED: "saved",
  ERROR: "error"
});

function createTimeout(ms) {
  return new Promise(resolve => {
    setTimeout(() => resolve({ timedOut: true }), ms);
  });
}

function timestampMillis(value) {
  if (!value || typeof value !== "string") {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function shouldUsePendingLocalDraft(remoteGraph, fallback) {
  if (!fallback?.exists || !fallback.pending) {
    return false;
  }

  return (
    timestampMillis(fallback.graph?.updatedAt) >=
    timestampMillis(remoteGraph?.updatedAt)
  );
}

export class GraphController {
  constructor({
    remoteRepository,
    localRepository = null,
    debounceMs = 650,
    flushTimeoutMs = 2000,
    now = () => new Date()
  }) {
    if (!remoteRepository) {
      throw new Error("GraphController requires a remoteRepository.");
    }

    this.remoteRepository = remoteRepository;
    this.localRepository = localRepository;
    this.debounceMs = debounceMs;
    this.flushTimeoutMs = flushTimeoutMs;
    this.now = now;

    this.state = createDefaultGraphState({ now });
    this.listeners = new Set();
    this.status = SAVE_STATUS.IDLE;
    this.dirty = false;
    this.revision = 0;
    this.lastSavedRevision = 0;
    this.saveTimer = null;
    this.savePromise = null;
    this.destroyed = false;
    this.lastError = null;
  }

  async initialize() {
    let remote = null;
    try {
      remote = await this.remoteRepository.load();
    } catch (error) {
      this.lastError = error;
      this.#setStatus(SAVE_STATUS.ERROR);

      const fallback = await this.#loadLocalFallback();
      if (fallback?.exists) {
        this.state = normalizeGraphState(fallback.graph, { now: this.now });
      } else {
        this.state = createDefaultGraphState({ now: this.now });
      }

      this.dirty = false;
      this.revision = 0;
      this.lastSavedRevision = 0;
      this.#notify();
      return this.getState();
    }

    if (remote.exists) {
      const fallback = await this.#loadLocalFallback();
      if (shouldUsePendingLocalDraft(remote.graph, fallback)) {
        this.state = normalizeGraphState(fallback.graph, { now: this.now });
        this.dirty = true;
        this.revision = 1;
        this.lastSavedRevision = 0;
        this.#notify();
        this.scheduleSave();
        return this.getState();
      }

      this.state = normalizeGraphState(remote.graph, { now: this.now });
      this.dirty = false;
      this.revision = 0;
      this.lastSavedRevision = 0;
      this.#saveLocalSnapshot(this.state, { pending: false });
      this.#notify();
      return this.getState();
    }

    const fallback = await this.#loadLocalFallback();

    if (fallback?.exists) {
      this.state = normalizeGraphState(fallback.graph, { now: this.now });
    } else {
      this.state = createDefaultGraphState({ now: this.now });
    }

    this.dirty = true;
    this.revision += 1;
    this.#notify();
    this.#saveLocalSnapshot(this.state, { pending: true });
    this.scheduleSave();
    return this.getState();
  }

  async #loadLocalFallback() {
    if (!this.localRepository) {
      return null;
    }

    try {
      return await this.localRepository.load();
    } catch (error) {
      this.lastError = error;
      return null;
    }
  }

  getState() {
    return cloneGraphState(this.state);
  }

  getStatus() {
    return {
      status: this.status,
      dirty: this.dirty,
      error: this.lastError
    };
  }

  isDirty() {
    return this.dirty;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({
      state: this.getState(),
      status: this.getStatus()
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  setBubbleText(id, text) {
    if (!isKnownBubbleId(id)) {
      throw new Error(`Unknown bubble id: ${id}`);
    }

    if (typeof text !== "string") {
      throw new Error(`Bubble text for ${id} must be a string.`);
    }

    if (text.length > MAX_BUBBLE_TEXT_LENGTH) {
      throw new Error(
        `Bubble text for ${id} exceeds ${MAX_BUBBLE_TEXT_LENGTH} characters.`
      );
    }

    if (this.state.content.bubbles[id]?.text === text) {
      return;
    }

    this.state = {
      ...this.state,
      updatedAt: this.now().toISOString(),
      content: {
        bubbles: {
          ...this.state.content.bubbles,
          [id]: { text }
        }
      }
    };
    this.dirty = true;
    this.revision += 1;
    this.lastError = null;
    this.#saveLocalSnapshot(this.state, { pending: true });
    this.#notify();
    this.scheduleSave();
  }

  scheduleSave() {
    if (this.destroyed || !this.dirty) {
      return;
    }

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.#ensureSaveLoop().catch(() => {});
    }, this.debounceMs);
  }

  async flush({ timeoutMs = this.flushTimeoutMs } = {}) {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const save = this.#ensureSaveLoop();
    if (!timeoutMs && timeoutMs !== 0) {
      return save;
    }

    const result = await Promise.race([save, createTimeout(timeoutMs)]);
    if (result?.timedOut) {
      return {
        ok: false,
        timedOut: true,
        dirty: this.dirty
      };
    }

    return result;
  }

  destroy() {
    this.destroyed = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.listeners.clear();
  }

  async #ensureSaveLoop() {
    if (this.savePromise) {
      return this.savePromise;
    }

    this.savePromise = this.#runSaveLoop();

    try {
      return await this.savePromise;
    } finally {
      this.savePromise = null;
    }
  }

  async #runSaveLoop() {
    while (this.dirty) {
      const revisionToSave = this.revision;
      const snapshot = this.getState();

      this.#setStatus(SAVE_STATUS.SAVING);

      try {
        const saved = await this.remoteRepository.save(snapshot);

        if (!saved?.graph || typeof saved.graph !== "object") {
          throw new Error("Graph save response did not include graph state.");
        }

        if (this.revision === revisionToSave) {
          this.state = normalizeGraphState(saved.graph || snapshot, {
            now: this.now
          });
          this.dirty = false;
          this.lastSavedRevision = revisionToSave;
          this.lastError = null;
          this.#saveLocalSnapshot(this.state, { pending: false });
          this.#setStatus(SAVE_STATUS.SAVED);
          return {
            ok: true,
            graph: this.getState()
          };
        }
      } catch (error) {
        this.lastError = error;
        this.dirty = true;
        this.#setStatus(SAVE_STATUS.ERROR);
        return {
          ok: false,
          error,
          dirty: true
        };
      }
    }

    if (!this.dirty && this.status === SAVE_STATUS.SAVING) {
      this.#setStatus(SAVE_STATUS.SAVED);
    }

    return {
      ok: true,
      graph: this.getState()
    };
  }

  #setStatus(status) {
    if (this.status === status) {
      this.#notify();
      return;
    }

    this.status = status;
    this.#notify();
  }

  #notify() {
    const payload = {
      state: this.getState(),
      status: this.getStatus()
    };

    this.listeners.forEach(listener => listener(payload));
  }

  #saveLocalSnapshot(graph, { pending = this.dirty } = {}) {
    if (!this.localRepository || typeof this.localRepository.save !== "function") {
      return;
    }

    try {
      this.localRepository.save(graph, { pending });
    } catch (error) {
      this.lastError = error;
    }
  }
}

export { BUBBLE_IDS, SAVE_STATUS };
