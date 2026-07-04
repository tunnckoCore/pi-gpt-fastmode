import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fastModeExtension, {
  DEFAULT_SHORTCUT,
  FAST_SERVICE_TIER,
  KEYBINDING_FIELD,
  TARGET_MODEL,
  TARGET_PROVIDER,
  loadShortcuts,
  normalizeShortcutSetting,
  resolveKeybindingsPath,
  shouldApplyFastMode,
  withFastServiceTier,
} from "../extensions/fast-mode.js";

function createMockPi() {
  const commands = new Map();
  const shortcuts = new Map();
  const handlers = new Map();

  return {
    commands,
    shortcuts,
    handlers,
    registerCommand(name, options) {
      commands.set(name, options);
    },
    registerShortcut(shortcut, options) {
      shortcuts.set(shortcut, options);
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
  };
}

function createCtx(model = { provider: TARGET_PROVIDER, id: TARGET_MODEL }) {
  const notifications = [];
  const statuses = [];

  return {
    model,
    notifications,
    statuses,
    ui: {
      notify(message, level = "info") {
        notifications.push({ message, level });
      },
      setStatus(id, value) {
        statuses.push({ id, value });
      },
    },
  };
}

assert.equal(shouldApplyFastMode({ provider: TARGET_PROVIDER, id: TARGET_MODEL }, { model: TARGET_MODEL }), true);
assert.equal(shouldApplyFastMode({ provider: "openai", id: TARGET_MODEL }, { model: TARGET_MODEL }), false);
assert.equal(shouldApplyFastMode({ provider: TARGET_PROVIDER, id: "gpt-5.4" }, { model: "gpt-5.4" }), false);
assert.deepEqual(withFastServiceTier({ model: TARGET_MODEL, input: [] }), {
  model: TARGET_MODEL,
  input: [],
  service_tier: FAST_SERVICE_TIER,
});

assert.deepEqual(normalizeShortcutSetting(undefined), [DEFAULT_SHORTCUT]);
assert.deepEqual(normalizeShortcutSetting(` ${DEFAULT_SHORTCUT} `), [DEFAULT_SHORTCUT]);
assert.deepEqual(normalizeShortcutSetting(["ctrl+m", "", "ctrl+alt+m"]), ["ctrl+m", "ctrl+alt+m"]);
assert.deepEqual(normalizeShortcutSetting(false), []);
assert.deepEqual(normalizeShortcutSetting(null), []);

assert.equal(
  resolveKeybindingsPath({ env: { PI_CODING_AGENT_DIR: "~/pi-env" }, home: "/home/test" }),
  "/home/test/pi-env/keybindings.json",
);
assert.equal(
  resolveKeybindingsPath({
    env: { XDG_CONFIG_HOME: "/xdg" },
    home: "/home/test",
    exists: (path) => path === "/xdg/pi/agent/keybindings.json",
  }),
  "/xdg/pi/agent/keybindings.json",
);
assert.equal(
  resolveKeybindingsPath({ env: {}, home: "/home/test", exists: () => false }),
  "/home/test/.pi/agent/keybindings.json",
);

const tmp = mkdtempSync(join(tmpdir(), "pi-gpt-fastmode-"));
try {
  const envDir = join(tmp, "agent");
  mkdirSync(envDir, { recursive: true });
  writeFileSync(join(envDir, "keybindings.json"), JSON.stringify({ [KEYBINDING_FIELD]: "ctrl+alt+m" }), "utf8");

  assert.deepEqual(loadShortcuts({ env: { PI_CODING_AGENT_DIR: envDir }, home: tmp }), ["ctrl+alt+m"]);
  assert.deepEqual(loadShortcuts({ env: { PI_CODING_AGENT_DIR: join(tmp, "missing") }, home: tmp }), [DEFAULT_SHORTCUT]);

  const previousPiDir = process.env.PI_CODING_AGENT_DIR;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.PI_CODING_AGENT_DIR = envDir;
  delete process.env.XDG_CONFIG_HOME;

  try {
    const pi = createMockPi();
    fastModeExtension(pi);

    assert.ok(pi.commands.has("fast"), "registers /fast command");
    assert.ok(pi.shortcuts.has("ctrl+alt+m"), "registers configured shortcut");
    assert.ok(pi.handlers.has("before_provider_request"), "registers payload hook");

    const ctx = createCtx();
    const payloadHook = pi.handlers.get("before_provider_request");

    assert.equal(payloadHook({ payload: { model: TARGET_MODEL } }, ctx), undefined, "default is off");

    await pi.commands.get("fast").handler("", ctx);
    assert.equal(ctx.statuses.at(-1).value, "fast: on");
    assert.match(ctx.notifications.at(-1).message, /enabled/);
    assert.deepEqual(payloadHook({ payload: { model: TARGET_MODEL, store: false } }, ctx), {
      model: TARGET_MODEL,
      store: false,
      service_tier: FAST_SERVICE_TIER,
    });

    await pi.commands.get("fast").handler("", ctx);
    assert.equal(ctx.statuses.at(-1).value, undefined);
    assert.match(ctx.notifications.at(-1).message, /disabled/);
    assert.equal(payloadHook({ payload: { model: TARGET_MODEL } }, ctx), undefined, "second toggle disables");

    const unsupportedCtx = createCtx({ provider: "openai", id: TARGET_MODEL });
    await pi.shortcuts.get("ctrl+alt+m").handler(unsupportedCtx);
    assert.equal(payloadHook({ payload: { model: TARGET_MODEL } }, unsupportedCtx), undefined, "does not patch other providers");
    assert.equal(unsupportedCtx.notifications.at(-1).level, "warning");
  } finally {
    if (previousPiDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousPiDir;

    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log("smoke ok");
