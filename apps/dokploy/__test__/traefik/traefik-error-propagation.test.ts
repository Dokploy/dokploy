import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import { WriteFileRemoteError } from "@dokploy/server/utils/process/execAsync";
import {
	loadOrCreateConfigRemote,
	writeTraefikConfig,
	writeTraefikConfigRemote,
} from "@dokploy/server/utils/traefik/application";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
	writeFileRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return {
		...actual,
		execAsyncRemote: mocks.execAsyncRemote,
		writeFileRemote: mocks.writeFileRemote,
	};
});

describe("traefik config error propagation", () => {
	let cwd: string;
	const sampleConfig = {
		http: {
			routers: {
				"app-router-1": {
					rule: "Host(`app.example.com`)",
					service: "app-service-1",
				},
			},
			services: {},
		},
	};

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-traefik-err-"));
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("propagates remote write failures from writeTraefikConfigRemote", async () => {
		const remoteError = new WriteFileRemoteError("SSH connection error", {
			remotePath: "/etc/dokploy/traefik/dynamic/my-app.yml",
			serverId: "server-1",
			originalError: new Error("ECONNREFUSED"),
		});
		mocks.writeFileRemote.mockRejectedValue(remoteError);
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		await expect(
			writeTraefikConfigRemote(sampleConfig, "my-app", "server-1"),
		).rejects.toThrow("SSH connection error");

		consoleErrorSpy.mockRestore();
	});

	it("propagates local write failures from writeTraefikConfig", () => {
		// `.docker/traefik/dynamic` directory does not exist in tmp cwd, so writeFileSync throws ENOENT.
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		expect(() => writeTraefikConfig(sampleConfig, "my-app")).toThrow();

		consoleErrorSpy.mockRestore();
	});

	it("returns an empty config when loadOrCreateConfigRemote encounters a missing file", async () => {
		mocks.execAsyncRemote.mockRejectedValue(
			new ExecError("Remote command failed with exit code 1", {
				command: "cat '/etc/dokploy/traefik/dynamic/missing-app.yml'",
				exitCode: 1,
				stderr:
					"cat: /etc/dokploy/traefik/dynamic/missing-app.yml: No such file or directory",
				serverId: "server-1",
			}),
		);

		const config = await loadOrCreateConfigRemote("server-1", "missing-app");
		expect(config).toEqual({ http: { routers: {}, services: {} } });
	});

	it("propagates SSH errors from loadOrCreateConfigRemote instead of returning empty config", async () => {
		mocks.execAsyncRemote.mockRejectedValue(
			new ExecError("SSH connection error: connect ETIMEDOUT", {
				command: "cat '/etc/dokploy/traefik/dynamic/my-app.yml'",
				serverId: "server-1",
			}),
		);

		await expect(
			loadOrCreateConfigRemote("server-1", "my-app"),
		).rejects.toThrow("SSH connection error");
	});
});
