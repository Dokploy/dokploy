import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import {
	assertSafeDockerVolumeName,
	assertSafeMigrationToken,
	buildCreateLeafDirectoryCommand,
	buildCreateVolumeCommand,
	buildDirectoryExportCommand,
	buildDirectoryImportCommand,
	buildEnsureParentDirectoryCommand,
	buildReadVolumeMigrationTokenCommand,
	buildVolumeExportCommand,
	buildVolumeImportCommand,
} from "@dokploy/server/utils/migration/commands";
import { describe, expect, it } from "vitest";

const MARK = `/tmp/dokploy_move_cmd_pwned_${process.pid}`;
const TOKEN = "11111111-1111-1111-1111-111111111111";

describe("migration command builders", () => {
	it("builds the expected volume export/import/create/read-token commands", () => {
		expect(buildVolumeExportCommand("myapp-data")).toBe(
			"docker run --rm -i -v myapp-data\\:/from\\:ro busybox tar -cf - -C /from .",
		);
		expect(buildVolumeImportCommand("myapp-data")).toBe(
			"docker run --rm -i -v myapp-data\\:/to busybox tar -xf - -C /to",
		);
		expect(buildCreateVolumeCommand("myapp-data", TOKEN)).toBe(
			`docker volume create --label dokploy.migration.token\\=${TOKEN} myapp-data`,
		);
		expect(buildReadVolumeMigrationTokenCommand("myapp-data")).toBe(
			`docker volume inspect myapp-data --format '{{index .Labels "dokploy.migration.token"}}'`,
		);
	});

	it("builds the expected directory export/import/parent/leaf commands and quotes paths", () => {
		expect(buildDirectoryExportCommand("/etc/dokploy/compose/my-app")).toBe(
			"tar -cf - -C /etc/dokploy/compose/my-app .",
		);
		expect(
			buildEnsureParentDirectoryCommand("/etc/dokploy/compose/my-app"),
		).toBe("mkdir -p /etc/dokploy/compose");
		expect(buildCreateLeafDirectoryCommand("/etc/dokploy/compose/my-app")).toBe(
			"mkdir /etc/dokploy/compose/my-app",
		);
		expect(buildDirectoryImportCommand("/etc/dokploy/compose/my-app")).toBe(
			"tar -xf - -C /etc/dokploy/compose/my-app",
		);
	});

	it("shell-quotes directory paths containing spaces/metacharacters", () => {
		const dangerousPath = "/etc/dokploy/compose/$(touch pwned)";
		const command = buildDirectoryExportCommand(dangerousPath);
		expect(command).not.toBe(`tar -cf - -C ${dangerousPath} .`);
		expect(command).toContain("'/etc/dokploy/compose/$(touch pwned)'");
	});

	it("rejects unsafe/invalid Docker volume names instead of shell-quoting them", () => {
		for (const unsafe of [
			"",
			"../etc/passwd",
			"my volume",
			"vol;rm -rf /",
			"$(touch pwned)",
			"vol`touch pwned`",
		]) {
			expect(() => assertSafeDockerVolumeName(unsafe)).toThrow();
			expect(() => buildVolumeExportCommand(unsafe)).toThrow();
			expect(() => buildVolumeImportCommand(unsafe)).toThrow();
			expect(() => buildCreateVolumeCommand(unsafe, TOKEN)).toThrow();
			expect(() => buildReadVolumeMigrationTokenCommand(unsafe)).toThrow();
		}
	});

	it("accepts valid Docker volume names", () => {
		for (const valid of ["myapp-data", "my_app.data", "Vol123"]) {
			expect(() => assertSafeDockerVolumeName(valid)).not.toThrow();
		}
	});

	it("rejects unsafe/invalid migration tokens", () => {
		for (const unsafe of ["", "abc def", "abc;rm -rf /", "$(touch pwned)"]) {
			expect(() => assertSafeMigrationToken(unsafe)).toThrow();
			expect(() => buildCreateVolumeCommand("myapp-data", unsafe)).toThrow();
		}
	});

	it("does not execute injected commands via an unsafe volume name", () => {
		if (existsSync(MARK)) rmSync(MARK);
		const payload = "$(touch %MARK%)".replace("%MARK%", MARK);
		let command: string | null = null;
		try {
			command = buildVolumeExportCommand(payload);
		} catch {
			// Expected: assertSafeDockerVolumeName should reject this before a
			// command is ever built.
		}
		expect(command).toBeNull();
		if (command) {
			try {
				execSync(command, { shell: "/bin/sh", stdio: "ignore" });
			} catch {}
		}
		expect(existsSync(MARK)).toBe(false);
		if (existsSync(MARK)) rmSync(MARK);
	});

	it("does not execute injected commands via a directory path", () => {
		if (existsSync(MARK)) rmSync(MARK);
		const payload = `/tmp/does-not-exist/$(touch ${MARK})`;
		// `docker`/`tar` are replaced with `:` (a no-op) so only the shell
		// injection surface of the quoted path is exercised.
		const exportCommand = buildDirectoryExportCommand(payload).replace(
			/^tar/,
			":",
		);
		try {
			execSync(exportCommand, { shell: "/bin/sh", stdio: "ignore" });
		} catch {}
		expect(existsSync(MARK)).toBe(false);
		if (existsSync(MARK)) rmSync(MARK);
	});
});
