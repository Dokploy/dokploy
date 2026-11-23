import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	caddyFilePath,
	saveCaddyFile,
} from "@dokploy/server/utils/caddy/files";
import {
	ExecError,
	execAsyncRemote,
	writeFileRemote,
} from "@dokploy/server/utils/process/execAsync";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (original) => ({
	...(await original<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	writeFileRemote: vi.fn(),
}));
vi.mock("@dokploy/server/services/web-server-settings", async (original) => ({
	...(await original<
		typeof import("@dokploy/server/services/web-server-settings")
	>()),
	getWebServerSettings: vi.fn(),
	getWebServerProvider: vi.fn(async () => "caddy"),
}));

const SERVER = "remote";
const root = paths(true).MAIN_CADDY_PATH;
const traefikRoot = paths(true).MAIN_TRAEFIK_PATH;
let caddyAccepts: boolean;
let written: Record<string, string>;

beforeEach(() => {
	vi.clearAllMocks();
	caddyAccepts = true;
	written = {};
	vi.mocked(db.query.domains.findMany).mockResolvedValue([]);
	vi.mocked(writeFileRemote).mockImplementation(async (_, file, content) => {
		written[file] = content;
	});
	vi.mocked(execAsyncRemote).mockImplementation(async (_, command) => {
		if (command.startsWith("cat ")) {
			return {
				stdout: written[command.slice(4)] ?? "previous content",
				stderr: "",
			};
		}
		if (command.includes("caddy reload") && !caddyAccepts) {
			throw new ExecError("failed", {
				command,
				stderr: "log line\nError: sites/custom.caddy:1: unrecognized directive",
			});
		}
		return { stdout: "", stderr: "" };
	});
});

it("opens the Caddyfile and the files in global/ and sites/, nothing else", () => {
	for (const name of [
		"Caddyfile",
		"global/custom.caddy",
		"sites/my-site.caddy",
	]) {
		expect(caddyFilePath(`${root}/${name}`, SERVER)).toBe(`${root}/${name}`);
	}
	for (const path of [
		`${root}/data/caddy/certificates/x/x.key`,
		`${root}/config/caddy/autosave.json`,
		`${root}/sites/../data/x.caddy`,
		`${root}/sites/nested/x.caddy`,
		`${root}/sites/x.txt`,
		`${root}-backup/sites/x.caddy`,
		`${root}/Caddyfile.check`,
		"sites/x.caddy",
	]) {
		expect(() => caddyFilePath(path, SERVER)).toThrow("can be opened here");
	}
	// However a path is spelled, it is the file it resolves to that counts.
	expect(caddyFilePath(`${root}/data/../sites/x.caddy`, SERVER)).toBe(
		`${root}/sites/x.caddy`,
	);
	expect(() =>
		caddyFilePath(`${traefikRoot}/../caddy/data/x.key`, SERVER),
	).toThrow("can be opened here");
});

it("puts the previous content back when Caddy rejects a save", async () => {
	const file = `${root}/sites/custom.caddy`;
	caddyAccepts = false;
	await expect(saveCaddyFile(file, "broken", SERVER)).rejects.toThrow(
		"Error: sites/custom.caddy:1: unrecognized directive",
	);
	expect(written[file]).toBe("previous content");
	caddyAccepts = true;
	await saveCaddyFile(file, "mine.test {\n}", SERVER);
	expect(written[file]).toBe("mine.test {\n}");
	await expect(saveCaddyFile(`${root}/Caddyfile`, "x", SERVER)).rejects.toThrow(
		"regenerates",
	);
});
