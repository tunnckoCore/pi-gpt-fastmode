# @tunnckocore/pi-gpt-fast-mode

Fast mode for supported GPT-5.4 / GPT-5.5 models in Pi - one file, easy to review. No ceremony.

This package adds one command:

```text
/fast
```

Run it once and supported GPT requests get `service_tier: "priority"`.
Run it again and they stop.

Default is off. As it should be.

## What it actually does

Pi already lets you lower reasoning with things like `:low`. That is not the same thing as Codex CLI Fast mode.

Codex Fast mode is a service tier. This extension patches the provider payload before the request leaves Pi:

```json
{
  "service_tier": "priority"
}
```

It only applies when the active model is one of:

```text
openai/gpt-5.4
openai/gpt-5.4-mini
openai/gpt-5.5
openai-codex/gpt-5.4
openai-codex/gpt-5.4-mini
openai-codex/gpt-5.5
```

Other models are left alone. No weird surprise bill multiplier on a random provider.

## Install

From GitHub:

```bash
pi install git:github.com/tunnckoCore/pi-gpt-fast-mode
```

Try it without installing:

```bash
pi --no-extensions -e git:github.com/tunnckoCore/pi-gpt-fast-mode
```

Or from a local checkout:

```bash
pi -e ./pi-gpt-fast-mode
```

or npm

```bash
pi install npm:@tunnckocore/pi-gpt-fast-mode
```

## Use

Inside Pi:

```text
/fast
```

Toggle it off the same way:

```text
/fast
```

## Default state

Fast mode starts off by default.

To start every session with Fast mode on, add this to Pi's global settings file:

```json
{
  "pi-gpt-fast-mode": {
    "enabled": true
  }
}
```

Set `enabled` to `false` or remove the block to start disabled again. The `/fast` command still toggles either way.

The extension looks for that file in this order:

1. `$PI_CODING_AGENT_DIR/settings.json`
2. `$XDG_CONFIG_HOME/pi/agent/settings.json`
3. `$XDG_CONFIG_HOME/pi/settings.json`
4. `~/.pi/agent/settings.json`

If `XDG_CONFIG_HOME` is unset, it tries `~/.config` for the XDG paths.

## Keybinding setting

The default shortcut is `ctrl+alt+m`, which avoids Pi's built-in defaults.

To change it, add this field to Pi's global keybindings file. The value should be an array:

```json
{
  "pi-gpt-fast-mode": ["ctrl+alt+m"]
}
```

Multiple shortcuts work too:

```json
{
  "pi-gpt-fast-mode": ["ctrl+alt+m", "ctrl+shift+m"]
}
```

Set it to an empty array to disable the shortcut:

```json
{
  "pi-gpt-fast-mode": []
}
```

`ctrl+m`, `enter`, and `return` are ignored because many terminals encode Enter as `ctrl+m`.

The extension looks for that file in this order:

1. `$PI_CODING_AGENT_DIR/keybindings.json`
2. `$XDG_CONFIG_HOME/pi/agent/keybindings.json`
3. `$XDG_CONFIG_HOME/pi/keybindings.json`
4. `~/.pi/agent/keybindings.json`

If `XDG_CONFIG_HOME` is unset, it tries `~/.config` for the XDG paths.

## Caveats

This is a payload patch, not first-class Pi core support.

So yes: it asks Codex for the Fast service tier. But Pi's own pricing display may not perfectly explain the increased usage if the upstream response does not report the tier back clearly.

The request is the part that matters.

## Test

```bash
bun run test
```

The test mocks the Pi extension API and checks the only things worth checking here:

- default is off
- `/fast` turns it on
- `/fast` turns it off
- only supported GPT-5.4 / GPT-5.5 models get patched
- keybinding config is loaded

No fake testing theater. Just enough net under the wire.
