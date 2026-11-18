import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
	type ComposeNested,
	getBuildComposeCommand,
} from "@dokploy/server/utils/builders/compose";
import {
	addDomainToCompose,
	getComposePath,
	writeDomainsToCompose,
} from "@dokploy/server/utils/docker/domain";
import {
	ExecError,
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

const state = vi.hoisted(() => ({ root: "" }));

vi.mock("@dokploy/server/constants", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/constants")>()),
	paths: () => ({ COMPOSE_PATH: state.root }),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsyncRemote: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

const sharedEnv = Object.fromEntries(
	Array.from({ length: 150 }, (_, i) => [
		`SETTING_${i}`,
		`synthetic-value-${i}-abcdefghijklmnopqrstuvwxyz0123456789`,
	]),
);
const composeFile = `x-env: &shared
${stringify(sharedEnv)
	.trimEnd()
	.split("\n")
	.map((line) => `  ${line}`)
	.join("\n")}
services:
${Array.from(
	{ length: 14 },
	(_, i) => `  backend-${i}:
    image: synthetic/backend:1
    environment:
      <<: *shared
      SERVICE: backend-${i}`,
).join("\n")}
`;

const domain = {
	host: "synthetic.example.com",
	serviceName: "backend-0",
	https: false,
	uniqueConfigKey: 1,
	port: 3000,
	enabled: true,
	path: "/",
};

const makeCompose = (overrides = {}) =>
	({
		appName: "direct-write",
		name: "Direct write",
		composeId: "compose-id",
		composeType: "docker-compose",
		sourceType: "raw",
		composePath: "docker-compose.yml",
		composeFile,
		serverId: null,
		isolatedDeployment: false,
		randomize: false,
		createEnvFile: false,
		mounts: [],
		domains: [domain],
		environment: {
			environmentId: "environment-id",
			name: "production",
			projectId: "project-id",
			project: {
				projectId: "project-id",
				name: "synthetic",
				organizationId: "organization-id",
			},
		},
		...overrides,
	}) as unknown as ComposeNested;

beforeEach(async () => {
	state.root = await mkdtemp(join(tmpdir(), "dokploy-direct-write-"));
	await mkdir(join(state.root, "direct-write", "code"), { recursive: true });
	vi.clearAllMocks();
});

afterEach(async () => {
	await rm(state.root, { recursive: true, force: true });
});

describe("direct transformed compose writes (#5941)", () => {
	it("writes merge-expanded YAML without a shell payload", async () => {
		const compose = makeCompose();
		const expected = await addDomainToCompose(compose, compose.domains);
		expect(Buffer.byteLength(stringify(expected))).toBeGreaterThan(131072);

		const command = await getBuildComposeCommand(compose);
		expect(Buffer.byteLength(command)).toBeLessThan(4096);
		expect(command).not.toContain("base64");
		const written = parse(await readFile(getComposePath(compose), "utf8"));
		expect(written).toEqual(expected);
		for (let i = 0; i < 14; i++) {
			expect(written.services[`backend-${i}`].environment).toEqual({
				...sharedEnv,
				SERVICE: `backend-${i}`,
			});
		}
		expect(written.services["backend-0"].labels).toContain(
			"traefik.enable=true",
		);
		expect(written.services["backend-0"].networks).toContain("dokploy-network");
		expect(await writeDomainsToCompose(compose, [])).toBe("");
	});

	it("stages and verifies exact UTF-8 stdin before opening the quoted destination", async () => {
		const compose = makeCompose({
			serverId: "remote-server",
			appName: "direct write's",
			composeFile: `${composeFile}\nx-unicode: "é🙂"\n`,
		});
		const expected = stringify(
			await addDomainToCompose(compose, compose.domains),
			{ lineWidth: 1000 },
		);
		const command = await getBuildComposeCommand(compose);
		const path = getComposePath(compose);
		const temporaryPath = quote([
			join(dirname(path), `.${basename(path)}.XXXXXX`),
		]);
		expect(execAsyncRemote).toHaveBeenCalledExactlyOnceWith(
			"remote-server",
			`set -e; tmp=$(mktemp ${temporaryPath} 2>/dev/null || mktemp) || { echo 'Unable to create compose staging file' >&2; exit 1; }; trap 'rc=$?; rm -f "$tmp" || rc=1; exit "$rc"' 0; trap 'rm -f "$tmp"; exit 1' HUP INT TERM PIPE; cat > "$tmp"; size=$(wc -c < "$tmp"); [ "$size" -eq ${Buffer.byteLength(expected)} ] || { echo 'Incomplete compose transfer' >&2; exit 1; }; cat "$tmp" > ${quote([path])}`,
			undefined,
			expected,
		);
		expect(command).not.toContain("base64");
		expect(Buffer.byteLength(command)).toBeLessThan(4096);
		expect(existsSync(getComposePath(compose))).toBe(false);
	});

	it.each([
		["sh", false],
		["bash", false],
		["sh", true],
		["bash", true],
	] as const)(
		"rejects a truncated stream without modifying the destination (shell=%s, closed stderr=%s)",
		async (shell, closedStderr) => {
			const compose = makeCompose({ serverId: "remote-server" });
			await writeDomainsToCompose(compose, []);
			const [, command, , content] = vi.mocked(execAsyncRemote).mock.calls[0]!;
			const path = getComposePath(compose);
			await writeFile(path, "previous contents", "utf8");
			const child = spawn(shell, ["-c", command]);
			let stderr = "";
			child.stderr.on("data", (data) => {
				stderr += data.toString();
			});
			if (closedStderr) child.stderr.destroy();
			child.stdin.end(content!.slice(0, 32768));
			const code = await new Promise((resolve, reject) => {
				child.on("close", resolve);
				child.on("error", reject);
			});
			expect(code).toBe(1);
			if (!closedStderr)
				expect(stderr).toContain("Incomplete compose transfer");
			expect(await readFile(path, "utf8")).toBe("previous contents");
			expect(await readdir(dirname(path))).toEqual([basename(path)]);
		},
	);

	it.each([false, true])(
		"emits an exit 1 fragment on a write failure (remote=%s)",
		async (remote) => {
			const compose = makeCompose({
				serverId: remote ? "remote-server" : null,
			});
			const error = remote
				? new ExecError("Remote command failed with exit code 1", {
						command: `cat > ${quote([getComposePath(compose)])}`,
						stderr: "cat: synthetic write failure: Permission denied\n",
						exitCode: 1,
					})
				: new Error("synthetic write failure");
			if (remote) {
				vi.mocked(execAsyncRemote).mockRejectedValueOnce(error);
			} else {
				vi.mocked(writeFile).mockRejectedValueOnce(error);
			}
			const command = await getBuildComposeCommand(compose);
			expect(command).toContain("exit 1");
			expect(command).not.toContain("synthetic-value");
			await expect(execAsync(command)).rejects.toMatchObject({
				exitCode: 1,
				stdout: expect.stringContaining("synthetic write failure"),
				stderr: "",
			});
		},
	);

	it("aborts on invalid YAML", async () => {
		const fragment = await writeDomainsToCompose(
			makeCompose({ composeFile: "services: [synthetic-secret: invalid" }),
			[],
		);
		expect(fragment).toContain("exit 1");
		await expect(
			execAsync(`${fragment}\necho docker-reached`),
		).rejects.toMatchObject({
			exitCode: 1,
			stdout: expect.not.stringContaining("docker-reached"),
		});
	});

	it("preserves the missing-file abort fragment", async () => {
		const fragment = await writeDomainsToCompose(
			makeCompose({ sourceType: "git" }),
			[],
		);
		expect(fragment).toContain("Compose file not found");
		expect(fragment).toContain("exit 1");
	});
});
