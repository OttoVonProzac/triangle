function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function graphShellMarkup({
  indicatorText = "",
  includeLogout = false
} = {}) {
  const indicator = indicatorText
    ? `<p class="demo-mode-indicator">${escapeHtml(indicatorText)}</p>`
    : "";
  const logout = includeLogout
    ? `
        <button class="auth-logout" type="button" data-auth-logout>
          Log out
        </button>
      `
    : "";

  return `
    <main class="auth-shell auth-shell--authenticated app-shell">
      <section class="auth-shell__client graph-region" aria-label="Triangle graph workspace"></section>
      <aside class="auth-shell__sidebar workspace-sidebar" aria-label="Triangle controls">
        ${indicator}
        <div class="auth-shell__client-actions"></div>
        ${logout}
      </aside>
    </main>
  `;
}

export function graphShellElements(root) {
  return {
    actionsContainer: root.querySelector(".auth-shell__client-actions"),
    clientContainer: root.querySelector(".auth-shell__client"),
    logoutButton: root.querySelector("[data-auth-logout]"),
    sidebar: root.querySelector(".auth-shell__sidebar")
  };
}
