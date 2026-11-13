import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEnvFileCommand } from "@dokploy/server/utils/builders/utils";
import { afterEach, describe, expect, it } from "vitest";

// The generated .env holds the app's secrets, so it must be readable by its
// owner only (0600), not world-readable under the default umask (0644).
const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

const mode = (path: string) => statSync(path).mode & 0o777;

describe("generated .env file permissions", () => {
	it("creates the .env readable by its owner only", () => {
		const root = mkdtempSync(join(tmpdir(), "dokploy-env-"));
		dirs.push(root);
		const code = join(root, "code");
		mkdirSync(code);

		execFileSync("sh", ["-c", `umask 022; ${createEnvFileCommand(code, "SECRET=value")}`]);

		expect(mode(join(root, ".env"))).toBe(0o600);
	});

	it("tightens an existing world-readable .env on the next deploy", () => {
		const root = mkdtempSync(join(tmpdir(), "dokploy-env-"));
		dirs.push(root);
		const code = join(root, "code");
		mkdirSync(code);
		writeFileSync(join(root, ".env"), "OLD=1\n", { mode: 0o644 });

		execFileSync("sh", ["-c", createEnvFileCommand(code, "SECRET=value")]);

		expect(mode(join(root, ".env"))).toBe(0o600);
	});
});
