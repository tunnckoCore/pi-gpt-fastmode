import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fastModeExtension, {
  CONFIG_FIELD,
  DEFAULT_SHORTCUT,
  FAST_SERVICE_TIER,
  KEYBINDING_FIELD,
  RESERVED_SHORTCUTS,
  TARGET_MODEL,
  TARGET_PROVIDER,
  loadDefaultEnabled,
  loadShortcuts,
  normalizeShortcutSetting,
  resolveKeybindingsPath,
  resolvePiFilePath,
  resolveSettingsPath,
  shouldApplyFastMode,
  withFastServiceTier,
} from "../src/index.ts";

type MockCtx = ReturnType<typeof createCtx>;

function createMockPi() {
  const commands = new Map<string, { handler: (args: string, ctx: MockCtx) => Promise<void> | void }>();
  const shortcuts = new Map<string, { handler: (ctx: MockCtx) => Promise<void> | void }>();
  const handlers = new Map<string, (event: any, ctx: MockCtx) => unknown>();

  return {
    commands,
    shortcuts,
    handlers,
    registerCommand(name: string, options: { handler: (args: string, ctx: MockCtx) => Promise<void> | void }) {
      commands.set(name, options);
    },
    registerShortcut(shortcut: string, options: { handler: (ctx: MockCtx) => Promise<void> | void }) {
      shortcuts.set(shortcut, options);
    },
    on(event: string, handler: (event: any, ctx: MockCtx) => unknown) {
      handlers.set(event, handler);
    },
  };
}

function createCtx(model = { provider: TARGET_PROVIDER, id: TARGET_MODEL }) {
  const notifications: Array<{ message: string; level: string }> = [];

  return {
    model,
    notifications,
    ui: {
      notify(message: string, level = "info") {
        notifications.push({ message, level });
      },
    },
  };
}

let previousPiDir: string | undefined;
let previousXdg: string | undefined;

beforeEach(() => {
  previousPiDir = process.env.PI_CODING_AGENT_DIR;
  previousXdg = process.env.XDG_CONFIG_HOME;
});

afterEach(() => {
  if (previousPiDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousPiDir;

  if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = previousXdg;
});

test("patches only supported GPT payloads", () => {
  expect(shouldApplyFastMode({ provider: TARGET_PROVIDER, id: TARGET_MODEL }, { model: TARGET_MODEL })).toBe(true);
  expect(shouldApplyFastMode({ provider: "openai", id: TARGET_MODEL }, { model: TARGET_MODEL })).toBe(true);
  expect(shouldApplyFastMode({ provider: TARGET_PROVIDER, id: "gpt-5.4" }, { model: "gpt-5.4" })).toBe(true);
  expect(shouldApplyFastMode({ provider: TARGET_PROVIDER, id: "gpt-5.4-mini" }, { model: "gpt-5.4-mini" })).toBe(
    true,
  );
  expect(shouldApplyFastMode({ provider: "openai", id: "gpt-5.4-mini" }, { model: "gpt-5.4-mini" })).toBe(true);
  expect(shouldApplyFastMode({ provider: "openai", id: "gpt-5.4-nano" }, { model: "gpt-5.4-nano" })).toBe(false);
  expect(shouldApplyFastMode({ provider: TARGET_PROVIDER, id: "gpt-5.4" }, { model: TARGET_MODEL })).toBe(false);
  expect(withFastServiceTier({ model: TARGET_MODEL, input: [] })).toEqual({
    model: TARGET_MODEL,
    input: [],
    service_tier: FAST_SERVICE_TIER,
  });
});

test("normalizes shortcut settings", () => {
  expect(normalizeShortcutSetting(undefined)).toEqual([DEFAULT_SHORTCUT]);
  expect(normalizeShortcutSetting([DEFAULT_SHORTCUT])).toEqual([DEFAULT_SHORTCUT]);
  expect(normalizeShortcutSetting(` ${DEFAULT_SHORTCUT} `)).toEqual([DEFAULT_SHORTCUT]);
  expect(RESERVED_SHORTCUTS.has("ctrl+m")).toBe(true);
  expect(normalizeShortcutSetting(["ctrl+m", "", "ctrl+alt+m"])).toEqual(["ctrl+alt+m"]);
  expect(normalizeShortcutSetting(["ctrl+m"])).toEqual([]);
  expect(normalizeShortcutSetting([])).toEqual([]);
  expect(normalizeShortcutSetting("ctrl+m")).toEqual([DEFAULT_SHORTCUT]);
  expect(normalizeShortcutSetting("enter")).toEqual([DEFAULT_SHORTCUT]);
  expect(normalizeShortcutSetting(false)).toEqual([]);
  expect(normalizeShortcutSetting(null)).toEqual([]);
});

test("resolves Pi config file paths from env, XDG, then default", () => {
  expect(resolvePiFilePath("settings.json", { env: { PI_CODING_AGENT_DIR: "~/pi-env" }, home: "/home/test" })).toBe(
    "/home/test/pi-env/settings.json",
  );
  expect(resolveKeybindingsPath({ env: { PI_CODING_AGENT_DIR: "~/pi-env" }, home: "/home/test" })).toBe(
    "/home/test/pi-env/keybindings.json",
  );

  expect(
    resolveSettingsPath({
      env: { XDG_CONFIG_HOME: "/xdg" },
      home: "/home/test",
      exists: (path) => path === "/xdg/pi/agent/settings.json",
    }),
  ).toBe("/xdg/pi/agent/settings.json");

  expect(resolveSettingsPath({ env: {}, home: "/home/test", exists: () => false })).toBe(
    "/home/test/.pi/agent/settings.json",
  );
});

test("loads configured shortcuts and toggles payload patching", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-gpt-fast-mode-"));

  try {
    const envDir = join(tempDir, "agent");
    mkdirSync(envDir, { recursive: true });
    writeFileSync(join(envDir, "keybindings.json"), JSON.stringify({ [KEYBINDING_FIELD]: ["ctrl+alt+m"] }), "utf8");
    writeFileSync(join(envDir, "settings.json"), JSON.stringify({ [CONFIG_FIELD]: { enabled: true } }), "utf8");

    expect(loadShortcuts({ env: { PI_CODING_AGENT_DIR: envDir }, home: tempDir })).toEqual(["ctrl+alt+m"]);
    expect(loadShortcuts({ env: { PI_CODING_AGENT_DIR: join(tempDir, "missing") }, home: tempDir })).toEqual([
      DEFAULT_SHORTCUT,
    ]);
    expect(loadDefaultEnabled({ env: { PI_CODING_AGENT_DIR: envDir }, home: tempDir })).toBe(true);
    writeFileSync(join(envDir, "settings.json"), JSON.stringify({ [CONFIG_FIELD]: { enabled: false } }), "utf8");
    expect(loadDefaultEnabled({ env: { PI_CODING_AGENT_DIR: envDir }, home: tempDir })).toBe(false);
    writeFileSync(join(envDir, "settings.json"), JSON.stringify({ [CONFIG_FIELD]: { enabled: true } }), "utf8");
    expect(loadDefaultEnabled({ env: { PI_CODING_AGENT_DIR: join(tempDir, "missing") }, home: tempDir })).toBe(false);

    process.env.PI_CODING_AGENT_DIR = envDir;
    delete process.env.XDG_CONFIG_HOME;

    const pi = createMockPi();
    fastModeExtension(pi as unknown as Parameters<typeof fastModeExtension>[0]);

    expect(pi.commands.has("fast")).toBe(true);
    expect(pi.shortcuts.has("ctrl+alt+m")).toBe(true);
    expect(pi.handlers.has("before_provider_request")).toBe(true);
    expect(pi.handlers.has("session_start")).toBe(true);

    const ctx = createCtx();
    const payloadHook = pi.handlers.get("before_provider_request")!;
    const sessionStart = pi.handlers.get("session_start")!;

    expect(payloadHook({ payload: { model: TARGET_MODEL, store: false } }, ctx)).toEqual({
      model: TARGET_MODEL,
      store: false,
      service_tier: FAST_SERVICE_TIER,
    });

    await pi.commands.get("fast")!.handler("", ctx);
    expect(ctx.notifications.at(-1)?.message).toMatch(/disabled/);
    expect(payloadHook({ payload: { model: TARGET_MODEL } }, ctx)).toBeUndefined();

    sessionStart({}, ctx);
    expect(payloadHook({ payload: { model: TARGET_MODEL, store: false } }, ctx)).toEqual({
      model: TARGET_MODEL,
      store: false,
      service_tier: FAST_SERVICE_TIER,
    });

    await pi.commands.get("fast")!.handler("", ctx);
    expect(ctx.notifications.at(-1)?.message).toMatch(/disabled/);

    await pi.commands.get("fast")!.handler("", ctx);
    expect(ctx.notifications.at(-1)?.message).toMatch(/enabled/);
    expect(payloadHook({ payload: { model: TARGET_MODEL, store: false } }, ctx)).toEqual({
      model: TARGET_MODEL,
      store: false,
      service_tier: FAST_SERVICE_TIER,
    });

    await pi.commands.get("fast")!.handler("", ctx);
    const unsupportedCtx = createCtx({ provider: "anthropic", id: "claude-opus-4-8" });
    await pi.shortcuts.get("ctrl+alt+m")!.handler(unsupportedCtx);
    expect(payloadHook({ payload: { model: "claude-opus-4-8" } }, unsupportedCtx)).toBeUndefined();
    expect(unsupportedCtx.notifications.at(-1)?.level).toBe("warning");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
