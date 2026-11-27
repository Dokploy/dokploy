import { db } from "@dokploy/server/db";
import {
	getComposeImageHosts,
	getImageRegistryHost,
	loginOrganizationRegistries,
	normalizeRegistryHost,
} from "@dokploy/server/services/registry";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import {
	execAsync,
	execAsyncRemote,
	execFileAsync,
} from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	execFileAsync: vi.fn(),
}));

const registry = (
	name: string,
	url: string,
	password: string,
	createdAt = "2026-01-01T00:00:00.000Z",
) => ({
	registryId: name,
	registryName: name,
	registryUrl: url,
	username: `${name}-user`,
	password,
	imagePrefix: null,
	registryType: "cloud" as const,
	organizationId: "org-1",
	createdAt,
});

const gitlab = registry("GitLab", "registry.gitlab.com", "glpat-secret");
const ghcr = registry("GHCR", "ghcr.io", "ghp-secret");
const hub = registry("Docker Hub", "", "hub-secret");
const logPath = "/etc/dokploy/logs/app/deploy.log";

const findMany = vi.mocked(db.query.registry.findMany);
const localExec = vi.mocked(execAsync);
const localExecFile = vi.mocked(execFileAsync);
const remoteExec = vi.mocked(execAsyncRemote);

const loggedInHosts = () =>
	localExecFile.mock.calls.map((call) => (call[1] as string[])[1]);

describe("image registry hosts", () => {
	it.each([
		["postgres:16", "docker.io"],
		["library/postgres", "docker.io"],
		["myuser/app:1", "docker.io"],
		["docker.io/myuser/app", "docker.io"],
		["index.docker.io/myuser/app", "docker.io"],
		["registry.gitlab.com/group/project/app:1", "registry.gitlab.com"],
		["Registry.GitLab.com/group/app", "registry.gitlab.com"],
		["localhost:5000/app", "localhost:5000"],
		["localhost/app", "localhost"],
		["ghcr.io/org/app@sha256:abc", "ghcr.io"],
	])("%s pulls from %s", (image, host) => {
		expect(getImageRegistryHost(image)).toBe(host);
	});

	it.each([
		["", "docker.io"],
		["docker.io", "docker.io"],
		["registry-1.docker.io", "docker.io"],
		["https://registry.gitlab.com/", "registry.gitlab.com"],
		["Registry.GitLab.com", "registry.gitlab.com"],
		["localhost:5000", "localhost:5000"],
	])("registry URL %j is host %s", (url, host) => {
		expect(normalizeRegistryHost(url)).toBe(host);
	});

	it("collects the hosts of every service image", () => {
		const spec = {
			services: {
				app: { image: "registry.gitlab.com/group/app:1" },
				db: { image: "postgres:16" },
			},
		} as ComposeSpecification;

		expect(getComposeImageHosts(spec)).toEqual(
			new Set(["registry.gitlab.com", "docker.io"]),
		);
	});

	it.each([
		["no compose file", null],
		["no services", {}],
		["include", { include: ["other.yml"], services: { a: { image: "x" } } }],
		["build", { services: { a: { build: ".", image: "ghcr.io/o/a" } } }],
		["extends", { services: { a: { extends: "base", image: "x" } } }],
		["no image", { services: { a: {} } }],
		["variable image", { services: { a: { image: "${REGISTRY}/app" } } }],
	])("returns null (log in to all) when hosts are unknown: %s", (_, spec) => {
		expect(getComposeImageHosts(spec as ComposeSpecification | null)).toBe(
			null,
		);
	});
});

describe("loginOrganizationRegistries (#5565)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localExecFile.mockResolvedValue({ stdout: "", stderr: "" });
		remoteExec.mockResolvedValue({ stdout: "", stderr: "" });
		localExec.mockResolvedValue({ stdout: "", stderr: "" });
	});

	it("logs in on the Dokploy host with the password on stdin", async () => {
		findMany.mockResolvedValue([gitlab] as never);

		await loginOrganizationRegistries("org-1", null, logPath, null);

		expect(localExecFile).toHaveBeenCalledWith(
			"docker",
			[
				"login",
				"registry.gitlab.com",
				"--username",
				"GitLab-user",
				"--password-stdin",
			],
			{ input: "glpat-secret" },
		);
		expect(localExec).not.toHaveBeenCalled();
	});

	it("logs in on a remote server without putting the password in the command", async () => {
		findMany.mockResolvedValue([gitlab] as never);

		await loginOrganizationRegistries("org-1", "server-1", logPath, null);

		expect(localExecFile).not.toHaveBeenCalled();
		expect(remoteExec).toHaveBeenCalledWith(
			"server-1",
			"docker login 'registry.gitlab.com' --username 'GitLab-user' --password-stdin",
			undefined,
			"glpat-secret",
		);
	});

	it("only logs in to registries the compose images pull from", async () => {
		findMany.mockResolvedValue([gitlab, ghcr, hub] as never);

		await loginOrganizationRegistries(
			"org-1",
			null,
			logPath,
			new Set(["registry.gitlab.com"]),
		);

		expect(loggedInHosts()).toEqual(["registry.gitlab.com"]);
	});

	it("matches Docker Hub images to a registry with an empty URL", async () => {
		findMany.mockResolvedValue([gitlab, hub] as never);

		await loginOrganizationRegistries(
			"org-1",
			null,
			logPath,
			new Set(["docker.io"]),
		);

		expect(loggedInHosts()).toEqual([""]);
	});

	it("does nothing when no registry matches the images", async () => {
		findMany.mockResolvedValue([gitlab, ghcr] as never);

		await loginOrganizationRegistries(
			"org-1",
			null,
			logPath,
			new Set(["quay.io"]),
		);

		expect(localExecFile).not.toHaveBeenCalled();
		expect(localExec).not.toHaveBeenCalled();
	});

	it("logs in to every registry when the images are unknown", async () => {
		findMany.mockResolvedValue([gitlab, ghcr, hub] as never);

		await loginOrganizationRegistries("org-1", null, logPath, null);

		expect(loggedInHosts()).toEqual(["registry.gitlab.com", "ghcr.io", ""]);
	});

	it("uses the newest registry when several share a host", async () => {
		const newer = registry(
			"GitLab new",
			"registry.gitlab.com",
			"glpat-new",
			"2026-06-01T00:00:00.000Z",
		);
		findMany.mockResolvedValue([newer, gitlab] as never);

		await loginOrganizationRegistries("org-1", null, logPath, null);

		expect(localExecFile).toHaveBeenCalledTimes(1);
		expect(localExecFile.mock.calls[0]?.[2]).toEqual({ input: "glpat-new" });
	});

	it("writes the reason to the deploy log without the password and continues", async () => {
		findMany.mockResolvedValue([gitlab, ghcr] as never);
		localExecFile.mockRejectedValueOnce(
			new Error("unauthorized: bad token glpat-secret"),
		);

		await loginOrganizationRegistries("org-1", null, logPath, null);

		expect(localExec).toHaveBeenCalledTimes(1);
		expect(localExec.mock.calls[0]?.[0]).toBe(
			`echo '⚠️ Could not log in to registry GitLab: unauthorized: bad token ***' >> '${logPath}'`,
		);
		expect(loggedInHosts()).toEqual(["registry.gitlab.com", "ghcr.io"]);
	});

	it("keeps Docker's reason from a remote failure without the password", async () => {
		findMany.mockResolvedValue([gitlab] as never);
		remoteExec.mockRejectedValueOnce(
			new ExecError("Remote command failed with exit code 1", {
				command: "docker login",
				stderr:
					"Error response from daemon: unauthorized: HTTP Basic: Access denied for glpat-secret\n",
				exitCode: 1,
				serverId: "server-1",
			}),
		);

		await loginOrganizationRegistries("org-1", "server-1", logPath, null);

		expect(remoteExec).toHaveBeenLastCalledWith(
			"server-1",
			`echo '⚠️ Could not log in to registry GitLab: Remote command failed with exit code 1. Stderr: Error response from daemon: unauthorized: HTTP Basic: Access denied for ***' >> '${logPath}'`,
		);
	});

	it("does not fail the deploy when the warning cannot be written", async () => {
		findMany.mockResolvedValue([gitlab] as never);
		remoteExec
			.mockRejectedValueOnce(new Error("login failed"))
			.mockRejectedValueOnce(new Error("ssh down"));

		await expect(
			loginOrganizationRegistries("org-1", "server-1", logPath, null),
		).resolves.toBeUndefined();
	});

	it("does nothing when the organization has no registries", async () => {
		findMany.mockResolvedValue([]);

		await loginOrganizationRegistries("org-1", null, logPath, null);

		expect(localExecFile).not.toHaveBeenCalled();
		expect(remoteExec).not.toHaveBeenCalled();
		expect(localExec).not.toHaveBeenCalled();
	});
});
