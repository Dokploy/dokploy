import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
	chmod,
	lstat,
	mkdir,
	mkdtemp,
	open,
	readdir,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { env, umask } from "node:process";
import { quote } from "shell-quote";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	root: "",
	row: {} as any,
	updatedSchedule: null as any,
	content: "",
	commands: [] as string[],
	real: false,
	failValidation: false,
	failWrite: false,
	failPromote: false,
	failOnWrite: 0,
	writeAttempts: 0,
	truncateTransfer: false,
	truncatedBytes: 0,
	updates: [] as any[],
}));
vi.mock("@dokploy/server/constants", async (original) => ({
	...(await original<any>()),
	paths: () => ({
		BASE_PATH: state.root,
		APPLICATIONS_PATH: join(state.root, "apps"),
		COMPOSE_PATH: join(state.root, "compose"),
		SSH_PATH: join(state.root, "ssh"),
		SCHEDULES_PATH: join(state.root, "schedules"),
		CERTIFICATES_PATH: join(state.root, "certs"),
		VECTOR_PATH: join(state.root, "vector"),
	}),
}));
vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: () => ({
			values: (row: any) => ({
				returning: async () => [{ scheduleId: "unit", ...row }],
			}),
		}),
		query: { mounts: { findFirst: async () => state.row } },
		update: () => {
			let values: any;
			const chain: any = {
				set: (row: any) => {
					values = row;
					state.updates.push(row);
					return chain;
				},
				where: () => chain,
				returning: async () =>
					state.updatedSchedule
						? [{ ...state.updatedSchedule, ...values }]
						: [{}],
			};
			return chain;
		},
	},
}));
vi.mock("@dokploy/server/services/ssh-key", () => ({
	findSSHKeyById: async () => ({ privateKey: state.content }),
	updateSSHKeyById: async () => {},
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
	findServersByOrganizationForVectorAgent: async () => [],
	getAccessibleServerIds: async () => [],
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: async () => ({
		vectorAgentOrganizationId: "org",
		telemetryProviderIds: ["p"],
	}),
}));
vi.mock(
	"@dokploy/server/services/logs-and-metrics/service",
	async (original) => ({
		...(await original<any>()),
		findEnabledTelemetryProvidersByOrganization: async () => [
			{
				telemetryProviderId: "p",
				name: "fixture",
				providerType: "loki",
				signals: ["logs"],
				endpoint: "http://127.0.0.1:3100",
				apiKey: state.content,
				apiSecret: null,
				extraConfig: null,
				enabled: true,
				organizationId: "org",
			},
		],
	}),
);
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: async () => ({
		getService: () => ({
			inspect: async () => {
				throw Object.assign(new Error("missing"), { statusCode: 404 });
			},
			remove: async () => {},
			update: async () => {},
		}),
		createService: async () => {},
		listContainers: async () => [],
	}),
}));
vi.mock("@dokploy/server/utils/process/execAsync", async (original) => {
	const actual = await original<any>();
	const run = async (
		server: string | null,
		command: string,
		_options?: unknown,
		input?: string | Buffer,
	) => {
		let transferInput = input;
		state.commands.push(command);
		if (transferInput) state.writeAttempts++;
		if (transferInput && state.truncateTransfer) {
			state.truncateTransfer = false;
			transferInput = transferInput.slice(0, 8);
			state.truncatedBytes = Buffer.byteLength(transferInput);
		}
		if (
			(state.failWrite && transferInput) ||
			(transferInput && state.failOnWrite === state.writeAttempts) ||
			(state.failPromote && command.startsWith("mv "))
		)
			throw new actual.ExecError("write failed", {
				command,
				stderr: "Permission denied",
				stdout: "",
				exitCode: 1,
			});
		if (command.includes("validate --skip-healthchecks")) {
			if (state.failValidation)
				throw new actual.ExecError("validation failed", {
					command,
					stderr: `invalid password ${state.content}`,
					stdout: "",
					exitCode: 1,
				});
			if (!state.real) return { stdout: "valid", stderr: "" };
		}
		if (state.real)
			return server
				? actual.execAsyncRemote(server, command, _options, transferInput)
				: actual.execAsync(command);
		const result = spawnSync("sh", ["-c", command], {
			input: transferInput,
			encoding: "utf8",
			maxBuffer: 2 * 1024 * 1024,
		});
		if (result.status !== 0)
			throw new actual.ExecError("shell failed", {
				command,
				stdout: result.stdout || "",
				stderr: result.stderr || "",
				exitCode: result.status || 1,
			});
		return { stdout: result.stdout, stderr: result.stderr };
	};
	return {
		...actual,
		execAsync: (command: string) => run(null, command),
		execAsyncRemote: run,
	};
});

import { createCertificate } from "@dokploy/server/services/certificate";
import { writeDeploymentErrorLog } from "@dokploy/server/services/deployment";
import {
	createFileMount,
	updateFileMount,
} from "@dokploy/server/services/mount";
import {
	createSchedule,
	updateSchedule,
} from "@dokploy/server/services/schedule";
import { reconcileVectorAgent } from "@dokploy/server/setup/vector-setup";
import { getCreateFileCommand } from "@dokploy/server/utils/docker/utils";
import { createContentStaging } from "@dokploy/server/utils/filesystem/write-content";
import {
	ExecError,
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { cloneGitRepository } from "@dokploy/server/utils/providers/git";

let staging: ReturnType<typeof createContentStaging>;
const heldFiles: Awaited<ReturnType<typeof open>>[] = [];
beforeEach(async () => {
	state.root = await mkdtemp(
		join(env.STREAM_CONTENT_ROOT || tmpdir(), "stream-server-"),
	);
	state.real = !!env.STREAM_CONTENT_SSH_KEY;
	state.content = `synthetic-private-${"x".repeat(160 * 1024)}é\n`;
	state.commands = [];
	state.failValidation = false;
	state.failWrite = false;
	state.failPromote = false;
	state.failOnWrite = 0;
	state.writeAttempts = 0;
	state.truncateTransfer = false;
	state.truncatedBytes = 0;
	state.updatedSchedule = null;
	state.updates = [];
	staging = createContentStaging(null);
	await mkdir(join(state.root, "bin"));
	await writeFile(join(state.root, "bin", "git"), "#!/bin/sh\nexit 0\n", {
		mode: 0o755,
	});
});
afterEach(async () => {
	await staging.cleanup();
	await Promise.all(heldFiles.splice(0).map((file) => file.close()));
	await rm(state.root, { recursive: true, force: true });
});
const metadata = async (file: string, before: number) => {
	const data = await stat(file);
	return {
		mode: data.mode & 0o777,
		uid: data.uid,
		gid: data.gid,
		sameInode: data.ino === before,
		symlink: (await lstat(file)).isSymbolicLink(),
	};
};
const prepare = async (file: string, kind: string) => {
	await mkdir(dirname(file), { recursive: true });
	if (kind === "new") return 0;
	const target = kind === "symlink" ? `${file}.target` : file;
	await writeFile(target, "prior", { mode: 0o646 });
	await chmod(target, 0o646);
	if (kind === "symlink") await symlink(target, file);
	heldFiles.push(await open(file, "r"));
	return (await stat(file)).ino;
};

describe("stream server file content and canary metadata", () => {
	for (const remote of [false, true])
		for (const site of [
			"mount",
			"schedule",
			"certificate",
			"log",
			"git",
			"vector",
		])
			for (const kind of ["new", "existing", "symlink"]) {
				it.each([
					"",
					"normal é\n",
					`synthetic-private-${"x".repeat(160 * 1024)}é\n`,
				])(
					`${remote ? "remote" : "local"} ${site} ${kind}: bounded commands and canary metadata (case %#)`,
					async (content) => {
						state.content = content;
						const server = remote ? "fixture" : null;
						staging = createContentStaging(server);
						const file =
							site === "mount"
								? join(state.root, "apps/probe/files/file.conf")
								: site === "schedule"
									? join(state.root, "schedules/probe/script.sh")
									: site === "certificate"
										? join(state.root, "certs/probe/privkey.key")
										: site === "vector"
											? join(state.root, "vector/vector.yaml")
											: join(state.root, site);
						const legacy = join(state.root, "legacy", site);
						const before = await prepare(file, kind);
						const oldBefore = await prepare(legacy, kind);
						const run = (command: string) =>
							remote ? execAsyncRemote("fixture", command) : execAsync(command);
						const extraFiles: {
							file: string;
							legacy: string;
							before: number;
							oldBefore: number;
						}[] = [];
						if (site === "certificate")
							for (const name of ["chain.crt", "certificate.yml"]) {
								const extra = join(dirname(file), name);
								const old = `${legacy}.${name}`;
								extraFiles.push({
									file: extra,
									legacy: old,
									before: await prepare(extra, kind),
									oldBefore: await prepare(old, kind),
								});
								await run(`echo bm9ybWFs | base64 -d > ${quote([old])}`);
							}
						const q = quote([legacy]);
						let baseline = `echo bm9ybWFs | base64 -d ${site === "log" ? ">>" : ">"} ${q}`;
						if (site === "schedule")
							baseline = `rm -f ${q}; touch ${q}; chmod +x ${q}; ${baseline}`;
						if (site === "git") baseline += `; chmod 600 ${q}`;
						if (site === "vector")
							baseline = `umask 077; echo bm9ybWFs | base64 -d > ${q}.candidate; mv ${q}.candidate ${q}`;
						if (site === "mount" && kind === "symlink") baseline = "true";
						await run(baseline);
						if (site === "mount") {
							state.row = {
								type: "file",
								filePath: "file.conf",
								content: state.content,
								serviceType: "application",
								application: { serverId: server, appName: "probe" },
							};
							if (kind === "symlink") {
								await expect(updateFileMount("unit")).rejects.toThrow(
									"Path escapes its base directory",
								);
								await expect(createFileMount("unit")).rejects.toThrow();
								expect(await readFile(file, "utf8")).toBe("prior");
								expect(await metadata(file, before)).toEqual(
									await metadata(legacy, oldBefore),
								);
								expect(await readdir(join(state.root, ".staging"))).toEqual([]);
								return;
							}
							await updateFileMount("unit");
							await createFileMount("unit");
							expect(await readFile(file, "utf8")).toBe(state.content);
						} else if (site === "schedule") {
							await createSchedule({
								appName: "probe",
								script: state.content,
								scheduleType: remote ? "server" : "dokploy-server",
								serverId: server,
							} as any);
							expect(await readFile(file, "utf8")).toBe(
								`echo "PID: $$ | Schedule ID: unit"\n${state.content}`,
							);
						} else if (site === "certificate") {
							await createCertificate(
								{
									certificatePath: "probe",
									certificateData: state.content,
									privateKey: state.content,
									serverId: server,
								} as any,
								"org",
							);
							expect(await readFile(file, "utf8")).toBe(state.content);
							expect(
								await readFile(join(dirname(file), "chain.crt"), "utf8"),
							).toBe(state.content);
						} else if (site === "log") {
							await writeDeploymentErrorLog(
								{ deploymentId: "unit", logPath: file },
								server,
								new Error(state.content),
							);
							expect(await readFile(file, "utf8")).toBe(
								`${kind === "new" ? "" : "prior"}${state.content}\nError occurred ❌, check the logs for details.\n`,
							);
						} else if (site === "git") {
							const command = await cloneGitRepository(
								{
									appName: "probe",
									customGitUrl: "https://example.invalid/repo.git",
									customGitBranch: "main",
									customGitSSHKeyId: "key",
									serverId: server,
								},
								staging,
							);
							if (state.content) expect(command).not.toContain(state.content);
							await run(
								`PATH=${quote([join(state.root, "bin")])}:"$PATH"; ${command.replaceAll("/tmp/id_rsa", file)}`,
							);
							expect(await readFile(file, "utf8")).toBe(`${state.content}\n`);
						} else {
							await reconcileVectorAgent(server || undefined);
							expect(await readFile(file, "utf8")).toContain(
								state.content.trim(),
							);
							expect(
								(await readdir(dirname(file))).some((name) =>
									name.includes("candidate"),
								),
							).toBe(false);
						}
						expect(await metadata(file, before)).toEqual(
							await metadata(legacy, oldBefore),
						);
						for (const extra of extraFiles)
							expect(await metadata(extra.file, extra.before)).toEqual(
								await metadata(extra.legacy, extra.oldBefore),
							);
						if (
							kind === "symlink" &&
							(site === "schedule" || site === "vector")
						)
							expect(await readFile(`${file}.target`, "utf8")).toBe("prior");
						for (const command of state.commands) {
							expect(Buffer.byteLength(command)).toBeLessThan(10000);
							expect(command).not.toContain("synthetic-private-");
						}
						await staging.cleanup();
						expect(
							await readdir(join(state.root, ".staging")).catch(() => []),
						).toEqual([]);
					},
					60000,
				);
			}
	it("retains mount directory cases and rejects runtime symlink escapes", async () => {
		const base = join(state.root, "files");
		await mkdir(join(base, "empty"), { recursive: true });
		await execAsync(
			await getCreateFileCommand(base, "empty", state.content, staging),
		);
		expect(await readFile(join(base, "empty"), "utf8")).toBe(state.content);
		await execAsync(
			await getCreateFileCommand(base, "directory/", state.content, staging),
		);
		expect((await stat(join(base, "directory"))).isDirectory()).toBe(true);
		await mkdir(join(base, "nonempty"));
		await writeFile(join(base, "nonempty/keep"), "keep");
		await expect(
			execAsync(
				await getCreateFileCommand(base, "nonempty", state.content, staging),
			),
		).rejects.toThrow();
		const command = await getCreateFileCommand(
			base,
			"escape/file",
			state.content,
			staging,
		);
		await symlink(state.root, join(base, "escape"));
		await expect(execAsync(command)).rejects.toThrow();
		expect(await readFile(join(base, "nonempty/keep"), "utf8")).toBe("keep");
	});
	it.each([false, true])(
		"Vector validation failures redact secrets, preserve old config and remove candidates (remote=%s)",
		async (remote) => {
			const file = join(state.root, "vector/vector.yaml");
			await prepare(file, "existing");
			state.failValidation = true;
			let error: any;
			try {
				await reconcileVectorAgent(remote ? "fixture" : undefined);
			} catch (caught) {
				error = caught;
			}
			expect(error.message).toContain("[redacted]");
			expect(error.message).not.toContain("synthetic-private-");
			expect(await readFile(file, "utf8")).toBe("prior");
			expect((await readdir(dirname(file))).sort()).toEqual([
				"data",
				"vector.yaml",
			]);
		},
	);
	it("a failed remote Vector write preserves the old config and removes its candidate", async () => {
		const file = join(state.root, "vector/vector.yaml");
		await prepare(file, "existing");
		state.failWrite = true;
		await expect(reconcileVectorAgent("fixture")).rejects.toThrow(
			"Permission denied",
		);
		expect(await readFile(file, "utf8")).toBe("prior");
		expect((await readdir(dirname(file))).sort()).toEqual([
			"data",
			"vector.yaml",
		]);
	});
	it("a failed Vector promotion preserves old config and removes its candidate", async () => {
		const file = join(state.root, "vector/vector.yaml");
		await prepare(file, "existing");
		state.failPromote = true;
		await expect(reconcileVectorAgent()).rejects.toThrow(
			"Failed to apply the Vector config: Permission denied",
		);
		expect(await readFile(file, "utf8")).toBe("prior");
		expect((await readdir(dirname(file))).sort()).toEqual([
			"data",
			"vector.yaml",
		]);
	});
	it.each(["schedule", "certificate"])(
		"remote %s write errors expose stderr without content",
		async (site) => {
			state.failWrite = true;
			const result =
				site === "schedule"
					? createSchedule({
							appName: "probe",
							script: state.content,
							scheduleType: "server",
							serverId: "fixture",
						} as any)
					: createCertificate(
							{
								certificatePath: "probe",
								certificateData: state.content,
								privateKey: state.content,
								serverId: "fixture",
							} as any,
							"org",
						);
			await expect(result).rejects.toThrow("Permission denied");
			for (const command of state.commands) {
				expect(Buffer.byteLength(command)).toBeLessThan(10000);
				expect(command).not.toContain("synthetic-private-");
			}
		},
	);
	it("does not duplicate ExecError messages in deployment logs", async () => {
		const file = join(state.root, "error.log");
		await writeFile(file, "prior");
		await writeDeploymentErrorLog(
			{ deploymentId: "unit", logPath: file },
			null,
			new ExecError("already logged", {
				command: "false",
				stderr: "already logged",
				exitCode: 1,
			}),
		);
		expect(await readFile(file, "utf8")).toBe(
			"prior\nError occurred ❌, check the logs for details.\n",
		);
	});
	it("retains the database fallback when appending an error log fails", async () => {
		state.failWrite = true;
		const logger = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await writeDeploymentErrorLog(
				{ deploymentId: "unit", logPath: join(state.root, "error.log") },
				"fixture",
				new Error(state.content),
			);
			expect(state.updates.at(-1)).toEqual({ errorMessage: state.content });
		} finally {
			logger.mockRestore();
		}
	});
	it("cleans the first staged Git key if staging the second copy fails", async () => {
		staging = createContentStaging("fixture");
		state.failOnWrite = 2;
		try {
			await expect(
				cloneGitRepository(
					{
						appName: "probe",
						customGitUrl: "https://example.invalid/repo",
						customGitBranch: "main",
						customGitSSHKeyId: "key",
						serverId: "fixture",
					},
					staging,
				),
			).rejects.toThrow("Permission denied");
			expect(await readdir(join(state.root, ".staging"))).toHaveLength(1);
		} finally {
			await staging.cleanup();
		}
		expect(await readdir(join(state.root, ".staging"))).toEqual([]);
	});
	it.each([false, true])(
		"retains the installed 0600 Git key after clone failure (remote=%s)",
		async (remote) => {
			staging = createContentStaging(remote ? "fixture" : null);
			const file = join(state.root, "git-key");
			await writeFile(join(state.root, "bin/git"), "#!/bin/sh\nexit 7\n");
			const command = await cloneGitRepository(
				{
					appName: "probe",
					customGitUrl: "https://example.invalid/repo",
					customGitBranch: "main",
					customGitSSHKeyId: "key",
					serverId: remote ? "fixture" : null,
				},
				staging,
			);
			const execute = remote
				? (text: string) => execAsyncRemote("fixture", text)
				: execAsync;
			try {
				await expect(
					execute(
						`PATH=${quote([join(state.root, "bin")])}:"$PATH"; ${command.replaceAll("/tmp/id_rsa", file)}`,
					),
				).rejects.toMatchObject({ exitCode: 1 });
			} finally {
				await staging.cleanup();
			}
			expect(await readFile(file, "utf8")).toBe(`${state.content}\n`);
			expect((await stat(file)).mode & 0o777).toBe(0o600);
			expect(await readdir(join(state.root, ".staging"))).toEqual([]);
		},
	);
	it("matches canary schedule executability under umask 077", async () => {
		const prior = umask(0o077);
		try {
			await execAsync(
				`touch ${quote([join(state.root, "legacy.sh")])}; chmod +x ${quote([join(state.root, "legacy.sh")])}`,
			);
			await createSchedule({
				appName: "probe",
				script: state.content,
				scheduleType: "dokploy-server",
			} as any);
			const mode =
				(await stat(join(state.root, "schedules/probe/script.sh"))).mode &
				0o777;
			expect(mode).toBe(
				(await stat(join(state.root, "legacy.sh"))).mode & 0o777,
			);
			expect(mode).toBe(0o700);
		} finally {
			umask(prior);
		}
	});
	it.each(["create", "update"])(
		"preserves an existing schedule script after an interrupted %s transfer",
		async (operation) => {
			const header = 'echo "PID: $$ | Schedule ID: unit"\n';
			const replacement = "x".repeat(74 - Buffer.byteLength(header));
			const file = join(state.root, "schedules/probe/script.sh");
			let previous: Awaited<ReturnType<typeof stat>> | undefined;
			if (operation === "update") {
				await mkdir(dirname(file), { recursive: true });
				await writeFile(file, "#!/bin/sh\nexit 17\n", { mode: 0o751 });
				await chmod(file, 0o751);
				previous = await stat(file);
				state.updatedSchedule = {
					scheduleId: "unit",
					appName: "probe",
					scheduleType: "server",
					serverId: "fixture",
				};
			}
			state.truncateTransfer = true;
			const result =
				operation === "create"
					? createSchedule({
							appName: "probe",
							script: replacement,
							scheduleType: "server",
							serverId: "fixture",
						} as any)
					: updateSchedule({
							scheduleId: "unit",
							script: replacement,
						} as any);

			await expect(result).rejects.toThrow("Incomplete content transfer");
			expect(Buffer.byteLength(`${header}${replacement}`)).toBe(74);
			expect(state.truncatedBytes).toBe(8);
			expect(state.commands).toHaveLength(1);
			expect(state.commands[0]).toContain('[ "$size" -eq 74 ]');
			if (operation === "update") {
				expect(await readFile(file, "utf8")).toBe("#!/bin/sh\nexit 17\n");
				const after = await stat(file);
				expect(after.mode & 0o777).toBe(0o751);
				expect(after.ino).toBe(previous?.ino);
				expect(after.uid).toBe(previous?.uid);
				expect(after.gid).toBe(previous?.gid);
				await execAsyncRemote("fixture", `test -x ${quote([file])}`);
			} else {
				await expect(readFile(file, "utf8")).rejects.toMatchObject({
					code: "ENOENT",
				});
			}
			expect(await readdir(join(state.root, ".staging"))).toEqual([]);
		},
	);
	it.each(["create", "update"])(
		"rejects a server schedule without a server ID before local work (%s)",
		async (operation) => {
			if (operation === "update") {
				state.updatedSchedule = {
					scheduleId: "unit",
					appName: "probe",
					scheduleType: "server",
					serverId: null,
				};
			}
			const result =
				operation === "create"
					? createSchedule({
							appName: "probe",
							script: "exit 0",
							scheduleType: "server",
							serverId: null,
						} as any)
					: updateSchedule({
							scheduleId: "unit",
							script: "exit 0",
						} as any);

			await expect(result).rejects.toThrow(
				"A server ID is required for server schedules",
			);
			expect(state.commands).toEqual([]);
			await expect(readdir(join(state.root, ".staging"))).rejects.toMatchObject(
				{
					code: "ENOENT",
				},
			);
			expect(await readdir(state.root)).not.toContain("schedules");
		},
	);
	it.each([false, true])(
		"replaces a schedule script with canary metadata and cleans staging (remote=%s)",
		async (remote) => {
			const serverId = remote ? "fixture" : null;
			const scheduleType = remote ? "server" : "dokploy-server";
			const directory = join(state.root, "schedules/probe");
			const file = join(directory, "script.sh");
			const baseline = join(directory, "baseline.sh");
			const target = join(directory, "old-target");
			const baselineTarget = join(directory, "baseline-target");
			const replacement = "printf 'replacement\\n'";
			const content = `echo "PID: $$ | Schedule ID: unit"\n${replacement}`;
			await mkdir(directory, { recursive: true });
			await writeFile(target, "target content");
			await symlink(target, file);
			await writeFile(baselineTarget, "baseline target");
			await symlink(baselineTarget, baseline);
			const baselineCommand = `rm -f ${quote([baseline])}; touch ${quote([baseline])}; chmod +x ${quote([baseline])}; printf '%s' ${quote([content])} > ${quote([baseline])}`;
			if (remote) await execAsyncRemote(serverId, baselineCommand);
			else await execAsync(baselineCommand);
			state.updatedSchedule = {
				scheduleId: "unit",
				appName: "probe",
				scheduleType,
				serverId,
			};
			state.commands = [];

			await updateSchedule({
				scheduleId: "unit",
				script: replacement,
			} as any);

			const actual = await stat(file);
			const expected = await stat(baseline);
			expect(await readFile(file, "utf8")).toBe(content);
			expect(actual.mode & 0o777).toBe(expected.mode & 0o777);
			expect(actual.uid).toBe(expected.uid);
			expect(actual.gid).toBe(expected.gid);
			expect((await lstat(file)).isSymbolicLink()).toBe(false);
			expect(await readFile(target, "utf8")).toBe("target content");
			expect(await readdir(join(state.root, ".staging"))).toEqual([]);
			expect(state.commands.join(" ")).not.toContain(replacement);
		},
	);
});
