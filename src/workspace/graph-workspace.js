import { GraphController } from "../graph/graph-controller.js";
import { graphSummaryFromDocument, sortGraphSummaries } from "../graph/graph-document.js";
import {
  LocalGraphWorkspacePreferences,
  LocalStorageGraphDocumentDraftRepository
} from "../persistence/local-storage-graph-document-repository.js";
import { RemoteGraphDocumentStateRepository } from "../persistence/remote-graph-document-repository.js";

const DEFAULT_FLUSH_TIMEOUT_MS = 2000;

function upsertSummary(summaries, document) {
  const summary = graphSummaryFromDocument(document);
  return sortGraphSummaries([
    ...summaries.filter(existing => existing.id !== summary.id),
    summary
  ]);
}

export class GraphWorkspace {
  constructor({
    container,
    actionsContainer,
    graphRepository,
    graphAdapters,
    defaultGraphType,
    userId,
    storage = globalThis.localStorage,
    legacyDraftKeys = [],
    preferences = null,
    now = () => new Date()
  }) {
    if (!container) {
      throw new Error("GraphWorkspace requires a container.");
    }

    if (!graphRepository) {
      throw new Error("GraphWorkspace requires a graphRepository.");
    }

    this.container = container;
    this.actionsContainer = actionsContainer;
    this.graphRepository = graphRepository;
    this.graphAdapters = new Map(graphAdapters.map(adapter => [adapter.type, adapter]));
    this.defaultGraphType = defaultGraphType;
    this.userId = userId;
    this.storage = storage;
    this.legacyDraftKeys = legacyDraftKeys;
    this.now = now;
    this.preferences =
      preferences || new LocalGraphWorkspacePreferences({ storage, userId });

    this.graphs = [];
    this.activeDocument = null;
    this.graphController = null;
    this.unmountEditor = null;
    this.destroyed = false;
    this.busy = false;
    this.operationGeneration = 0;
    this.controlsCleanup = [];
    this.controls = {};
  }

  async mount() {
    this.#renderControls();
    await this.#loadGraphList();

    if (this.graphs.length === 0) {
      await this.createGraph({ rethrow: true });
      return;
    }

    const activeGraphId = this.#chooseInitialGraphId();
    await this.openGraph(activeGraphId, { skipFlush: true, rethrow: true });
  }

  async createGraph({ rethrow = false } = {}) {
    if (this.destroyed) {
      return;
    }

    this.#setBusy(true, "Creating graph...");

    try {
      await this.flush({ timeoutMs: DEFAULT_FLUSH_TIMEOUT_MS });
      const result = await this.graphRepository.createGraph({
        type: this.defaultGraphType
      });
      this.graphs = upsertSummary(this.graphs, result.graph);
      this.preferences.saveIndexCache(this.graphs);
      await this.openGraph(result.graph.id, {
        initialDocument: result.graph,
        skipFlush: true
      });
    } catch (error) {
      this.#setStatus(error.message || "Graph creation failed.", "error");
      if (rethrow) {
        throw error;
      }
    } finally {
      this.#setBusy(false);
    }
  }

  async openGraph(
    graphId,
    { initialDocument = null, skipFlush = false, rethrow = false } = {}
  ) {
    if (this.destroyed || !graphId || this.activeDocument?.id === graphId) {
      return;
    }

    const adapter = this.#adapterForSummaryOrDocument(initialDocument || { id: graphId });
    const generation = ++this.operationGeneration;
    this.#setBusy(true, "Opening graph...");

    try {
      if (!skipFlush) {
        await this.flush({ timeoutMs: DEFAULT_FLUSH_TIMEOUT_MS });
      }

      const document = initialDocument
        ? initialDocument
        : (await this.graphRepository.loadGraph(graphId)).graph;
      const documentAdapter = this.#adapterForSummaryOrDocument(document);

      if (this.destroyed || generation !== this.operationGeneration) {
        return;
      }

      await this.#replaceActiveDocument(document, documentAdapter);
    } catch (error) {
      this.#setStatus(error.message || "Graph opening failed.", "error");
      if (rethrow) {
        throw error;
      }
    } finally {
      this.#setBusy(false);
    }

    return adapter;
  }

  async renameActive(title) {
    if (this.destroyed || !this.activeDocument) {
      return;
    }

    this.#setBusy(true, "Renaming graph...");

    try {
      const result = await this.graphRepository.renameGraph(
        this.activeDocument.id,
        title
      );
      this.#handleDocumentSaved(result.graph);
      this.#hideRenameForm();
      this.#setStatus("");
    } catch (error) {
      this.#setStatus(error.message || "Rename failed.", "error");
    } finally {
      this.#setBusy(false);
    }
  }

  async flush(options = {}) {
    if (!this.graphController) {
      return { ok: true };
    }

    return this.graphController.flush(options);
  }

  async destroy() {
    this.destroyed = true;
    this.operationGeneration += 1;
    await this.flush({ timeoutMs: DEFAULT_FLUSH_TIMEOUT_MS });
    this.#unmountActiveEditor();
    this.controlsCleanup.forEach(cleanup => cleanup());
    this.controlsCleanup = [];
    this.actionsContainer?.replaceChildren();
    this.container.replaceChildren();
  }

  getActiveDocument() {
    if (!this.activeDocument || !this.graphController) {
      return this.activeDocument;
    }

    return {
      ...this.activeDocument,
      state: this.graphController.getState()
    };
  }

  async #loadGraphList() {
    try {
      const result = await this.graphRepository.listGraphs({
        type: this.defaultGraphType
      });
      this.graphs = sortGraphSummaries(result.graphs);
      this.preferences.saveIndexCache(this.graphs);
      this.#setStatus("");
    } catch (error) {
      const cached = this.preferences.loadIndexCache();
      this.graphs = cached.graphs.filter(
        summary => summary.type === this.defaultGraphType
      );

      if (this.graphs.length === 0) {
        throw error;
      }

      this.#setStatus("Using cached graph list.", "error");
    }

    this.#updateControlState();
  }

  #chooseInitialGraphId() {
    const preferred = this.preferences.loadActiveGraphId();
    if (preferred && this.graphs.some(summary => summary.id === preferred)) {
      return preferred;
    }

    return this.graphs[0]?.id || null;
  }

  async #replaceActiveDocument(document, adapter) {
    const remoteRepository = new RemoteGraphDocumentStateRepository({
      graphRepository: this.graphRepository,
      graphId: document.id,
      initialDocument: document,
      onSaved: savedDocument => this.#handleDocumentSaved(savedDocument)
    });
    const localRepository = new LocalStorageGraphDocumentDraftRepository({
      storage: this.storage,
      userId: this.userId,
      graphId: document.id,
      graphType: document.type,
      legacyStorageKeys: this.graphs.length <= 1 ? this.legacyDraftKeys : [],
      now: this.now
    });
    const controller = new GraphController({
      remoteRepository,
      localRepository,
      now: this.now
    });

    await controller.initialize();
    await this.flush({ timeoutMs: DEFAULT_FLUSH_TIMEOUT_MS });

    this.#unmountActiveEditor();
    this.graphController = controller;
    this.activeDocument = {
      ...document,
      state: controller.getState()
    };
    this.graphs = upsertSummary(this.graphs, this.activeDocument);
    this.preferences.saveActiveGraphId(document.id);
    this.preferences.saveIndexCache(this.graphs);

    this.unmountEditor = adapter.mountEditor({
      container: this.container,
      actionsContainer: this.controls.exportActions,
      graphController: controller,
      graphDocument: this.activeDocument,
      getGraphDocument: () => this.getActiveDocument()
    });
    this.#updateControlState();
    this.#setStatus("");
  }

  #unmountActiveEditor() {
    if (this.unmountEditor) {
      this.unmountEditor();
      this.unmountEditor = null;
    }

    if (this.graphController) {
      this.graphController.destroy();
      this.graphController = null;
    }
  }

  #handleDocumentSaved(document) {
    if (!document || this.activeDocument?.id !== document.id) {
      return;
    }

    this.activeDocument = {
      ...document,
      state: this.graphController?.getState() || document.state
    };
    this.graphs = upsertSummary(this.graphs, this.activeDocument);
    this.preferences.saveIndexCache(this.graphs);
    this.#updateControlState();
  }

  #adapterForSummaryOrDocument(value) {
    const summary =
      value.type
        ? value
        : this.graphs.find(graph => graph.id === value.id);
    const adapter = this.graphAdapters.get(summary?.type || this.defaultGraphType);

    if (!adapter) {
      throw new Error("This graph type is not supported by the active client.");
    }

    return adapter;
  }

  #renderControls() {
    if (!this.actionsContainer) {
      return;
    }

    const workspaceControls = document.createElement("div");
    workspaceControls.className = "graph-workspace-controls";
    workspaceControls.innerHTML = `
      <form class="graph-select-form" aria-label="Graphes sauvegardes">
        <select class="graph-select" aria-label="Graphes sauvegardes"></select>
      </form>
      <button class="graph-new-button" type="button">Nouveau</button>
      <button class="graph-rename-button" type="button">Renommer</button>
      <form class="graph-rename-form" hidden>
        <input
          class="graph-rename-input"
          type="text"
          maxlength="120"
          aria-label="Nouveau nom du graphe"
        >
        <button class="graph-rename-save" type="submit">OK</button>
        <button class="graph-rename-cancel" type="button">Annuler</button>
      </form>
      <p class="graph-workspace-status" role="status" aria-live="polite"></p>
    `;

    const exportActions = document.createElement("div");
    exportActions.className = "graph-export-actions";

    this.actionsContainer.replaceChildren(workspaceControls, exportActions);
    this.controls = {
      workspaceControls,
      exportActions,
      select: workspaceControls.querySelector(".graph-select"),
      newButton: workspaceControls.querySelector(".graph-new-button"),
      renameButton: workspaceControls.querySelector(".graph-rename-button"),
      renameForm: workspaceControls.querySelector(".graph-rename-form"),
      renameInput: workspaceControls.querySelector(".graph-rename-input"),
      renameCancel: workspaceControls.querySelector(".graph-rename-cancel"),
      status: workspaceControls.querySelector(".graph-workspace-status")
    };

    const handleSelect = event => {
      this.openGraph(event.target.value);
    };
    const handleNew = () => {
      this.createGraph();
    };
    const handleRename = () => {
      this.#showRenameForm();
    };
    const handleRenameSubmit = event => {
      event.preventDefault();
      this.renameActive(this.controls.renameInput.value);
    };
    const handleRenameCancel = () => {
      this.#hideRenameForm();
    };

    this.controls.select.addEventListener("change", handleSelect);
    this.controls.newButton.addEventListener("click", handleNew);
    this.controls.renameButton.addEventListener("click", handleRename);
    this.controls.renameForm.addEventListener("submit", handleRenameSubmit);
    this.controls.renameCancel.addEventListener("click", handleRenameCancel);

    this.controlsCleanup.push(() => {
      this.controls.select.removeEventListener("change", handleSelect);
      this.controls.newButton.removeEventListener("click", handleNew);
      this.controls.renameButton.removeEventListener("click", handleRename);
      this.controls.renameForm.removeEventListener("submit", handleRenameSubmit);
      this.controls.renameCancel.removeEventListener("click", handleRenameCancel);
    });
  }

  #updateControlState() {
    if (!this.controls.select) {
      return;
    }

    this.controls.select.replaceChildren(
      ...this.graphs.map(summary => {
        const option = document.createElement("option");
        option.value = summary.id;
        option.textContent = summary.title;
        option.selected = summary.id === this.activeDocument?.id;
        return option;
      })
    );

    this.controls.select.disabled = this.busy || this.graphs.length === 0;
    this.controls.newButton.disabled = this.busy;
    this.controls.renameButton.disabled = this.busy || !this.activeDocument;
  }

  #setBusy(isBusy, message = "") {
    this.busy = isBusy;
    this.#updateControlState();

    if (message) {
      this.#setStatus(message);
    }
  }

  #setStatus(message, tone = "info") {
    if (!this.controls.status) {
      return;
    }

    this.controls.status.textContent = message;
    this.controls.status.dataset.tone = tone;
  }

  #showRenameForm() {
    if (!this.activeDocument) {
      return;
    }

    this.controls.renameInput.value = this.activeDocument.title;
    this.controls.renameForm.hidden = false;
    this.controls.renameInput.focus();
    this.controls.renameInput.select();
  }

  #hideRenameForm() {
    if (this.controls.renameForm) {
      this.controls.renameForm.hidden = true;
    }
  }
}
