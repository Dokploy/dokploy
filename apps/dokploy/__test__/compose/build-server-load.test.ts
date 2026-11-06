import type { Compose } from "@dokploy/server/services/compose";
import {
	addDomainToCompose,
	hasBuildableServices,
	loadDockerComposeRemote,
	readDockerComposeRemote,
} from "@dokploy/server/utils/docker/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execAsyncRemote } = vi.hoisted(() => ({ execAsyncRemote: vi.fn() }));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return { ...actual, execAsyncRemote };
});

vi.mock("@dokploy/server/db", () => ({
	db: { query: { patch: { findMany: vi.fn().mockResolvedValue([]) } } },
}));

const anchorYaml = `
x-app: &app
  build:
    context: .
    dockerfile: Dockerfile
    args:
      BUILD_SHA: \${BUILD_SHA:-}
  image: tailormadecrm-client:local
services:
  db:
    image: postgres:17-alpine
  migrate:
    <<: *app
  app:
    <<: *app
  worker:
    <<: *app
`;

const compose = {
	composeId: "compose-id",
	appName: "tmcrm-dev",
	composeType: "docker-compose",
	composePath: "./compose.yaml",
	sourceType: "github",
	serverId: "build-server",
	isolatedDeployment: false,
	isolatedDeploymentsVolume: false,
	randomize: false,
	suffix: "",
} as unknown as Compose;

describe("loading the compose file from a build server", () => {
	beforeEach(() => {
		execAsyncRemote.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("detects build: inherited through merge anchors", async () => {
		execAsyncRemote.mockResolvedValue({ stdout: anchorYaml, stderr: "" });

		const spec = await addDomainToCompose(compose, []);

		expect(hasBuildableServices(spec)).toBe(true);
		expect(spec?.services?.migrate?.build).toBeDefined();
		expect(spec?.services?.app?.build).toBeDefined();
		expect(spec?.services?.worker?.build).toBeDefined();
		expect(spec?.services?.db?.build).toBeUndefined();
	});

	it("ignores stderr when the command succeeded", async () => {
		execAsyncRemote.mockResolvedValue({
			stdout: anchorYaml,
			stderr: "Warning: Permanently added 'host' to the list of known hosts.",
		});

		const spec = await readDockerComposeRemote(compose);

		expect(hasBuildableServices(spec)).toBe(true);
	});

	it("reports a failed read with the reason instead of returning null", async () => {
		execAsyncRemote.mockRejectedValue(
			new Error("Remote command failed with exit code 1"),
		);

		await expect(addDomainToCompose(compose, [])).rejects.toThrow(
			/Could not read the compose file .*compose\.yaml.*exit code 1/,
		);
	});

	it("reports an empty file", async () => {
		execAsyncRemote.mockResolvedValue({ stdout: "  \n", stderr: "" });

		await expect(addDomainToCompose(compose, [])).rejects.toThrow(/is empty/);
	});

	it("reports invalid YAML", async () => {
		execAsyncRemote.mockResolvedValue({
			stdout: "services:\n  app: [unclosed",
			stderr: "",
		});

		await expect(addDomainToCompose(compose, [])).rejects.toThrow(
			/Could not parse the compose file/,
		);
	});

	it("reports a file that is not a mapping", async () => {
		execAsyncRemote.mockResolvedValue({ stdout: "just a string", stderr: "" });

		await expect(addDomainToCompose(compose, [])).rejects.toThrow(
			/not a YAML mapping/,
		);
	});

	it("keeps loadDockerComposeRemote lenient but logs the reason", async () => {
		execAsyncRemote.mockRejectedValue(new Error("ssh down"));

		expect(await loadDockerComposeRemote(compose)).toBeNull();
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("ssh down"),
		);
	});

	it("only reports no buildable services for a file that loaded", async () => {
		execAsyncRemote.mockResolvedValue({
			stdout: "services:\n  db:\n    image: postgres:17\n",
			stderr: "",
		});

		const spec = await addDomainToCompose(compose, []);

		expect(spec).not.toBeNull();
		expect(hasBuildableServices(spec)).toBe(false);
	});
});
