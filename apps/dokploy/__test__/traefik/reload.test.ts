import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dynamicDir: "" }));

vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({ DYNAMIC_TRAEFIK_PATH: state.dynamicDir }),
}));

const { getRemoteTraefikReloadCommand, reloadTraefikDynamicConfig } =
	await import("@dokploy/server/utils/traefik/reload");

const OLD = new Date("2020-01-01T00:00:00Z");

let root: string;

const snapshot = (dir: string) =>
	fs
		.readdirSync(dir, { recursive: true, encoding: "utf8" })
		.sort()
		.map((name) => {
			const full = path.join(dir, name);
			const stat = fs.lstatSync(full);
			return {
				name,
				isFile: stat.isFile(),
				content: stat.isFile() ? fs.readFileSync(full, "utf8") : null,
				mtimeMs: stat.mtimeMs,
			};
		});

const makeDynamicDir = (name = "dynamic") => {
	const dir = path.join(root, name);
	fs.mkdirSync(path.join(dir, "certificates", "certificate-abc"), {
		recursive: true,
	});
	fs.writeFileSync(path.join(dir, "middlewares.yml"), "http: {}\n");
	fs.writeFileSync(
		path.join(dir, "certificates", "certificate-abc", "certificate.yml"),
		"tls: {}\n",
	);
	for (const entry of [
		"certificates/certificate-abc/certificate.yml",
		"certificates/certificate-abc",
		"certificates",
		"middlewares.yml",
		".",
	]) {
		fs.utimesSync(path.join(dir, entry), OLD, OLD);
	}
	return dir;
};

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "traefik-reload-"));
	state.dynamicDir = makeDynamicDir();
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe("reloadTraefikDynamicConfig", () => {
	it("bumps the dynamic directory's mtime, the change Traefik's watcher reacts to", () => {
		reloadTraefikDynamicConfig();

		expect(fs.statSync(state.dynamicDir).mtimeMs).toBeGreaterThan(
			OLD.getTime(),
		);
	});

	it("does not create, change or remove anything inside the directory", () => {
		const before = snapshot(state.dynamicDir);

		reloadTraefikDynamicConfig();

		expect(snapshot(state.dynamicDir)).toEqual(before);
	});

	it("logs instead of throwing, and creates nothing, when the directory is missing", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		state.dynamicDir = path.join(root, "missing");

		expect(() => reloadTraefikDynamicConfig()).not.toThrow();
		expect(consoleError).toHaveBeenCalled();
		expect(fs.existsSync(state.dynamicDir)).toBe(false);
	});
});

const shells = ["sh", "bash"].filter((shell) => {
	try {
		execFileSync(shell, ["-c", "true"]);
		return true;
	} catch {
		return false;
	}
});

describe.skipIf(process.platform === "win32" || shells.length === 0)(
	"getRemoteTraefikReloadCommand",
	() => {
		const run = (shell: string, command: string, env = process.env) =>
			execFileSync(shell, ["-c", command], { cwd: root, env });

		describe.each(shells)("under %s", (shell) => {
			it("bumps the directory's mtime without touching anything inside it", () => {
				const before = snapshot(state.dynamicDir);

				run(shell, getRemoteTraefikReloadCommand(state.dynamicDir));

				expect(fs.statSync(state.dynamicDir).mtimeMs).toBeGreaterThan(
					OLD.getTime(),
				);
				expect(snapshot(state.dynamicDir)).toEqual(before);
			});

			it("succeeds without creating anything when the directory is missing", () => {
				const missing = path.join(root, "missing");

				run(shell, getRemoteTraefikReloadCommand(missing));

				expect(fs.existsSync(missing)).toBe(false);
			});

			it("succeeds when touch itself fails, so it never fails the command it ends", () => {
				const fakeBin = path.join(root, "bin");
				fs.mkdirSync(fakeBin);
				fs.writeFileSync(path.join(fakeBin, "touch"), "#!/bin/sh\nexit 1\n", {
					mode: 0o755,
				});

				expect(() =>
					run(shell, getRemoteTraefikReloadCommand(state.dynamicDir), {
						...process.env,
						PATH: `${fakeBin}:${process.env.PATH}`,
					}),
				).not.toThrow();
			});

			it("does not run when an earlier step in an && chain fails", () => {
				expect(() =>
					run(
						shell,
						`false && ${getRemoteTraefikReloadCommand(state.dynamicDir)}`,
					),
				).toThrow();
				expect(fs.statSync(state.dynamicDir).mtimeMs).toBe(OLD.getTime());
			});

			it("quotes the path so a crafted directory name cannot run commands", () => {
				const crafted = makeDynamicDir(
					"dyn $(touch pwned) `touch pwned2`; touch pwned3",
				);

				run(shell, getRemoteTraefikReloadCommand(crafted));

				expect(fs.existsSync(path.join(root, "pwned"))).toBe(false);
				expect(fs.existsSync(path.join(root, "pwned2"))).toBe(false);
				expect(fs.existsSync(path.join(root, "pwned3"))).toBe(false);
				expect(fs.statSync(crafted).mtimeMs).toBeGreaterThan(OLD.getTime());
			});
		});
	},
);
