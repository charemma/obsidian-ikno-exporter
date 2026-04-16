import {
	Plugin,
	TAbstractFile,
	TFile,
	Notice,
	normalizePath,
} from "obsidian";
import { createPatch } from "diff";

const IKNO_DIR = ".ikno";
const LOG_DIR = `${IKNO_DIR}/log`;
const CURRENT_DIR = `${IKNO_DIR}/.current`;
const CONFIG_PATH = `${IKNO_DIR}/config.json`;

type Action = "created" | "modified" | "deleted" | "renamed";

interface LogEntry {
	ts: string;
	path: string;
	action: Action;
	diff?: string;
	content?: string;
	from?: string;
	to?: string;
}

interface IknoConfig {
	version: number;
	retention_days: number;
	exclude_patterns: string[];
}

const DEFAULT_CONFIG: IknoConfig = {
	version: 1,
	retention_days: 30,
	exclude_patterns: ["*.excalidraw.md"],
};

export default class IknoHelperPlugin extends Plugin {
	config: IknoConfig = DEFAULT_CONFIG;

	async onload() {
		await this.ensureDirs();
		await this.loadConfig();
		await this.pruneOldLogs();

		// Defer event registration until the vault finished its initial scan, so
		// the flood of "modify" events on startup does not get logged.
		this.app.workspace.onLayoutReady(() => {
			this.registerVaultEvents();
		});
	}

	onunload() {
		// Nothing to clean up -- all listeners are managed by registerEvent.
	}

	private registerVaultEvents() {
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				void this.handleCreate(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				void this.handleModify(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				void this.handleDelete(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				void this.handleRename(file, oldPath);
			}),
		);
	}

	// --- Event handlers ---------------------------------------------------

	private async handleCreate(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;
		if (!this.shouldTrack(file.path)) return;

		const content = await this.app.vault.read(file);
		await this.writeCurrent(file.path, content);
		await this.appendLog({
			ts: nowIso(),
			path: file.path,
			action: "created",
			content,
		});
	}

	private async handleModify(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;
		if (!this.shouldTrack(file.path)) return;

		const content = await this.app.vault.read(file);
		const previous = await this.readCurrent(file.path);

		if (previous === content) return;

		const diff = createPatch(
			file.path,
			previous ?? "",
			content,
			"",
			"",
			{ context: 3 },
		);
		await this.writeCurrent(file.path, content);
		await this.appendLog({
			ts: nowIso(),
			path: file.path,
			action: "modified",
			diff,
		});
	}

	private async handleDelete(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;
		if (!this.shouldTrack(file.path)) return;

		const previous = await this.readCurrent(file.path);
		await this.removeCurrent(file.path);
		await this.appendLog({
			ts: nowIso(),
			path: file.path,
			action: "deleted",
			content: previous ?? "",
		});
	}

	private async handleRename(file: TAbstractFile, oldPath: string) {
		if (!(file instanceof TFile)) return;
		// Only track if either side is a markdown file we care about.
		const oldTracked = this.shouldTrack(oldPath);
		const newTracked = this.shouldTrack(file.path);
		if (!oldTracked && !newTracked) return;

		if (oldTracked) {
			await this.removeCurrent(oldPath);
		}
		if (newTracked) {
			try {
				const content = await this.app.vault.read(file);
				await this.writeCurrent(file.path, content);
			} catch (err) {
				console.warn("ikno-helper: could not snapshot renamed file", err);
			}
		}

		await this.appendLog({
			ts: nowIso(),
			path: file.path,
			action: "renamed",
			from: oldPath,
			to: file.path,
		});
	}

	// --- Tracking rules ---------------------------------------------------

	private shouldTrack(path: string): boolean {
		if (!path) return false;
		if (path.startsWith(`${IKNO_DIR}/`) || path === IKNO_DIR) return false;
		if (path.startsWith(".obsidian/") || path === ".obsidian") return false;
		if (!path.toLowerCase().endsWith(".md")) return false;

		for (const pattern of this.config.exclude_patterns ?? []) {
			if (matchesGlob(path, pattern)) return false;
		}
		return true;
	}

	// --- Config -----------------------------------------------------------

	private async loadConfig() {
		const adapter = this.app.vault.adapter;
		if (await adapter.exists(CONFIG_PATH)) {
			try {
				const raw = await adapter.read(CONFIG_PATH);
				const parsed = JSON.parse(raw) as Partial<IknoConfig>;
				this.config = { ...DEFAULT_CONFIG, ...parsed };
				return;
			} catch (err) {
				console.warn("ikno-helper: failed to read config, using defaults", err);
				new Notice("ikno-helper: config.json is invalid, using defaults");
			}
		}
		await adapter.write(
			CONFIG_PATH,
			JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
		);
		this.config = DEFAULT_CONFIG;
	}

	// --- Storage helpers --------------------------------------------------

	private async ensureDirs() {
		const adapter = this.app.vault.adapter;
		for (const dir of [IKNO_DIR, LOG_DIR, CURRENT_DIR]) {
			if (!(await adapter.exists(dir))) {
				await adapter.mkdir(dir);
			}
		}
	}

	private currentPath(path: string): string {
		return normalizePath(`${CURRENT_DIR}/${path}`);
	}

	private async writeCurrent(path: string, content: string) {
		const target = this.currentPath(path);
		await this.ensureParentDir(target);
		await this.app.vault.adapter.write(target, content);
	}

	private async readCurrent(path: string): Promise<string | null> {
		const target = this.currentPath(path);
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(target))) return null;
		try {
			return await adapter.read(target);
		} catch (err) {
			console.warn("ikno-helper: could not read current snapshot", err);
			return null;
		}
	}

	private async removeCurrent(path: string) {
		const target = this.currentPath(path);
		const adapter = this.app.vault.adapter;
		if (await adapter.exists(target)) {
			try {
				await adapter.remove(target);
			} catch (err) {
				console.warn("ikno-helper: could not remove current snapshot", err);
			}
		}
	}

	private async ensureParentDir(path: string) {
		const adapter = this.app.vault.adapter;
		const parts = path.split("/");
		parts.pop();
		if (parts.length === 0) return;
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await adapter.exists(current))) {
				await adapter.mkdir(current);
			}
		}
	}

	// --- Logging ----------------------------------------------------------

	private async appendLog(entry: LogEntry) {
		const file = logFileForDate(new Date(entry.ts));
		const adapter = this.app.vault.adapter;
		await this.ensureParentDir(file);
		const line = JSON.stringify(entry) + "\n";
		try {
			if (await adapter.exists(file)) {
				const existing = await adapter.read(file);
				await adapter.write(file, existing + line);
			} else {
				await adapter.write(file, line);
			}
		} catch (err) {
			console.error("ikno-helper: failed to append log entry", err);
		}
	}

	// --- Retention --------------------------------------------------------

	private async pruneOldLogs() {
		const days = this.config.retention_days;
		if (!days || days <= 0) return;

		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(LOG_DIR))) return;

		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
		const listing = await adapter.list(LOG_DIR);
		for (const file of listing.files) {
			const name = file.split("/").pop() ?? "";
			const match = name.match(/^(\d{4}-\d{2}-\d{2})\.ndjson$/);
			if (!match) continue;
			const day = new Date(`${match[1]}T00:00:00Z`).getTime();
			if (Number.isNaN(day)) continue;
			if (day < cutoff) {
				try {
					await adapter.remove(file);
				} catch (err) {
					console.warn("ikno-helper: failed to remove old log", file, err);
				}
			}
		}
	}
}

// --- Helpers ------------------------------------------------------------

function nowIso(): string {
	return new Date().toISOString();
}

function logFileForDate(date: Date): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	return `${LOG_DIR}/${y}-${m}-${d}.ndjson`;
}

function matchesGlob(path: string, pattern: string): boolean {
	const regex = new RegExp(
		"^" +
			pattern
				.split("")
				.map((ch) => {
					if (ch === "*") return ".*";
					if (ch === "?") return ".";
					if (/[.+^${}()|[\]\\]/.test(ch)) return "\\" + ch;
					return ch;
				})
				.join("") +
			"$",
	);
	if (regex.test(path)) return true;
	const base = path.split("/").pop() ?? "";
	return regex.test(base);
}
