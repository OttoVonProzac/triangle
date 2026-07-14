/**
 * @typedef {Object} ProtectedClient
 * @property {(context: {
 *   container: HTMLElement,
 *   session: Object,
 *   auth: import("../auth/auth-controller.js").AuthController
 * }) => void | Promise<void>} mount
 * @property {(() => void | Promise<void>)=} unmount
 */

/**
 * @param {unknown} client
 * @returns {asserts client is ProtectedClient}
 */
export function assertProtectedClient(client) {
  if (!client || typeof client !== "object" || typeof client.mount !== "function") {
    throw new Error("Protected client must provide a mount(context) function.");
  }
}

