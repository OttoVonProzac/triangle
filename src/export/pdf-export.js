const PAGE_MARGIN_PT = 28;
const PAPER_COLOR = "#fbfaf7";

function blurActiveStageElement(stageElement) {
  const activeElement = stageElement.ownerDocument.activeElement;

  if (
    activeElement &&
    stageElement.contains(activeElement) &&
    typeof activeElement.blur === "function"
  ) {
    activeElement.blur();
  }
}

export async function exportStageToPdf(stageElement, { filename }) {
  if (!stageElement) {
    throw new Error("PDF export requires the graph stage element.");
  }

  const [
    { default: html2canvas },
    { jsPDF }
  ] = await Promise.all([
    import("html2canvas"),
    import("jspdf")
  ]);

  blurActiveStageElement(stageElement);

  const rect = stageElement.getBoundingClientRect();
  const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const canvas = await html2canvas(stageElement, {
    backgroundColor: PAPER_COLOR,
    height: rect.height,
    removeContainer: true,
    scale,
    useCORS: true,
    width: rect.width,
    windowHeight: document.documentElement.clientHeight,
    windowWidth: document.documentElement.clientWidth
  });

  const image = canvas.toDataURL("image/png");
  const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    compress: true,
    format: "a4",
    orientation,
    unit: "pt"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const availableWidth = pageWidth - PAGE_MARGIN_PT * 2;
  const availableHeight = pageHeight - PAGE_MARGIN_PT * 2;
  const imageRatio = canvas.width / canvas.height;

  let imageWidth = availableWidth;
  let imageHeight = imageWidth / imageRatio;

  if (imageHeight > availableHeight) {
    imageHeight = availableHeight;
    imageWidth = imageHeight * imageRatio;
  }

  const x = (pageWidth - imageWidth) / 2;
  const y = (pageHeight - imageHeight) / 2;

  pdf.setFillColor(251, 250, 247);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  pdf.addImage(image, "PNG", x, y, imageWidth, imageHeight);
  pdf.save(filename);
}
