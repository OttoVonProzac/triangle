export class RemoteFileGraphRepository {
  constructor({
    endpoint = "/api/graph",
    getAccessToken,
    fetchImpl = globalThis.fetch
  }) {
    if (typeof getAccessToken !== "function") {
      throw new Error("RemoteFileGraphRepository requires getAccessToken.");
    }

    if (typeof fetchImpl !== "function") {
      throw new Error("RemoteFileGraphRepository requires fetch.");
    }

    this.endpoint = endpoint;
    this.getAccessToken = getAccessToken;
    this.fetch = fetchImpl;
  }

  async load() {
    const response = await this.#request("GET");

    if (!response || typeof response.exists !== "boolean") {
      throw new Error("Graph load response was malformed.");
    }

    if (response.exists && (!response.graph || typeof response.graph !== "object")) {
      throw new Error("Graph load response did not include graph state.");
    }

    return response;
  }

  async save(graph) {
    const response = await this.#request("PUT", graph);

    if (!response?.graph || typeof response.graph !== "object") {
      throw new Error("Graph save response did not include graph state.");
    }

    return {
      graph: response.graph
    };
  }

  async #request(method, body = null) {
    const token = await this.getAccessToken();
    const response = await this.fetch(this.endpoint, {
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
