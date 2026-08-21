import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	createFile,
	getCreateFileCommand,
} from "@dokploy/server/utils/docker/utils";
import { afterEach, describe, expect, it } from "vitest";

// Regression test for: a File Mount whose File Path contains a "/" (e.g.
// "nginx/nginx.conf.template") was created as an empty directory instead of
// a file. This reliably happens when something else (typically Docker's own
// bind-mount fallback, when the compose service's volumes: declaration
// references the path before any File Mount content exists for it) already
// created an empty directory at that exact path — the old
// mkdir-parent-then-redirect commands never checked for, or cleared, a
// pre-existing directory at the *target* path itself, so the shell
// redirection / fs.writeFileSync failed (silently, for updateFileMount).
const appName = `file-mount-nested-directory-${process.pid}`;
const baseFilesPath = join(
	process.cwd(),
	".docker",
	"compose",
	appName,
	"files",
);

afterEach(() =>
	rmSync(join(process.cwd(), ".docker", "compose", appName), {
		force: true,
		recursive: true,
	}),
);

describe("getCreateFileCommand", () => {
	it("writes a nested file even when a stale empty directory already occupies the path", () => {
		const filePath = "nginx/nginx.conf.template";
		const fullPath = join(baseFilesPath, filePath);
		mkdirSync(fullPath, { recursive: true }); // simulate Docker's bind-mount fallback
		expect(statSync(fullPath).isDirectory()).toBe(true);

		const command = getCreateFileCommand(
			baseFilesPath,
			filePath,
			"user nginx;\n",
		);
		execFileSync("bash", ["-c", command]);

		expect(statSync(fullPath).isFile()).toBe(true);
		expect(readFileSync(fullPath, "utf8")).toBe("user nginx;\n");
	});

	it("still creates a nested file normally when nothing occupies the path yet", () => {
		const filePath = "ssrf_proxy/squid.conf.template";
		const fullPath = join(baseFilesPath, filePath);
		expect(existsSync(fullPath)).toBe(false);

		const command = getCreateFileCommand(baseFilesPath, filePath, "acl all\n");
		execFileSync("bash", ["-c", command]);

		expect(statSync(fullPath).isFile()).toBe(true);
		expect(readFileSync(fullPath, "utf8")).toBe("acl all\n");
	});

	it("refuses a filePath that escapes the base files directory", () => {
		expect(() =>
			getCreateFileCommand(baseFilesPath, "../../etc/cron.d/evil", "x"),
		).toThrow(/resolves outside/);
	});

	it("does not destroy a populated directory sitting at the target path", () => {
		const filePath = "nginx/conf.d";
		const fullPath = join(baseFilesPath, filePath);
		const survivingFile = join(fullPath, "important-existing-file.conf");
		mkdirSync(fullPath, { recursive: true });
		writeFileSync(survivingFile, "do not delete me\n");

		const command = getCreateFileCommand(baseFilesPath, filePath, "x");
		expect(() => execFileSync("bash", ["-c", command])).toThrow();

		// the pre-existing directory and its contents must survive the failed write
		expect(statSync(fullPath).isDirectory()).toBe(true);
		expect(readFileSync(survivingFile, "utf8")).toBe("do not delete me\n");
	});
});

describe("createFile", () => {
	it("writes a nested file even when a stale empty directory already occupies the path", async () => {
		const filePath = "sandbox/conf/config.yaml";
		const fullPath = join(baseFilesPath, filePath);
		mkdirSync(fullPath, { recursive: true }); // simulate Docker's bind-mount fallback
		expect(statSync(fullPath).isDirectory()).toBe(true);

		await createFile(baseFilesPath, filePath, "app:\n  port: 8194\n");

		expect(statSync(fullPath).isFile()).toBe(true);
		expect(readFileSync(fullPath, "utf8")).toBe("app:\n  port: 8194\n");
	});

	it("refuses a filePath that escapes the base files directory", async () => {
		await expect(
			createFile(baseFilesPath, "../../etc/cron.d/evil", "x"),
		).rejects.toThrow(/resolves outside/);
	});

	it("does not destroy a populated directory sitting at the target path", async () => {
		const filePath = "nginx/conf.d";
		const fullPath = join(baseFilesPath, filePath);
		const survivingFile = join(fullPath, "important-existing-file.conf");
		mkdirSync(fullPath, { recursive: true });
		writeFileSync(survivingFile, "do not delete me\n");

		await expect(createFile(baseFilesPath, filePath, "x")).rejects.toThrow();

		// the pre-existing directory and its contents must survive the failed write
		expect(statSync(fullPath).isDirectory()).toBe(true);
		expect(readFileSync(survivingFile, "utf8")).toBe("do not delete me\n");
	});
});
