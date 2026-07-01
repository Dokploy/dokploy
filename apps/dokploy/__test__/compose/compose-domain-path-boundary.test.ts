import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
	paths: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: mocks.paths,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { loadDockerComposeRemote } = await import(
	"@dokploy/server/utils/docker/domain"
);

const composeFixture = {
	appName: "compose-one",
	composeId: "compose-1",
	composePath: "deploy/docker compose.yml",
	serverId: "server-1",
	sourceType: "github",
};

describe("remote compose path boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.paths.mockReturnValue({
			COMPOSE_PATH: "/srv/dokploy/compose",
		});
		mocks.execAsyncRemote.mockResolvedValue({
			stdout: "services: {}",
			stderr: "",
		});
	});

	it("quotes normalized remote compose paths before shell execution", async () => {
		await expect(
			loadDockerComposeRemote(composeFixture as never),
		).resolves.toEqual({ services: {} });

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			"cat '/srv/dokploy/compose/compose-one/code/deploy/docker compose.yml'",
		);
	});

	it("rejects unsafe remote compose paths before shell execution", async () => {
		await expect(
			loadDockerComposeRemote({
				...composeFixture,
				composePath: "../docker-compose.yml",
			} as never),
		).rejects.toThrow("Invalid file path");

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});
});
