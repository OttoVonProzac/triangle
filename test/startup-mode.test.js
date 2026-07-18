import assert from "node:assert/strict";
import test from "node:test";
import { isDemoModeLocation } from "../src/startup/startup-mode.js";

test("demo mode is selected explicitly by query parameter", () => {
  assert.equal(
    isDemoModeLocation(new URL("http://127.0.0.1:4174/?demo=1")),
    true
  );
});

test("demo mode is selected for file URLs", () => {
  assert.equal(
    isDemoModeLocation(new URL("file:///C:/Users/meche/dev/triangle/dist/index.html")),
    true
  );
});

test("ordinary hosted URLs are authenticated mode", () => {
  assert.equal(
    isDemoModeLocation(new URL("http://127.0.0.1:4174/")),
    false
  );
});
