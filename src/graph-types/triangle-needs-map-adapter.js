import "../triangle/triangle.css";
import {
  createDefaultGraphState,
  normalizeGraphState
} from "../graph/graph-state.js";
import { TRIANGLE_NEEDS_MAP_TYPE } from "../graph/graph-types.js";
import {
  buildMarkdownExport,
  buildPlainTextExport
} from "../export/export-formatters.js";
import { buildExportModel } from "../export/export-model.js";
import { exportStageToPdf } from "../export/pdf-export.js";
import { mountTriangle } from "../triangle/triangle.js";

export const triangleNeedsMapAdapter = {
  type: TRIANGLE_NEEDS_MAP_TYPE,
  displayName: "Triangle",
  filenamePrefix: "triangle",

  createDefaultState: createDefaultGraphState,
  validateState: normalizeGraphState,

  mountEditor({
    container,
    actionsContainer,
    graphController,
    graphDocument,
    getGraphDocument
  }) {
    return mountTriangle(container, {
      actionsContainer,
      graphController,
      graphDocument,
      getGraphDocument,
      graphAdapter: triangleNeedsMapAdapter
    });
  },

  buildMarkdown(graphDocument) {
    return buildMarkdownExport(
      buildExportModel(graphDocument.state, { title: graphDocument.title })
    );
  },

  buildPlainText(graphDocument) {
    return buildPlainTextExport(
      buildExportModel(graphDocument.state, { title: graphDocument.title })
    );
  },

  exportPdf({ stageElement, filename }) {
    return exportStageToPdf(stageElement, { filename });
  }
};
