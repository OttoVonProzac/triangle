import {
  normalizeGraphDocument,
  normalizeGraphSummary
} from "../graph/graph-document.js";

export class RemoteGraphDocumentRepository {
  constructor({
    endpoint = "/api/graphs",
    getAccessToken,
    fetchImpl = globalThis.fetch
  }) {
    if (typeof getAccessToken !== "function") {
      throw new Error("RemoteGraphDocumentRepository requires getAccessToken.");
    }

    if (typeof fetchImpl !== "function") {
      throw new Error("RemoteGraphDocumentRepository requires fetch.");
    }

    this.endpoint = endpoint;
    this.getAccessToken = getAccessToken;
    this.fetch = fetchImpl;
  }

  async listGraphs({ type = null } = {}) {
    const suffix = type ? `?type=${encodeURIComponent(type)}` : "";
    const response = await this.#request("GET", suffix);

    if (!Array.isArray(response?.graphs)) {
      throw new Error("Graph list response was malformed.");
    }

    return {
      graphs: response.graphs.map(normalizeGraphSummary)
    };
  }

  async createGraph({ type, title = null, state = null }) {
    const response = await this.#request("POST", "", {
      type,
      ...(title ? { title } : {}),
      ...(state ? { state } : {})
    });

    return this.#requireGraph(response, "Graph create response was malformed.");
  }

  async loadGraph(id) {
    const response = await this.#request("GET", `/${encodeURIComponent(id)}`);
    return this.#requireGraph(response, "Graph load response was malformed.");
  }

  async saveGraphState(id, state) {
    const response = await this.#request("PUT", `/${encodeURIComponent(id)}`, {
      state
    });
    return this.#requireGraph(response, "Graph save response was malformed.");
  }

  async renameGraph(id, title) {
    const response = await this.#request("PATCH", `/${encodeURIComponent(id)}`, {
      title
    });
    return this.#requireGraph(response, "Graph rename response was malformed.");
  }

  #requireGraph(response, message) {
    if (!response?.graph || typeof response.graph !== "object") {
      throw new Error(message);
    }

    return {
      graph: normalizeGraphDocument(response.graph)
    };
  }

  async #request(method, pathSuffix = "", body = null) {
    const token = await this.getAccessToken();
    const response = await this.fetch(`${this.endpoint}${pathSuffix}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    let payload = null;
    const text = await response.text();
    if (text) {
      payload = JSON.parse(text);
    }

    if (!response.ok) {
      const message = payload?.error?.message || "Graph request failed.";
      const error = new Error(message);
      error.status = response.status;
      error.code = payload?.error?.code || "graph_request_failed";
      throw error;
    }

    return payload;
  }
}

export class ResilientGraphDocumentRepository {
  constructor({
    primaryRepository,
    fallbackRepository,
    onFallback = null
  }) {
    if (!primaryRepository || !fallbackRepository) {
      throw new Error(
        "ResilientGraphDocumentRepository requires primary and fallback repositories."
      );
    }

    this.primaryRepository = primaryRepository;
    this.fallbackRepository = fallbackRepository;
    this.onFallback = onFallback;
    this.useFallback = false;
    this.lastPrimaryError = null;
  }

  async listGraphs(options = {}) {
    return this.#run(
      "listGraphs",
      repository => repository.listGraphs(options),
      { activateFallbackOnError: true }
    );
  }

  async createGraph(input) {
    return this.#run("createGraph", repository => repository.createGraph(input));
  }

  async loadGraph(id) {
    return this.#run("loadGraph", repository => repository.loadGraph(id));
  }

  async saveGraphState(id, state) {
    return this.#run(
      "saveGraphState",
      repository => repository.saveGraphState(id, state)
    );
  }

  async renameGraph(id, title) {
    return this.#run("renameGraph", repository => repository.renameGraph(id, title));
  }

  async #run(operation, callback, { activateFallbackOnError = false } = {}) {
    if (this.useFallback) {
      return callback(this.fallbackRepository);
    }

    try {
      return await callback(this.primaryRepository);
    } catch (error) {
      if (!activateFallbackOnError) {
        throw error;
      }

      this.useFallback = true;
      this.lastPrimaryError = error;

      if (this.onFallback) {
        this.onFallback({
          error,
          operation,
          fallbackRepository: this.fallbackRepository
        });
      }

      return callback(this.fallbackRepository);
    }
  }
}

export class RemoteGraphDocumentStateRepository {
  constructor({ graphRepository, graphId, initialDocument = null, onSaved = null }) {
    this.graphRepository = graphRepository;
    this.graphId = graphId;
    this.initialDocument = initialDocument;
    this.onSaved = onSaved;
  }

  async load() {
    if (this.initialDocument) {
      const graph = this.initialDocument;
      this.initialDocument = null;
      return {
        exists: true,
        graph: graph.state
      };
    }

    const result = await this.graphRepository.loadGraph(this.graphId);
    return {
      exists: true,
      graph: result.graph.state
    };
  }

  async save(state) {
    const result = await this.graphRepository.saveGraphState(this.graphId, state);

    if (this.onSaved) {
      this.onSaved(result.graph);
    }

    return {
      graph: result.graph.state
    };
  }
}
