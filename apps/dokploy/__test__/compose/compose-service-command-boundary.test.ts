import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateChain = () => ({
	set: vi.fn(() => ({
		where: vi.fn(() => ({
			returning: vi.fn(async () => [composeFixture]),
		})),
	})),
});

const mocks = vi.hoisted(() => ({
	composeFindFirst: vi.fn(),
	dbUpdate: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	paths: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: mocks.paths,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			compose: {
				findFirst: mocks.composeFindFirst,
			},
		},
		update: mocks.dbUpdate,
	},
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	ExecError: class ExecError extends Error {},
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { writeDomainsToCompose } = await import(
	"@dokploy/server/utils/docker/domain"
);
const { removeCompose, startCompose, stopCompose } = await import(
	"@dokploy/server/services/compose"
);

const composeFixture = {
	appName: "compose-one",
	composeId: "compose-1",
	composePath: "deploy/docker compose.yml",
	composeType: "docker-compose",
	serverId: "server-1",
	sourceType: "github",
};

describe("compose service command boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.paths.mockReturnValue({
			COMPOSE_PATH: "/srv/dokploy/compose",
		});
		mocks.composeFindFirst.mockResolvedValue(composeFixture);
		mocks.dbUpdate.mockReturnValue(updateChain());
		mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	});

	it("rejects unsafe compose paths before start commands", async () => {
		mocks.composeFindFirst.mockResolvedValue({
			...composeFixture,
			composePath: "deploy/docker-compose.yml; touch /tmp/pwn",
		});

		await expect(startCompose("compose-1")).rejects.toThrow(
			"Invalid file path",
		);

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("quotes compose paths in remote start commands", async () => {
		await expect(startCompose("compose-1")).resolves.toBe(true);

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			"cd /srv/dokploy/compose/compose-one/code && env -i PATH=\"$PATH\" docker compose -p compose-one -f 'deploy/docker compose.yml' up -d",
		);
	});

	it("quotes stored compose app names in stop and remove commands", async () => {
		mocks.composeFindFirst.mockResolvedValue({
			...composeFixture,
			appName: "compose;id",
		});

		await expect(stopCompose("compose-1")).resolves.toBe(true);
		const stopCommand = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		expect(stopCommand).toContain("docker compose -p compose\\;id stop");

		vi.clearAllMocks();
		mocks.paths.mockReturnValue({
			COMPOSE_PATH: "/srv/dokploy/compose",
		});
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });

		await expect(
			removeCompose(
				{
					...composeFixture,
					appName: "compose;id",
				} as never,
				true,
			),
		).resolves.toBe(true);
		const command = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		expect(command).toContain("docker network disconnect compose\\;id");
		expect(command).toContain("docker compose -p compose\\;id down --volumes");
		expect(command).toContain("rm -rf -- /srv/dokploy/compose/compose\\;id");
	});

	it("quotes compose domain error messages before returning shell commands", async () => {
		mocks.execAsyncRemote.mockResolvedValueOnce({
			stdout: "services: {}\n",
			stderr: "",
		});
		const tempDir = mkdtempSync(join(tmpdir(), "dokploy-domain-error-"));
		const hostMarker = join(tempDir, "host-pwn");
		const serviceMarker = join(tempDir, "service-pwn");

		const command = await writeDomainsToCompose(
			composeFixture as never,
			[
				{
					host: `app"; touch ${hostMarker}; echo "'`,
					serviceName: `web"; touch ${serviceMarker}; echo "'`,
				},
			] as never,
		);

		try {
			execFileSync("sh", ["-c", command], { stdio: "ignore" });
		} catch {
			// The generated command intentionally exits 1 after printing the error.
		}

		try {
			expect(command).toContain("Has occurred an error:");
			expect(command).toContain("touch");
			expect(existsSync(hostMarker)).toBe(false);
			expect(existsSync(serviceMarker)).toBe(false);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
