import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseTokenVerifier } from "../server/auth/verify-supabase-token.js";

const USER_ID = "33333333-3333-4333-8333-333333333333";

test("Supabase verifier prefers getClaims sub claim", async () => {
  let getClaimsCalled = false;
  let getUserCalled = false;
  const verifier = createSupabaseTokenVerifier({
    supabaseClient: {
      auth: {
        async getClaims(token) {
          getClaimsCalled = token === "token";
          return {
            data: {
              claims: {
                sub: USER_ID
              }
            },
            error: null
          };
        },
        async getUser() {
          getUserCalled = true;
          return { data: null, error: new Error("should not be called") };
        }
      }
    }
  });

  const result = await verifier("token");

  assert.equal(getClaimsCalled, true);
  assert.equal(getUserCalled, false);
  assert.equal(result.userId, USER_ID);
  assert.equal(result.method, "getClaims");
});

test("Supabase verifier falls back to getUser when getClaims cannot verify", async () => {
  let getUserCalled = false;
  const verifier = createSupabaseTokenVerifier({
    supabaseClient: {
      auth: {
        async getClaims() {
          return {
            data: null,
            error: new Error("jwks unavailable")
          };
        },
        async getUser(token) {
          getUserCalled = token === "token";
          return {
            data: {
              user: {
                id: USER_ID
              }
            },
            error: null
          };
        }
      }
    }
  });

  const result = await verifier("token");

  assert.equal(getUserCalled, true);
  assert.equal(result.userId, USER_ID);
  assert.equal(result.method, "getUser");
});
