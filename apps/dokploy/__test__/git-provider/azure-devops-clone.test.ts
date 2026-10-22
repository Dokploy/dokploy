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
	execAsync: mocks.exec,
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
							mocks.exec.mock.calls[0]![1],
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
		const [command, options] = mocks.exec.mock.calls[0]!;
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
