const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  React = require("react");
const { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, resolve) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: resolve,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    fetch: (...args) => resolve("fetch")(...args),
    console,
  });
  return mod.exports;
}
function harness(responseFor) {
  let listener,
    tree,
    selected = { uid: "new", email: "student@iiitkottayam.ac.in" },
    popupError = null;
  const current = { uid: "old", email: "wrong@gmail.com" };
  const user = (value) =>
    value ? { ...value, getIdToken: async () => `token-${value.uid}` } : null;
  const prompts = [],
    requests = [];
  let popups = 0,
    signouts = 0;
  const auth = load("src/context/authContext.tsx", (name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return require("react/jsx-runtime");
    if (name === "firebase/auth")
      return {
        onAuthStateChanged: (_, callback) => {
          listener = callback;
          callback(user(current));
          return () => {};
        },
        signInWithPopup: async () => {
          popups++;
          if (popupError) throw popupError;
          listener(user(selected));
          return { user: user(selected) };
        },
        signOut: async () => {
          signouts++;
          listener(null);
        },
      };
    if (name.includes("lib/firebase"))
      return {
        auth: {},
        googleProvider: { setCustomParameters: (p) => prompts.push(p) },
      };
    throw new Error("Unexpected auth import " + name);
  });
  const gate = load("src/components/ConsentGate.tsx", (name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return require("react/jsx-runtime");
    if (name.includes("authContext")) return auth;
    if (name === "next/link")
      return { default: (props) => React.createElement("a", props) };
    if (name.endsWith(".css")) return {};
    if (name === "fetch")
      return async (url, options) => {
        requests.push(options);
        const result = await responseFor(
          options.headers.Authorization,
          requests.length,
          options,
        );
        return {
          ok: result.status === 200,
          status: result.status,
          json: async () => result.body,
        };
      };
    throw new Error("Unexpected gate import " + name);
  }).default;
  const text = (node) =>
    typeof node === "string" ? node : node?.children?.map(text).join("") || "";
  function button(label) {
    return tree.root
      .findAllByType("button")
      .find((node) => text(node) === label);
  }
  return {
    async mount() {
      await act(async () => {
        tree = create(
          React.createElement(
            auth.AuthProvider,
            null,
            React.createElement(
              gate,
              null,
              React.createElement(
                "div",
                { "data-protected": true },
                "Camera check",
              ),
            ),
          ),
        );
      });
    },
    async click(label) {
      assert.ok(button(label), `Missing action: ${label}`);
      await act(async () => {
        await button(label).props.onClick();
      });
    },
    has: (label) => !!button(label),
    get text() {
      return text(tree.root);
    },
    get protected() {
      return (
        tree.root.findAll((node) => node.props["data-protected"] === true)
          .length > 0
      );
    },
    get popups() {
      return popups;
    },
    get signouts() {
      return signouts;
    },
    prompts,
    requests,
    select(value) {
      selected = value;
    },
    failPopup(error) {
      popupError = error;
    },
    async close() {
      await act(async () => tree.unmount());
    },
  };
}
const blocked = {
  status: 403,
  body: {
    error: "Only IIIT Kottayam accounts are allowed",
    code: "ACCOUNT_NOT_ALLOWED",
  },
};
test("a rejected saved account offers a real chooser and switches to an allowed account", async () => {
  const h = harness((token) =>
    token === "Bearer token-old"
      ? blocked
      : { status: 200, body: { accepted: true, version: "2026-11-08" } },
  );
  await h.mount();
  assert.match(h.text, /wrong@gmail.com/);
  assert.match(h.text, /Only IIIT Kottayam/);
  assert.equal(h.has("Retry checking"), false);
  assert.equal(h.protected, false);
  await h.click("Choose another account");
  assert.equal(h.popups, 1);
  assert.equal(h.prompts[0].prompt, "select_account");
  assert.equal(h.protected, true);
  assert.equal(
    h.signouts,
    0,
    "popup opens directly from the click without awaiting sign-out",
  );
  await h.close();
});
test("sign out clears the rejected account and provides a fresh sign-in action", async () => {
  const h = harness(() => blocked);
  await h.mount();
  await h.click("Sign out");
  assert.equal(h.signouts, 1);
  assert.equal(h.has("Sign in with Google"), true);
  assert.ok(!h.text.includes("wrong@gmail.com"));
  assert.equal(h.protected, false);
  await h.close();
});
test("choosing the same saved account rechecks access after eligibility changes", async () => {
  const h = harness((_, attempt) =>
    attempt === 1
      ? blocked
      : { status: 200, body: { accepted: true, version: "2026-11-08" } },
  );
  await h.mount();
  h.select({ uid: "old", email: "wrong@gmail.com" });
  await h.click("Choose another account");
  assert.equal(h.popups, 1);
  assert.ok(h.requests.length >= 2);
  assert.equal(h.protected, true);
  await h.close();
});
test("temporary server failures have a useful retry that checks again and shows agreement", async () => {
  const h = harness((_, attempt) =>
    attempt === 1
      ? { status: 503, body: { error: "Unavailable" } }
      : { status: 200, body: { accepted: false, version: "2026-11-08" } },
  );
  await h.mount();
  assert.equal(h.has("Retry checking"), true);
  await h.click("Retry checking");
  assert.equal(h.requests.length, 2);
  assert.match(h.text, /I am at least 18/);
  assert.equal(h.protected, false);
  await h.close();
});
test("cancelling the chooser retains the current account and leaves recovery usable", async () => {
  const h = harness(() => blocked);
  await h.mount();
  h.failPopup({ code: "auth/popup-closed-by-user" });
  await h.click("Choose another account");
  assert.match(h.text, /selection was cancelled/);
  assert.equal(h.has("Choose another account"), true);
  assert.equal(h.has("Sign out"), true);
  assert.equal(h.protected, false);
  await h.close();
});
