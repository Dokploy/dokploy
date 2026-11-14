import { readFileSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, execPath } from "node:process";
import { generateApplyPatchesCommand } from "@dokploy/server/services/patch";
import {
	type ComposeNested,
	getBuildComposeCommand,
	getCreateEnvFileCommand,
	getExportEnvCommand,
} from "@dokploy/server/utils/builders/compose";
import {
	getEnvironmentVariablesObject,
	prepareEnvironmentVariables,
	prepareEnvironmentVariablesForFile,
} from "@dokploy/server/utils/docker/utils";
import { createContentStaging } from "@dokploy/server/utils/filesystem/write-content";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { getCreateComposeFileCommand } from "@dokploy/server/utils/providers/raw";
import { quote } from "shell-quote";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	root: "",
	patches: [] as {
		enabled: boolean;
		type: string;
		filePath: string;
		content: string;
	}[],
}));
vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({
		BASE_PATH: state.root,
		COMPOSE_PATH: join(state.root, "compose"),
		APPLICATIONS_PATH: join(state.root, "apps"),
	}),
}));
vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: async () => ({ appName: "probe" }),
}));
vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: async () => ({ appName: "probe" }),
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: async () => ({
		name: "fixture",
		organizationId: "org",
		telemetryProviderIds: ["p"],
		sshKeyId: "key",
		ipAddress: "127.0.0.1",
		port: Number(env.STREAM_CONTENT_SSH_PORT || 2226),
		username: "dokployer",
		sshKey: {
			privateKey: env.STREAM_CONTENT_SSH_KEY
				? readFileSync(env.STREAM_CONTENT_SSH_KEY, "utf8")
				: "unused",
		},
	}),
}));
vi.mock("@dokploy/server/db", () => ({
	db: { query: { patch: { findMany: async () => state.patches } } },
}));

let staging: ReturnType<typeof createContentStaging>;
const codePath = (type = "compose") =>
	join(state.root, type === "compose" ? "compose" : "apps", "probe", "code");
const compose = (overrides = {}) =>
	({
		appName: "probe",
		composeId: "probe",
		serverId: null,
		composeType: "docker-compose",
		sourceType: "raw",
		composePath: "docker-compose.yml",
		composeFile: "services: {}\n",
		env: "",
		randomize: false,
		createEnvFile: false,
		mounts: [],
		domains: [],
		environment: { env: "", project: { env: "" } },
		...overrides,
	}) as unknown as ComposeNested;

beforeEach(async () => {
	state.root = await mkdtemp(
		join(env.STREAM_CONTENT_ROOT || tmpdir(), "compose-stream-"),
	);
	state.patches = [];
	staging = createContentStaging(null);
	await mkdir(codePath(), { recursive: true });
	await mkdir(codePath("application"), { recursive: true });
});
afterEach(async () => {
	await staging.cleanup();
	await rm(state.root, { recursive: true, force: true });
});

const legacyEnv = (value: ComposeNested) => {
	let text = `APP_NAME=${value.appName}\nCOMPOSE_PROJECT_NAME=${value.appName}\n${value.env || ""}`;
	if (!text.includes("DOCKER_CONFIG")) text += "\nDOCKER_CONFIG=/root/.docker";
	if (value.randomize) text += `\nCOMPOSE_PREFIX=${value.suffix}`;
	const prepare =
		value.composeType === "stack"
			? prepareEnvironmentVariables
			: prepareEnvironmentVariablesForFile;
	return prepare(
		text,
		value.environment.project.env,
		value.environment.env,
	).join("\n");
};

describe("streamed Compose content", () => {
	it.each([
		"",
		"services: {}\n# é🙂\n",
		`services: {}\n# ${"synthetic".repeat(21000)}`,
	])(
		"writes raw source exactly after replacing the code directory (case %#)",
		async (content) => {
			await writeFile(join(codePath(), "old"), "old checkout");
			const command = await getCreateComposeFileCommand(
				compose({ composeFile: content }),
				staging,
			);
			expect(Buffer.byteLength(command)).toBeLessThan(4096);
			if (content) expect(command).not.toContain(content);
			expect(command).not.toContain("base64");
			await execAsync(command);
			expect(await readFile(join(codePath(), "docker-compose.yml"))).toEqual(
				Buffer.from(content),
			);
			expect(await readdir(codePath())).toEqual(["docker-compose.yml"]);
			await staging.cleanup();
			expect(await readdir(join(state.root, ".staging"))).toEqual([]);
		},
	);

	it.each(["docker-compose", "stack"])(
		"writes byte-identical legacy .env files for %s",
		async (composeType) => {
			for (const env of [
				"",
				'UNICODE=é🙂\nDOLLAR=\'pa$$word\'\nQUOTE="it\'s a test"\nMULTI="line1\nline2"\nEQUALS=a=b=c',
			]) {
				const value = compose({
					composeType,
					env,
					randomize: true,
					suffix: "suffix",
					environment: {
						project: { env: "PROJECT=project" },
						env: "SHARED=shared",
					},
				});
				const command = await getCreateEnvFileCommand(value, staging);
				await execAsync(command);
				const expected = legacyEnv(value);
				const legacyPath = join(state.root, "legacy.env");
				await execAsync(
					`echo "${Buffer.from(expected).toString("base64")}" | base64 -d > ${quote([legacyPath])}`,
				);
				expect(await readFile(join(codePath(), ".env"))).toEqual(
					await readFile(legacyPath),
				);
			}
		},
	);

	it("writes a 160 KiB env file with a bounded command", async () => {
		const value = compose({ env: `BLOB=${"synthetic".repeat(21000)}` });
		const command = await getCreateEnvFileCommand(value, staging);
		expect(Buffer.byteLength(command)).toBeLessThan(4096);
		expect(command).not.toContain("synthetic");
		await execAsync(command);
		expect(await readFile(join(codePath(), ".env"), "utf8")).toBe(
			legacyEnv(value),
		);
	});

	it.each([
		"",
		"PATH=/custom/bin",
		"HOME=/custom/home",
		"PATH=/custom/bin\nHOME=/custom/home",
	])(
		"preserves stack exports identically to the legacy env invocation (overrides=%s)",
		async (overrides) => {
			const value = compose({
				composeType: "stack",
				env: `QUOTE="it's quoted"\nDOUBLE='say "hello"'\nDOLLAR='pa$$word'\nBACKTICK='\`literal\`'\nNEWLINE="line1\nline2"\nEQUALS=a=b=c\nUNICODE=é🙂\nDOT.KEY=dot\nDASH-KEY=dash\nUID=1000\nRANDOM=literal\nDUPLICATE=first\nDUPLICATE=last\n${overrides}`,
				environment: {
					project: { env: "PROJECT=project" },
					env: "SHARED=shared",
				},
			});
			const exports = await getExportEnvCommand(value, staging);
			const original = Object.entries(
				getEnvironmentVariablesObject(
					value.env,
					value.environment.project.env,
					value.environment.env,
				),
			)
				.map(([key, value]) => `${key}=${quote([value])}`)
				.join(" ");
			const dump = `${quote([execPath])} -e ${quote(["process.stdout.write(JSON.stringify({env:process.env,args:process.argv.slice(1)}))"])} ${quote(["first argument", "last=argument"])}`;
			const before = await execAsync(
				`env -i PATH="$PATH" HOME="$HOME" ${original} ${dump}`,
			);
			const after = await execAsync(
				`env -i PATH="$PATH" HOME="$HOME" ${exports} ${dump}`,
			);
			expect(JSON.parse(after.stdout)).toEqual(JSON.parse(before.stdout));
			const actual = JSON.parse(after.stdout);
			expect(actual.env["DOT.KEY"]).toBe("dot");
			expect(actual.env["DASH-KEY"]).toBe("dash");
			expect(actual.env.UID).toBe("1000");
			expect(actual.env.RANDOM).toBe("literal");
			expect(actual.env.BACKTICK).toBe("`literal`");
			expect(actual.env.DOUBLE).toBe('say "hello"');
			expect(actual.env.DUPLICATE).toBe("last");
			expect(actual.args).toEqual(["first argument", "last=argument"]);
			const shellDump = "/bin/sh -c '/usr/bin/env'";
			const shellBefore = await execAsync(
				`env -i PATH="$PATH" HOME="$HOME" ${original} ${shellDump}`,
			);
			const shellAfter = await execAsync(
				`env -i PATH="$PATH" HOME="$HOME" ${exports} ${shellDump}`,
			);
			expect(shellAfter.stdout.split("\n").sort()).toEqual(
				shellBefore.stdout.split("\n").sort(),
			);
			expect(exports).not.toContain("pa$$word");
		},
	);

	it("loads 160 KiB of stack env even with createEnvFile=false", async () => {
		const env = Array.from(
			{ length: 900 },
			(_, i) => `V${i}=${"synthetic".repeat(24)}`,
		).join("\n");
		expect(Buffer.byteLength(env)).toBeGreaterThan(160 * 1024);
		const value = compose({ composeType: "stack", createEnvFile: false, env });
		const exports = await getExportEnvCommand(value, staging);
		expect(Buffer.byteLength(exports)).toBeLessThan(4096);
		expect(exports).not.toContain("synthetic");
		const { stdout } = await execAsync(
			`env -i PATH="$PATH" HOME="$HOME" ${exports} ${quote([execPath])} -e ${quote(["process.stdout.write(JSON.stringify(process.env))"])}`,
		);
		const actual = JSON.parse(stdout);
		for (let i = 0; i < 900; i++)
			expect(actual[`V${i}`]).toBe("synthetic".repeat(24));
		expect(actual.PWD).toBeUndefined();
		expect(await readdir(codePath())).not.toContain(".env");
	});

	it("does not stage empty stack exports or non-stack env", async () => {
		const exports = await getExportEnvCommand(
			compose({ composeType: "stack" }),
			staging,
		);
		expect(exports).toBe("");
		const dump = `${quote([execPath])} -e ${quote(["process.stdout.write(JSON.stringify(process.env))"])}`;
		const before = await execAsync(`env -i PATH="$PATH" HOME="$HOME" ${dump}`);
		const after = await execAsync(
			`env -i PATH="$PATH" HOME="$HOME" ${exports} ${dump}`,
		);
		expect(after.stdout).toBe(before.stdout);
		expect(
			await getExportEnvCommand(compose({ env: "KEY=value" }), staging),
		).toBe("");
		expect(await readdir(state.root)).not.toContain(".staging");
	});

	it("cleans staged content if execution aborts before a write", async () => {
		const command = await getCreateComposeFileCommand(compose(), staging);
		try {
			await expect(execAsync(`exit 1; ${command}`)).rejects.toMatchObject({
				exitCode: 1,
			});
		} finally {
			await staging.cleanup();
		}
		expect(await readdir(join(state.root, ".staging"))).toEqual([]);
	});

	it("fails before Docker when an env write fails inside an OR group", async () => {
		const command = await getBuildComposeCommand(
			compose({ createEnvFile: true, env: "KEY=value" }),
			staging,
		);
		await rm(codePath(), { recursive: true });
		const marker = join(state.root, "DOCKER_CALLED");
		const bin = join(state.root, "bin");
		await mkdir(bin);
		await writeFile(
			join(bin, "docker"),
			`#!/bin/sh\ntouch ${quote([marker])}\n`,
			{ mode: 0o755 },
		);
		try {
			await expect(
				execAsync(`PATH=${quote([bin])}:"$PATH"; ${command}`),
			).rejects.toMatchObject({ exitCode: 1 });
		} finally {
			await staging.cleanup();
		}
		await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readdir(join(state.root, ".staging"))).toEqual([]);
	});
});

describe("streamed patches", () => {
	it.each(["compose", "application"] as const)(
		"keeps byte-exact contents, deletes and order for %s",
		async (type) => {
			const content = "é🙂 synthetic patch\n".repeat(10000);
			state.patches = [
				{ enabled: true, type: "modify", filePath: "nested/large", content },
				{ enabled: true, type: "create", filePath: "empty", content: "" },
				{
					enabled: true,
					type: "create",
					filePath: "ordered",
					content: "first",
				},
				{ enabled: true, type: "delete", filePath: "ordered", content: "" },
				{
					enabled: true,
					type: "create",
					filePath: "ordered",
					content: "last\n",
				},
				{ enabled: true, type: "delete", filePath: "removed", content: "" },
				{
					enabled: false,
					type: "create",
					filePath: "disabled",
					content: "disabled",
				},
			];
			const command = await generateApplyPatchesCommand({
				id: "probe",
				type,
				serverId: null,
				staging,
			});
			expect(Buffer.byteLength(command)).toBeLessThan(10000);
			expect(command).not.toContain("synthetic patch");
			await execAsync(
				`rm -rf ${quote([codePath(type)])}; mkdir -p ${quote([codePath(type)])}; touch ${quote([join(codePath(type), "removed")])}; ${command}`,
			);
			expect(
				await readFile(join(codePath(type), "nested", "large"), "utf8"),
			).toBe(content);
			expect(await readFile(join(codePath(type), "empty"), "utf8")).toBe("");
			expect(await readFile(join(codePath(type), "ordered"), "utf8")).toBe(
				"last\n",
			);
			expect((await readdir(codePath(type))).sort()).toEqual([
				"empty",
				"nested",
				"ordered",
			]);
		},
	);

	it("returns an empty command without staging when no patches are enabled", async () => {
		state.patches = [
			{
				enabled: false,
				type: "create",
				filePath: "disabled",
				content: "secret",
			},
		];
		expect(
			await generateApplyPatchesCommand({
				id: "probe",
				type: "compose",
				serverId: null,
				staging,
			}),
		).toBe("");
		expect(await readdir(state.root)).not.toContain(".staging");
	});

	it("cleans earlier staged patches when a later path is invalid", async () => {
		state.patches = [
			{ enabled: true, type: "create", filePath: "valid", content: "secret" },
			{
				enabled: true,
				type: "create",
				filePath: "../../outside",
				content: "secret",
			},
		];
		try {
			await expect(
				generateApplyPatchesCommand({
					id: "probe",
					type: "compose",
					serverId: null,
					staging,
				}),
			).rejects.toThrow("escapes the code directory");
		} finally {
			await staging.cleanup();
		}
		expect(await readdir(join(state.root, ".staging"))).toEqual([]);
	});

	it("checks symlinks at execution time, after staging", async () => {
		state.patches = [
			{
				enabled: true,
				type: "create",
				filePath: "nested/file",
				content: "secret",
			},
		];
		const command = await generateApplyPatchesCommand({
			id: "probe",
			type: "compose",
			serverId: null,
			staging,
		});
		const outside = join(state.root, "outside");
		await mkdir(outside);
		await symlink(outside, join(codePath(), "nested"));
		await expect(execAsync(command)).rejects.toMatchObject({
			exitCode: 1,
			stderr: expect.stringContaining("escapes its base directory"),
		});
		expect(await readdir(outside)).toEqual([]);
	});

	it("stops on a failed mkdir before later patches or Docker", async () => {
		state.patches = [
			{
				enabled: true,
				type: "create",
				filePath: "blocked/file",
				content: "secret",
			},
			{
				enabled: true,
				type: "create",
				filePath: "later",
				content: "must not run",
			},
		];
		await writeFile(join(codePath(), "blocked"), "not a directory");
		const command = await generateApplyPatchesCommand({
			id: "probe",
			type: "compose",
			serverId: null,
			staging,
		});
		await expect(
			execAsync(
				`{ ${command}\ntouch ${quote([join(codePath(), "docker")])}; } || true`,
			),
		).rejects.toMatchObject({ exitCode: 1 });
		expect(await readdir(codePath())).toEqual(["blocked"]);
	});

	it.skipIf(!env.STREAM_CONTENT_SSH_KEY)(
		"streams large raw Compose source over SFTP-disabled SSH",
		async () => {
			const remoteStaging = createContentStaging("fixture");
			const content = "synthetic-remote-🙂\n".repeat(9000);
			try {
				const command = await getCreateComposeFileCommand(
					compose({ serverId: "fixture", composeFile: content }),
					remoteStaging,
				);
				expect(Buffer.byteLength(command)).toBeLessThan(4096);
				expect(command).not.toContain("synthetic-remote-");
				await execAsyncRemote("fixture", command);
			} finally {
				await remoteStaging.cleanup();
			}
			expect(await readFile(join(codePath(), "docker-compose.yml"))).toEqual(
				Buffer.from(content),
			);
			expect(await readdir(join(state.root, ".staging"))).toEqual([]);
		},
	);

	it.skipIf(!env.STREAM_CONTENT_SSH_KEY)(
		"streams large Compose .env and ordered patches over SFTP-disabled SSH",
		async () => {
			const remoteStaging = createContentStaging("fixture");
			const value = compose({
				serverId: "fixture",
				env: `BLOB=${"synthetic".repeat(18000)}\nUNICODE=é🙂`,
			});
			const patchContent = "synthetic-patch-🙂\n".repeat(7000);
			state.patches = [
				{
					enabled: true,
					type: "create",
					filePath: "large.patch",
					content: patchContent,
				},
				{
					enabled: true,
					type: "create",
					filePath: "ordered",
					content: "first",
				},
				{ enabled: true, type: "delete", filePath: "ordered", content: "" },
				{
					enabled: true,
					type: "create",
					filePath: "ordered",
					content: "last",
				},
			];
			try {
				const envCommand = await getCreateEnvFileCommand(value, remoteStaging);
				const patchCommand = await generateApplyPatchesCommand({
					id: "probe",
					type: "compose",
					serverId: "fixture",
					staging: remoteStaging,
				});
				expect(Buffer.byteLength(envCommand + patchCommand)).toBeLessThan(
					10000,
				);
				expect(envCommand).not.toContain("synthetic");
				expect(patchCommand).not.toContain("synthetic-patch-");
				await execAsyncRemote("fixture", envCommand);
				await execAsyncRemote("fixture", patchCommand);
			} finally {
				await remoteStaging.cleanup();
			}
			expect(await readFile(join(codePath(), ".env"), "utf8")).toBe(
				legacyEnv(value),
			);
			expect(await readFile(join(codePath(), "large.patch"), "utf8")).toBe(
				patchContent,
			);
			expect(await readFile(join(codePath(), "ordered"), "utf8")).toBe("last");
			expect(await readdir(join(state.root, ".staging"))).toEqual([]);
		},
	);

	it.skipIf(!env.STREAM_CONTENT_SSH_KEY)(
		"rejects a runtime patch symlink escape over SFTP-disabled SSH",
		async () => {
			const remoteStaging = createContentStaging("fixture");
			state.patches = [
				{
					enabled: true,
					type: "create",
					filePath: "nested/file",
					content: "synthetic-escape",
				},
			];
			const command = await generateApplyPatchesCommand({
				id: "probe",
				type: "compose",
				serverId: "fixture",
				staging: remoteStaging,
			});
			const outside = join(state.root, "outside");
			await mkdir(outside);
			await symlink(outside, join(codePath(), "nested"));
			try {
				await expect(execAsyncRemote("fixture", command)).rejects.toMatchObject(
					{
						exitCode: 1,
					},
				);
			} finally {
				await remoteStaging.cleanup();
			}
			expect(await readdir(outside)).toEqual([]);
			expect(await readdir(join(state.root, ".staging"))).toEqual([]);
		},
	);
});
