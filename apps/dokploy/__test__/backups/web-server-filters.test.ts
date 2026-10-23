import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { WEB_SERVER_BACKUP_EXCLUDES } from "@dokploy/server/utils/backups/web-server-filters";
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

const backedUpFiles = (files: string[]) => {
	root = mkdtempSync(join(tmpdir(), "web-server-filters-"));
	const src = join(root, "src");
	const dst = join(root, "dst");
	mkdirSync(dst);
	for (const file of files) {
		mkdirSync(dirname(join(src, file)), { recursive: true });
		writeFileSync(join(src, file), "x");
	}
	execSync(`rsync -a ${WEB_SERVER_BACKUP_EXCLUDES.join(" ")} ${src}/ ${dst}/`);
	return execSync("find . -type f", { cwd: dst })
		.toString()
		.trim()
		.split("\n")
		.map((file) => file.replace(/^\.\//, ""))
		.sort();
};

describe("WEB_SERVER_BACKUP_EXCLUDES", () => {
	it.skipIf(!hasRsync)(
		"skips cloned .git history but keeps working trees and bind-mounted data",
		() => {
			const files = backedUpFiles([
				"applications/git-app/code/.git/HEAD",
				"applications/git-app/code/.git/objects/pack/big.pack",
				"applications/git-app/code/src/index.ts",
				"applications/drop-app/code/index.html",
				"compose/stack/code/.git/HEAD",
				"compose/stack/code/docker-compose.yml",
				"compose/stack/code/data/PG_VERSION",
				"compose/stack/files/config.yml",
				"traefik/traefik.yml",
			]);

			expect(files).toEqual([
				"applications/drop-app/code/index.html",
				"applications/git-app/code/src/index.ts",
				"compose/stack/code/data/PG_VERSION",
				"compose/stack/code/docker-compose.yml",
				"compose/stack/files/config.yml",
				"traefik/traefik.yml",
			]);
		},
	);
});
