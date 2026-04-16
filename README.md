# ikno Obsidian Exporter

**This plugin only makes sense if you use the [ikno](https://ikno.charemma.de) CLI.** On its own, it does nothing useful for you -- it just writes log files.

## What it does

ikno is a command-line tool that reconstructs your workday from traces you already leave behind (git commits, notes, AI sessions). For Obsidian vaults, ikno needs to know what you wrote and when.

Without this plugin, ikno can only see that a file was modified -- not what changed. With this plugin, every save in your vault is logged with a timestamp and a diff. ikno reads these logs and turns them into a readable recap.

## How it works

```
1. You write in Obsidian
       |
       v
2. Plugin logs the change to .ikno/log/YYYY-MM-DD.ndjson inside your vault
       |
       v
3. Obsidian Sync / Syncthing / iCloud syncs .ikno/ to your other devices
       |
       v
4. You run "ikno recap" on your main machine
       |
       v
5. ikno reads the logs and generates a workday summary
```

The log is a plain text NDJSON file in your vault. You can inspect it, delete it, or back it up like any other vault content.

## What gets logged

For every `.md` file in your vault the plugin writes one line per change to `.ikno/log/YYYY-MM-DD.ndjson`:

- `created` -- full content of the new file
- `modified` -- a unified diff against the previously known state
- `deleted` -- the last known content before deletion
- `renamed` -- old and new path

Skipped: non-markdown files (images, PDFs, canvas), `.obsidian/`, `.ikno/` itself, anything matched by `exclude_patterns`.

A shadow copy of the current state lives in `.ikno/.current/` and is used only to compute diffs. Do not edit it by hand.

## Why not just use file modification times?

Because mtime tells you a file was touched, not what changed. If you write "Added feature X" in your daily note at 10am and "Fixed bug Y" at 3pm, ikno only knows "the file was modified today". With this plugin, ikno can see both entries with timestamps.

## Privacy and sync

- Everything stays in your vault. No network, no telemetry.
- The log syncs with whatever you already use (Obsidian Sync, Syncthing, iCloud, Git).
- You can delete `.ikno/` at any time. The plugin will rebuild it on next save.

## Config

On first load the plugin creates `.ikno/config.json`:

```json
{
  "version": 1,
  "retention_days": 30,
  "exclude_patterns": ["*.excalidraw.md"]
}
```

- `retention_days` -- old logs are deleted after this many days
- `exclude_patterns` -- glob patterns of files to skip

Edit `config.json` and reload Obsidian to apply changes.

## Install

### Via BRAT (recommended for now)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. Add `charemma/obsidian-ikno-exporter` as a beta plugin.
3. Enable "ikno Obsidian Exporter" in Obsidian's community plugins list.

### Manual

1. `npm install && npm run build` in this repo.
2. Copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/ikno-obsidian-exporter/`.
3. Enable "ikno Obsidian Exporter" in Obsidian's community plugins list.

## Mobile

Works on iOS and Android. Writes logs the same way as on desktop.

## License

Apache 2.0
