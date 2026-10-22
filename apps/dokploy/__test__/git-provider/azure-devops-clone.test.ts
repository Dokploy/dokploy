import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import {
	cloneAzureDevopsRepository,
	prepareAzureDevopsClone,
} from "@dokploy/server/utils/providers/azure-devops";
import { AzureDevopsClient } from "@dokploy/server/utils/providers/azure-devops-client";
import { parse } from "shell-quote";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	exec: vi.fn(),
	remote: vi.fn(),
	find: vi.fn(),
	append: vi.fn(),
}));
vi.mock("@dokploy/server/services/azure-devops", () => ({
	findAzureDevopsById: mocks.find,
}));
vi.mock("@dokploy/server/utils/process/execAsync", async () => ({
	...(await vi.importActual("@dokploy/server/utils/process/ExecError")),
	execAsyncStream: mocks.exec,
	execAsyncRemote: mocks.remote,
}));
vi.mock("node:fs/promises", () => ({ appendFile: mocks.append }));

const token = "private-test-pat";
const baseUrl = "https://ado.test/tfs/Collection";
const source = {
	appName: "app",
	azureDevopsId: "provider",
	azureDevopsProjectId: "project",
	azureDevopsRepositoryId: "repo",
	azureDevopsBranch: "feature/main",
	serverId: null,
	enableSubmodules: true,
};
const remoteUrl = `${baseUrl}/project/_git/renamed`;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.find.mockResolvedValue({ baseUrl, personalAccessToken: token });
	mocks.exec.mockResolvedValue({ stdout: "cloned", stderr: "" });
	mocks.remote.mockResolvedValue({ stdout: "cloned", stderr: "" });
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ remoteUrl }), {
				headers: { "content-type": "application/json" },
			}),
		),
	);
});

describe("Azure DevOps clone credential isolation", () => {
	it.skipIf(process.platform === "win32").each([
		{ remote: false, verbose: "0" },
		{ remote: false, verbose: "1" },
		{ remote: true, verbose: "0" },
		{ remote: true, verbose: "1" },
	])(
		"disables inherited curl verbosity in the clone shell (remote=$remote, value=$verbose)",
		async ({ remote, verbose }) => {
			const directory = mkdtempSync(join(tmpdir(), "dokploy-azure-trace-"));
			try {
				await cloneAzureDevopsRepository({
					...source,
					serverId: remote ? "remote" : null,
					outputPathOverride: join(directory, "repo"),
				});
				const [command, options, input] = remote
					? [mocks.remote.mock.calls[0]![1], {}, mocks.remote.mock.calls[0]![3]]
					: [
							mocks.exec.mock.calls[0]![0],
							mocks.exec.mock.calls[0]![2],
							undefined,
						];
				const output = execFileSync(
					"/bin/sh",
					[
						"-c",
						`export GIT_CURL_VERBOSE=${verbose}; git() { if [ "\${GIT_CURL_VERBOSE+x}" = x ]; then echo 'curl verbosity is enabled' >&2; return 70; fi; printf 'clone completed'; }; ${command}`,
					],
					{ ...options, input, encoding: "utf8" },
				);
				expect(output).toBe("clone completed");
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		},
	);
	it("scopes legacy Services credentials to the organization hostname", () => {
		const client = new AzureDevopsClient(
			"https://contoso.visualstudio.com",
			token,
		);
		const url = "https://contoso.visualstudio.com/project/_git/repo";
		const plan = prepareAzureDevopsClone(source, client, url, token);
		expect(parse(plan.command)).toContain(url);
		expect(plan.env.GIT_CONFIG_KEY_0).toBe(
			"http.https://contoso.visualstudio.com/.extraHeader",
		);
		expect(plan.command).not.toContain(token);
	});
	it("uses Azure's canonical collection path casing for Git's URL-scoped header", () => {
		const plan = prepareAzureDevopsClone(
			source,
			new AzureDevopsClient("https://ado.test/tfs/collection", token),
			remoteUrl,
			token,
		);
		expect(plan.env.GIT_CONFIG_KEY_0).toBe(`http.${baseUrl}/.extraHeader`);
	});
	it("keeps the URL/command clean and scopes the header to the collection", () => {
		const plan = prepareAzureDevopsClone(
			source,
			new AzureDevopsClient(baseUrl, token),
			remoteUrl,
			token,
		);
		expect(plan.command).not.toContain(token);
		expect(plan.command).not.toContain(
			Buffer.from(`:${token}`).toString("base64"),
		);
		expect(parse(plan.command)).toContain(remoteUrl);
		expect(plan.env.GIT_CONFIG_KEY_0).toBe(`http.${baseUrl}/.extraHeader`);
		expect(plan.env.GIT_CONFIG_VALUE_0).toContain("Authorization: Basic");
		expect(plan.env.GIT_CONFIG_VALUE_1).toBe("false");
		expect(plan.env.GIT_TRACE_CURL).toBe("0");
		expect(plan.command).not.toContain("git config");
	});
	it("refreshes repository metadata and uses child-process environment locally", async () => {
		const inheritedAuth = process.env.GIT_CONFIG_VALUE_0;
		await cloneAzureDevopsRepository(source);
		expect(fetch).toHaveBeenCalledWith(
			expect.objectContaining({
				pathname: "/tfs/Collection/project/_apis/git/repositories/repo",
			}),
			expect.any(Object),
		);
		const [command, , options] = mocks.exec.mock.calls[0]!;
		expect(parse(command)).toContain(remoteUrl);
		expect(options.env.GIT_CONFIG_VALUE_0).toContain("Basic");
		expect(process.env.GIT_CONFIG_VALUE_0).toBe(inheritedAuth);
	});
	it("sends remote credentials only through SSH stdin", async () => {
		await cloneAzureDevopsRepository({ ...source, serverId: "remote" });
		const [, command, , input] = mocks.remote.mock.calls[0]!;
		expect(command).not.toContain(token);
		expect(command).not.toContain(Buffer.from(`:${token}`).toString("base64"));
		expect(command).toContain("IFS= read -r");
		expect(input).toBe(
			`Authorization: Basic ${Buffer.from(`:${token}`).toString("base64")}\n`,
		);
		expect(mocks.remote.mock.calls[0]![4]).toEqual({ includeStream: true });
		expect(mocks.exec).not.toHaveBeenCalled();
	});
	it.each([false, true])(
		"sanitizes error details and logs (remote=%s)",
		async (remote) => {
			const base64 = Buffer.from(`:${token}`).toString("base64");
			const error = new ExecError(`leak ${token}`, {
				command: `bad ${token}`,
				originalError: new Error(token),
				stdout: token,
				stderr: `Authorization: Basic ${base64}`,
			});
			(remote ? mocks.remote : mocks.exec).mockRejectedValueOnce(error);
			const result = await cloneAzureDevopsRepository({
				...source,
				logPath: "/tmp/test.log",
				serverId: remote ? "server" : null,
			}).catch((error) => error);
			expect(result).toBeInstanceOf(ExecError);
			for (const secret of [token, base64]) {
				expect(JSON.stringify(result)).not.toContain(secret);
				expect(result.getDetailedMessage()).not.toContain(secret);
				if (!remote)
					expect(mocks.append.mock.calls.flat().join(" ")).not.toContain(
						secret,
					);
				else
					expect(
						mocks.remote.mock.calls.slice(1).flat().join(" "),
					).not.toContain(secret);
			}
			expect(result.originalError).toBeUndefined();
		},
	);
	it.each([false, true])(
		"logs clone progress before the process exits (remote=%s)",
		async (remote) => {
			let finish:
				| ((result: { stdout: string; stderr: string }) => void)
				| undefined;
			const execute = remote ? mocks.remote : mocks.exec;
			execute.mockImplementationOnce((...args: unknown[]) => {
				const onData = args[remote ? 2 : 1] as (
					data: string,
					stream: "stdout" | "stderr",
				) => void;
				onData("Receiving objects: 25%\r", "stderr");
				return new Promise((resolve) => {
					finish = resolve;
				});
			});
			const cloning = cloneAzureDevopsRepository({
				...source,
				logPath: "/tmp/test.log",
				serverId: remote ? "server" : null,
			});
			try {
				await vi.waitFor(() => {
					if (remote) expect(mocks.remote).toHaveBeenCalledTimes(2);
					else
						expect(mocks.append).toHaveBeenCalledWith(
							"/tmp/test.log",
							"Receiving objects: 25%\r",
						);
				});
				expect(execute.mock.calls[0]![remote ? 1 : 0]).toContain("--progress");
			} finally {
				finish?.({ stdout: "", stderr: "Receiving objects: 25%\r" });
				await cloning;
			}
		},
	);
	it.each([false, true])(
		"redacts every credential split with interleaved output streams (remote=%s)",
		async (remote) => {
			const encoded = Buffer.from(`:${token}`).toString("base64");
			const secrets = [token, encoded, `Authorization: Basic ${encoded}`];
			(remote ? mocks.remote : mocks.exec).mockImplementationOnce(
				async (...args: unknown[]) => {
					const onData = args[remote ? 2 : 1] as (
						data: string,
						stream: "stdout" | "stderr",
					) => void;
					for (const secret of secrets) {
						for (let split = 1; split < secret.length; split++) {
							onData(`before ${secret.slice(0, split)}`, "stdout");
							onData("progress\n", "stderr");
							onData(`${secret.slice(split)} after\n`, "stdout");
						}
					}
					onData(`terminated ${token.slice(0, 7)}`, "stderr");
					return { stdout: "", stderr: "" };
				},
			);
			await cloneAzureDevopsRepository({
				...source,
				logPath: "/tmp/test.log",
				serverId: remote ? "server" : null,
			});
			const logged = remote
				? mocks.remote.mock.calls
						.slice(1)
						.map(([, command]) => {
							const payload = parse(command)[2] as string;
							return Buffer.from(payload, "base64").toString();
						})
						.join("")
				: mocks.append.mock.calls.map(([, content]) => content).join("");
			for (const secret of secrets) expect(logged).not.toContain(secret);
			expect(logged).not.toContain(token.slice(0, 7));
			expect(logged.match(/\[REDACTED\]/g)).toHaveLength(
				secrets.reduce((count, secret) => count + secret.length - 1, 1),
			);
		},
	);
	it("does not repeat already streamed output when cloning fails", async () => {
		mocks.exec.mockImplementationOnce(async (_command, onData) => {
			onData("Receiving objects\n", "stderr");
			onData(token.slice(0, 7), "stderr");
			throw new ExecError(token, {
				command: "git clone",
				stderr: `Receiving objects\n${token}`,
			});
		});
		const error = await cloneAzureDevopsRepository({
			...source,
			logPath: "/tmp/test.log",
		}).catch((error) => error);
		const logged = mocks.append.mock.calls
			.map(([, content]) => content)
			.join("");
		expect(logged).toBe("Receiving objects\n[REDACTED]");
		expect(error.getDetailedMessage()).not.toContain(token);
	});
	it("reports log write failure without exposing the underlying error", async () => {
		mocks.append.mockRejectedValueOnce(new Error(token));
		mocks.exec.mockImplementationOnce(async (_command, onData) => {
			onData("Receiving objects\n", "stderr");
			return { stdout: "", stderr: "Receiving objects\n" };
		});
		await expect(
			cloneAzureDevopsRepository({ ...source, logPath: "/tmp/test.log" }),
		).rejects.toThrow(
			"Could not write Azure DevOps clone output to deployment log.",
		);
	});
	it("quotes branch and output paths against shell injection", () => {
		const plan = prepareAzureDevopsClone(
			{
				...source,
				azureDevopsBranch: "x'; touch /tmp/injected; #",
				outputPathOverride: "/tmp/a'; touch /tmp/injected; #",
			},
			new AzureDevopsClient(baseUrl, token),
			remoteUrl,
			token,
		);
		expect(parse(plan.command)).toContain("x'; touch /tmp/injected; #");
		expect(parse(plan.command)).toContain("/tmp/a'; touch /tmp/injected; #");
		expect(parse(plan.command)).not.toContain("touch");
	});
});
