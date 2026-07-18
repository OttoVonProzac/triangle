import { mountExportControl } from "../export/export-control.js";

const triangleMarkup = `
<div class="page">
  <p class="persistence-status" data-persistence-status aria-live="polite"></p>
  <main class="stage" id="stage" aria-label="Carte interactive du développement de l’enfant">

    <section class="sector sector-blue" data-orientation="vertical" aria-label="Développement de l’enfant">
      <div class="row" data-base="1.02">
        <div class="shell" data-base="1.34">
          <article class="bubble blue" data-id="blue-learn">
            <div class="editable" contenteditable="true" spellcheck="false">Apprendre, découvrir</div>
          </article>
        </div>
        <div class="shell" data-base="1.05">
          <article class="bubble blue" data-id="blue-health">
            <div class="editable" contenteditable="true" spellcheck="false">Santé</div>
          </article>
        </div>
      </div>

      <div class="row" data-base="1.02">
        <div class="shell" data-base="1.02">
          <article class="bubble blue" data-id="blue-identity">
            <div class="editable" contenteditable="true" spellcheck="false">Identité</div>
          </article>
        </div>
        <div class="shell" data-base="1.28">
          <article class="bubble blue" data-id="blue-relations">
            <div class="editable" contenteditable="true" spellcheck="false">Ma relation
avec les autres</div>
          </article>
        </div>
      </div>

      <div class="row single-row" data-base="1.18">
        <div class="shell" data-base="1" data-single-width=".92">
          <article class="bubble blue" data-id="blue-family">
            <div class="editable" contenteditable="true" spellcheck="false">Relations familiales</div>
          </article>
        </div>
      </div>
    </section>

    <section class="sector sector-violet" data-orientation="vertical" aria-label="Rôle parental">
      <div class="row" data-base="1.02">
        <div class="shell" data-base="1.05">
          <article class="bubble violet" data-id="violet-care">
            <div class="editable" contenteditable="true" spellcheck="false">Prendre soin</div>
          </article>
        </div>
        <div class="shell" data-base="1.34">
          <article class="bubble violet" data-id="violet-engagement">
            <div class="editable" contenteditable="true" spellcheck="false">Engagement
relationnel</div>
          </article>
        </div>
      </div>

      <div class="row" data-base="1.02">
        <div class="shell" data-base="1.28">
          <article class="bubble violet" data-id="violet-protect">
            <div class="editable" contenteditable="true" spellcheck="false">Protéger</div>
          </article>
        </div>
        <div class="shell" data-base="1.02">
          <article class="bubble violet" data-id="violet-support">
            <div class="editable" contenteditable="true" spellcheck="false">Soutenir,
encourager</div>
          </article>
        </div>
      </div>

      <div class="row single-row" data-base="1.18">
        <div class="shell" data-base="1" data-single-width=".92">
          <article class="bubble violet" data-id="violet-frame">
            <div class="editable" contenteditable="true" spellcheck="false">Donner un cadre</div>
          </article>
        </div>
      </div>
    </section>

    <section class="sector sector-teal" data-orientation="horizontal" aria-label="Environnement">
      <div class="row top-row" data-base=".88">
        <div class="shell" data-base="1.18">
          <article class="bubble teal" data-id="teal-history">
            <div class="editable" contenteditable="true" spellcheck="false">Histoire et
fonctionnement familial</div>
          </article>
        </div>
        <div class="shell" data-base=".94">
          <article class="bubble teal" data-id="teal-people">
            <div class="editable" contenteditable="true" spellcheck="false">Personnes
ressource</div>
          </article>
        </div>
      </div>

      <div class="row bottom-row" data-base="1.22">
        <div class="shell" data-base="1.02">
          <article class="bubble teal" data-id="teal-home">
            <div class="editable" contenteditable="true" spellcheck="false">Habiter</div>
          </article>
        </div>
        <div class="shell" data-base="1.02">
          <article class="bubble teal" data-id="teal-work">
            <div class="editable" contenteditable="true" spellcheck="false">Activité
professionnelle</div>
          </article>
        </div>
      </div>
    </section>

    <div class="triangle" aria-hidden="true">
      <svg viewBox="0 0 400 330">
        <defs>
          <linearGradient id="triangleFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#fff8da"/>
            <stop offset="1" stop-color="#ffefae"/>
          </linearGradient>
          <path id="rightLabelPath" d="M200 70 L324 278"/>
        </defs>

        <polygon points="200,22 28,304 372,304"
                 fill="url(#triangleFill)"
                 stroke="#efc446"
                 stroke-width="5"/>

        <text x="154" y="170" text-anchor="middle"
              transform="rotate(-59 154 170)"
              font-size="17" font-weight="800" fill="#171a22">
          Développement de l'enfant
        </text>

        <text font-size="23" font-weight="800" fill="#171a22">
          <textPath href="#rightLabelPath" startOffset="55%" text-anchor="middle">
            Rôle parental
          </textPath>
        </text>

        <text x="200" y="286" text-anchor="middle"
              font-size="24" font-weight="800" fill="#171a22">
          Environnement
        </text>

        <circle cx="200" cy="178" r="39"
                fill="#fffdf2" stroke="#efc446" stroke-width="7"/>

        <path d="M145 257
                 C149 222,171 207,200 207
                 C229 207,251 222,255 257 Z"
              fill="#fffdf2"
              stroke="#efc446"
              stroke-width="7"
              stroke-linejoin="round"/>
      </svg>
    </div>

    <div id="measure"></div>
  </main>
</div>
`;

function getTriangleDebug() {
  if (!import.meta.env?.DEV || typeof window === "undefined") {
    return null;
  }

  if (!window.__triangleDebug) {
    window.__triangleDebug = {
      mounts: 0,
      unmounts: 0,
      activeListeners: 0,
      activeResizeObservers: 0,
      activeMutationObservers: 0
    };
  }

  return window.__triangleDebug;
}

export function mountTriangle(
  container,
  {
    actionsContainer,
    graphController,
    graphDocument = null,
    graphAdapter = null,
    getGraphDocument = null
  }
) {
  let disposed = false;
  const animationFrames = new Set();
  const cleanupListeners = [];
  const mutationObservers = [];
  const cleanupSubscriptions = [];
  const cleanupExternalControls = [];
  const debug = getTriangleDebug();

  if (!graphController) {
    throw new Error("mountTriangle requires a graphController.");
  }

  if (debug) {
    debug.mounts += 1;
  }

  container.innerHTML = triangleMarkup;

  const stage = container.querySelector("#stage");
  const sectors = [...container.querySelectorAll(".sector")];
  const bubbles = [...container.querySelectorAll(".bubble")];
  const measure = container.querySelector("#measure");
  const persistenceStatus = container.querySelector("[data-persistence-status]");

  if (!stage || !measure) {
    throw new Error("Triangle markup could not be mounted.");
  }

  function applyGraphState(graphState) {
    bubbles.forEach(bubble => {
      const id = bubble.dataset.id;
      const text = graphState.content.bubbles[id]?.text;

      if (typeof text === "string") {
        bubble.querySelector(".editable").innerText = text;
      }
    });
  }

  function updatePersistenceStatus({ status, dirty }) {
    if (!persistenceStatus) {
      return;
    }

    const visibleStatus =
      status === "saving"
        ? "Saving..."
        : status === "saved" && !dirty
          ? "Saved"
          : status === "error"
            ? "Save failed"
            : "";

    persistenceStatus.textContent = visibleStatus;
    persistenceStatus.dataset.status = status;
  }

  applyGraphState(graphController.getState());
  cleanupSubscriptions.push(
    graphController.subscribe(({ status }) => updatePersistenceStatus(status))
  );

  function scheduleFrame(callback) {
    const frameId = requestAnimationFrame(() => {
      animationFrames.delete(frameId);

      if (!disposed) {
        callback();
      }
    });

    animationFrames.add(frameId);
  }

  function addListener(target, type, listener) {
    target.addEventListener(type, listener);
    if (debug) {
      debug.activeListeners += 1;
    }

    cleanupListeners.push(() => {
      target.removeEventListener(type, listener);
      if (debug) {
        debug.activeListeners -= 1;
      }
    });
  }

  function readEditorText(editor) {
    return (editor.innerText || "").replace(/\r/g, "");
  }

  function updateGraphState(bubble) {
    graphController.setBubbleText(
      bubble.dataset.id,
      readEditorText(bubble.querySelector(".editable"))
    );
  }

  function plainText(editor) {
    return (editor.innerText || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .trimEnd() || " ";
  }

  function copyTypography(editor) {
    const style = getComputedStyle(editor);
    measure.style.fontFamily = style.fontFamily;
    measure.style.fontWeight = style.fontWeight;
    measure.style.lineHeight = style.lineHeight;
  }

  function textDemand(bubble, orientation) {
    const editor = bubble.querySelector(".editable");
    copyTypography(editor);
    const stageWidth = stage.getBoundingClientRect().width;
    const font = Math.max(15, Math.min(26, stageWidth / 55));
    measure.style.fontSize = font + "px";
    measure.style.width = (orientation === "horizontal" ? 280 : 190) + "px";
    measure.textContent = plainText(editor);
    const rect = measure.getBoundingClientRect();
    const explicitLines = plainText(editor).split("\n").length;
    return Math.max(1, rect.height + explicitLines * (orientation === "vertical" ? 10 : 5));
  }

  function initializeBaseDemand() {
    sectors.forEach(sector => {
      const orientation = sector.dataset.orientation;
      sector.querySelectorAll(".bubble").forEach(bubble => {
        if (!bubble.dataset.baseDemand) {
          bubble.dataset.baseDemand = textDemand(bubble, orientation);
        }
      });
    });
  }

  function factorFor(bubble, orientation) {
    const base = Number(bubble.dataset.baseDemand) || 1;
    const current = textDemand(bubble, orientation);
    return Math.max(.55, Math.min(4.2, current / base));
  }

  function layoutSector(sector) {
    const orientation = sector.dataset.orientation;
    const rows = [...sector.querySelectorAll(".row")];

    rows.forEach(row => {
      const shells = [...row.querySelectorAll(".shell")];
      const factors = shells.map(shell =>
        factorFor(shell.querySelector(".bubble"), orientation)
      );

      const average = factors.reduce((a,b) => a+b, 0) / factors.length;
      const rowBase = Number(row.dataset.base) || 1;

      const rowExponent = orientation === "vertical" ? 1.55 : .40;
      row.style.flexGrow = rowBase * Math.pow(average, rowExponent);
      row.style.flexBasis = "0";

      if (row.classList.contains("single-row")) {
        const shell = shells[0];
        const factor = factors[0];
        const baseWidth = Number(shell.dataset.singleWidth) || .92;
        const width = Math.max(.80, Math.min(.995, baseWidth * Math.pow(factor, .24)));
        shell.style.width = (width * 100) + "%";
        shell.style.flexGrow = "0";
        shell.style.flexBasis = "auto";
        return;
      }

      shells.forEach((shell, index) => {
        const base = Number(shell.dataset.base) || 1;
        const exponent = orientation === "horizontal" ? 1.9 : .34;
        shell.style.flexGrow = base * Math.pow(factors[index], exponent);
        shell.style.flexBasis = "0";
      });
    });

    scheduleFrame(() => fitTextInSector(sector));
  }

  function fitTextInSector(sector) {
    const stageWidth = stage.getBoundingClientRect().width;
    const normalFont = Math.max(15, Math.min(26, stageWidth / 55));

    sector.querySelectorAll(".bubble").forEach(bubble => {
      const editor = bubble.querySelector(".editable");
      let font = normalFont;
      editor.style.fontSize = font + "px";

      while (
        font > 11 &&
        (
          editor.scrollHeight > editor.clientHeight + 1 ||
          editor.scrollWidth > editor.clientWidth + 1
        )
      ) {
        font -= .5;
        editor.style.fontSize = font + "px";
      }
    });
  }

  function relayoutEverything() {
    sectors.forEach(layoutSector);
  }

  function editOccurred(bubble) {
    const sector = bubble.closest(".sector");
    updateGraphState(bubble);
    scheduleFrame(() => {
      layoutSector(sector);
    });
  }

  bubbles.forEach(bubble => {
    const editor = bubble.querySelector(".editable");
    const handleEdit = () => editOccurred(bubble);
    const handlePaste = event => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
      editOccurred(bubble);
    };

    addListener(editor, "input", handleEdit);
    addListener(editor, "keyup", handleEdit);
    addListener(editor, "cut", handleEdit);
    addListener(editor, "paste", handlePaste);

    const observer = new MutationObserver(() => editOccurred(bubble));
    observer.observe(editor, {
      childList:true,
      characterData:true,
      subtree:true
    });
    if (debug) {
      debug.activeMutationObservers += 1;
    }
    mutationObservers.push(observer);
  });

  initializeBaseDemand();
  relayoutEverything();
  cleanupExternalControls.push(
    mountExportControl({
      container: actionsContainer,
      graphController,
      graphDocument,
      graphAdapter,
      getGraphDocument,
      stageElement: stage
    })
  );

  const resizeObserver = new ResizeObserver(() => relayoutEverything());
  resizeObserver.observe(stage);
  if (debug) {
    debug.activeResizeObservers += 1;
  }
  addListener(window, "resize", relayoutEverything);

  return () => {
    if (disposed) {
      return;
    }

    disposed = true;
    if (debug) {
      debug.unmounts += 1;
    }
    cleanupListeners.forEach(cleanup => cleanup());
    cleanupExternalControls.forEach(cleanup => cleanup());
    cleanupSubscriptions.forEach(cleanup => cleanup());
    mutationObservers.forEach(observer => {
      observer.disconnect();
      if (debug) {
        debug.activeMutationObservers -= 1;
      }
    });
    resizeObserver.disconnect();
    if (debug) {
      debug.activeResizeObservers -= 1;
    }
    animationFrames.forEach(frameId => cancelAnimationFrame(frameId));
    animationFrames.clear();
    container.replaceChildren();
  };
}
