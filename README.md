# ikno Obsidian Exporter

Obsidian plugin that logs markdown file changes in your vault to a local folder, so the [ikno](https://ikno.charemma.de) CLI can reconstruct what you worked on during the day.

It is a passive companion to ikno: no UI, no telemetry, no network. Everything lives inside the vault under `.ikno/` and syncs with whatever you already use (Obsidian Sync, Syncthing, iCloud, Git).

## What it records

For every `.md` file in your vault the plugin writes one NDJSON line per change to `.ikno/log/YYYY-MM-DD.ndjson`:

- `created` with the full content of the new file
- `modified` with a unified diff against the previously known state
- `deleted` with the last known content
- `renamed` with old and new path

A shadow copy of the current markdown state lives in `.ikno/.current/` and is used as the baseline for diffs. It is an implementation detail and should not be edited by hand.

## What it does not record

- Non-markdown files (images, PDFs, canvas, Excalidraw, etc.)
- Files under `.ikno/` itself
- Files under `.obsidian/`
- Anything that matches an entry in `exclude_patterns` (see config)

## Config

On first load the plugin creates `.ikno/config.json` with defaults:

```json
{
  "version": 1,
  "retention_days": 30,
  "exclude_patterns": ["*.excalidraw.md"]
}
```

- `retention_days` -- log files older than this are pruned on plugin load
- `exclude_patterns` -- simple glob patterns matched against the full path or file name

There is intentionally no settings tab. Edit `config.json` and reload Obsidian.

## Install

### Via BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. Add `charemma/obsidian-ikno-exporter` as a beta plugin.
3. Enable "ikno Obsidian Exporter" in Obsidian's community plugins list.

### Manual

1. Run `npm install && npm run build` in this repo.
2. Copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/ikno-obsidian-exporter/`.
3. Enable "ikno Obsidian Exporter" in Obsidian's community plugins list.

## Build

```
npm install
npm run build
```

The build produces `main.js` in the repo root next to `manifest.json`.

## Mobile

The plugin sets `isDesktopOnly: false` and only uses Obsidian's vault adapter, so it also runs on iOS and Android.

## License

Apache 2.0
