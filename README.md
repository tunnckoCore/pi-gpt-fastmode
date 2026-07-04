# pi-gpt-fastmode

Fast mode for GPT-5.5 in Pi. No ceremony.

This package adds one command:

```text
/fast
```

Run it once and GPT-5.5 Codex requests get `service_tier: "priority"`.
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

It only applies when the active model is:

```text
openai-codex/gpt-5.5
```

Other models are left alone. No weird surprise bill multiplier on a random provider.

## Install

From GitHub:

```bash
pi install git:github.com/tunnckoCore/pi-gpt-fastmode
```

Try it without installing:

```bash
pi --no-extensions -e git:github.com/tunnckoCore/pi-gpt-fastmode
```

Or from a local checkout:

```bash
pi -e ./pi-gpt-fastmode
```

## Use

Inside Pi:

```text
/fast
```

You will see a status item when it is on:

```text
fast: on
```

Toggle it off the same way:

```text
/fast
```

## Keybinding setting

The default shortcut is `ctrl+m`.

To change it, add this field to Pi's global keybindings file:

```json
{
  "pi-gpt-fastmode": "ctrl+m"
}
```

You can also use an array:

```json
{
  "pi-gpt-fastmode": ["ctrl+m", "ctrl+alt+m"]
}
```

Set it to `false` or `null` to disable the shortcut.

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

## Smoke test

```bash
npm test
```

The tests mock the Pi extension API and check the only things worth checking here:

- default is off
- `/fast` turns it on
- `/fast` turns it off
- only `openai-codex/gpt-5.5` gets patched
- keybinding config is loaded

No fake testing theater. Just enough net under the wire.
