import "../triangle/triangle.css";
import { mountTriangle } from "../triangle/triangle.js";

let unmountTriangle = null;

export const triangleClient = {
  mount({ container }) {
    if (unmountTriangle) {
      unmountTriangle();
    }

    unmountTriangle = mountTriangle(container);
  },

  unmount() {
    if (unmountTriangle) {
      unmountTriangle();
      unmountTriangle = null;
    }
  }
};

