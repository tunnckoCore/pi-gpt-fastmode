// @ts-check

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const TARGET_PROVIDER = "openai-codex";
const TARGET_MODEL = "gpt-5.5";
const FAST_SERVICE_TIER = "priority";
const STATUS_ID = "gpt-fastmode";
const KEYBINDING_FIELD = "pi-gpt-fastmode";
const DEFAULT_SHORTCUT = "ctrl+m";

/**
 * @typedef {{ provider?: string; id?: string }} PiModel
 * @typedef {Record<string, unknown>} ProviderPayload
 * @typedef {{ [key: string]: string | string[] | boolean | null | undefined }} KeybindingsConfig
 * @typedef {{ env?: Record<string, string | undefined>; home?: string; exists?: (path: string) => boolean; readFile?: (path: string, encoding: "utf8") => string }} ShortcutLoadOptions
 */

/**
 * True when this request is the GPT-5.5 Codex request this extension knows how to speed up.
 * The payload check makes smoke tests and future provider edge-cases less dependent on ctx.model.
 *
 * @param {PiModel | undefined} model
 * @param {unknown} payload
 */
export function shouldApplyFastMode(model, payload) {
  if (!payload || typeof payload !== "object") return false;

  const requestModel = /** @type {ProviderPayload} */ (payload).model;
  const isTargetRequest = requestModel === TARGET_MODEL;
  const isTargetContext = model?.provider === TARGET_PROVIDER && model?.id === TARGET_MODEL;

  return isTargetRequest && isTargetContext;
}

/**
 * Return a patched provider payload that asks Codex for the Fast service tier.
 *
 * @param {unknown} payload
 */
export function withFastServiceTier(payload) {
  if (!payload || typeof payload !== "object") return payload;
  return {
    .../** @type {ProviderPayload} */ (payload),
    service_tier: FAST_SERVICE_TIER,
  };
}

/**
 * @param {string} input
 * @param {string} home
 */
function expandHome(input, home) {
  if (input === "~") return home;
  if (input.startsWith("~/")) return join(home, input.slice(2));
  return input;
}

/**
 * Resolve the global Pi keybindings file this extension should read.
 * Order: PI_CODING_AGENT_DIR, then XDG config locations if present, then Pi's default.
 *
 * @param {ShortcutLoadOptions} [options]
 */
export function resolveKeybindingsPath(options = {}) {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const exists = options.exists ?? existsSync;

  const piDir = env.PI_CODING_AGENT_DIR?.trim();
  if (piDir) return join(resolve(expandHome(piDir, home)), "keybindings.json");

  const xdgConfigHome = env.XDG_CONFIG_HOME?.trim()
    ? resolve(expandHome(env.XDG_CONFIG_HOME, home))
    : join(home, ".config");

  const xdgCandidates = [
    join(xdgConfigHome, "pi", "agent", "keybindings.json"),
    join(xdgConfigHome, "pi", "keybindings.json"),
  ];

  for (const candidate of xdgCandidates) {
    if (exists(candidate)) return candidate;
  }

  return join(home, ".pi", "agent", "keybindings.json");
}

/**
 * @param {unknown} value
 */
export function normalizeShortcutSetting(value) {
  if (value === false || value === null) return [];

  const values = Array.isArray(value) ? value : [value];
  const shortcuts = values.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);

  return shortcuts.length > 0 ? shortcuts : [DEFAULT_SHORTCUT];
}

/**
 * Read shortcuts from the global Pi keybindings JSON.
 * Uses the field `pi-gpt-fastmode`. Missing or invalid config falls back to ctrl+m.
 * Set the field to false or null to disable the shortcut entirely.
 *
 * @param {ShortcutLoadOptions} [options]
 */
export function loadShortcuts(options = {}) {
  const readFile = options.readFile ?? readFileSync;
  const keybindingsPath = resolveKeybindingsPath(options);

  try {
    const raw = readFile(keybindingsPath, "utf8");
    const parsed = /** @type {KeybindingsConfig} */ (JSON.parse(raw));
    return normalizeShortcutSetting(parsed[KEYBINDING_FIELD]);
  } catch {
    return [DEFAULT_SHORTCUT];
  }
}

/** @param {unknown} ctx */
function isTargetModelContext(ctx) {
  const model = /** @type {{ model?: PiModel }} */ (ctx)?.model;
  return model?.provider === TARGET_PROVIDER && model?.id === TARGET_MODEL;
}

/**
 * @param {unknown} ctx
 * @param {string | undefined} value
 */
function setStatus(ctx, value) {
  const ui = /** @type {{ ui?: { setStatus?: (id: string, value?: string) => void } }} */ (ctx)?.ui;
  ui?.setStatus?.(STATUS_ID, value);
}

/**
 * @param {unknown} ctx
 * @param {string} message
 * @param {"info" | "warning" | "error"} [level]
 */
function notify(ctx, message, level = "info") {
  const ui = /** @type {{ ui?: { notify?: (message: string, level?: string) => void } }} */ (ctx)?.ui;
  ui?.notify?.(message, level);
}

/**
 * @param {unknown} ctx
 * @param {boolean} enabled
 */
function syncStatus(ctx, enabled) {
  setStatus(ctx, enabled ? "fast: on" : undefined);
}

/**
 * @param {unknown} ctx
 * @param {boolean} enabled
 */
function announceState(ctx, enabled) {
  if (!enabled) {
    notify(ctx, "GPT-5.5 Fast mode disabled.");
    return;
  }

  if (isTargetModelContext(ctx)) {
    notify(ctx, "GPT-5.5 Fast mode enabled (service_tier: priority).");
    return;
  }

  notify(
    ctx,
    `GPT-5.5 Fast mode enabled; it will apply when the active model is ${TARGET_PROVIDER}/${TARGET_MODEL}.`,
    "warning",
  );
}

/**
 * Pi extension entry point.
 *
 * @param {import("@earendil-works/pi-coding-agent").ExtensionAPI} pi
 */
export default function fastModeExtension(pi) {
  let enabled = false;

  async function toggle(ctx) {
    enabled = !enabled;
    syncStatus(ctx, enabled);
    announceState(ctx, enabled);
  }

  pi.registerCommand("fast", {
    description: "Toggle GPT-5.5 Codex Fast mode (service_tier: priority)",
    handler: async (_args, ctx) => {
      await toggle(ctx);
    },
  });

  for (const shortcut of loadShortcuts()) {
    pi.registerShortcut(shortcut, {
      description: "Toggle GPT-5.5 Codex Fast mode",
      handler: async (ctx) => {
        await toggle(ctx);
      },
    });
  }

  pi.on("session_start", (_event, ctx) => {
    enabled = false;
    syncStatus(ctx, enabled);
  });

  pi.on("model_select", (_event, ctx) => {
    syncStatus(ctx, enabled);
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!enabled) return undefined;
    if (!shouldApplyFastMode(ctx.model, event.payload)) return undefined;
    return withFastServiceTier(event.payload);
  });
}

export { DEFAULT_SHORTCUT, FAST_SERVICE_TIER, KEYBINDING_FIELD, TARGET_MODEL, TARGET_PROVIDER };
