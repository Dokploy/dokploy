import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getWebServerBackupFilters } from "@dokploy/server/utils/backups/web-server-filters";
import { afterEach, describe, expect, it } from "vitest";

const hasRsync = (() => {
	try {
		execSync("rsync --version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

let root: string | undefined;
afterEach(() => {
	if (root) rmSync(root, { recursive: true, force: true });
	root = undefined;
});

const backedUpFiles = (files: string[], dropAppNames: string[]) => {
	root = mkdtempSync(join(tmpdir(), "web-server-filters-"));
	const src = join(root, "src");
	const dst = join(root, "dst");
	mkdirSync(dst);
	for (const file of files) {
		mkdirSync(dirname(join(src, file)), { recursive: true });
		writeFileSync(join(src, file), "x");
	}
	const filters = getWebServerBackupFilters(dropAppNames).join(" ");
	execSync(`rsync -a ${filters} ${src}/ ${dst}/`);
	return execSync("find . -type f", { cwd: dst })
		.toString()
		.trim()
		.split("\n")
		.map((file) => file.replace(/^\.\//, ""))
		.sort();
};

describe("getWebServerBackupFilters", () => {
	it("puts drop-app includes before the code/ excludes", () => {
		expect(getWebServerBackupFilters(["site-abc"])).toEqual([
			"--include=applications/site-abc/code/\\*\\*\\*",
			"--exclude='applications/*/code/'",
			"--exclude='compose/*/code/'",
		]);
	});

	it.skipIf(!hasRsync)(
		"skips git checkouts but keeps drop uploads and service files",
		() => {
			const files = backedUpFiles(
				[
					"applications/git-app/code/.git/HEAD",
					"applications/git-app/code/src/index.ts",
					"applications/git-app/files/config.yml",
					"applications/drop-app/code/index.html",
					"compose/stack/code/docker-compose.yml",
					"compose/stack/files/config.yml",
					"traefik/traefik.yml",
				],
				["drop-app"],
			);

			expect(files).toEqual([
				"applications/drop-app/code/index.html",
				"applications/git-app/files/config.yml",
				"compose/stack/files/config.yml",
				"traefik/traefik.yml",
			]);
		},
	);
});
