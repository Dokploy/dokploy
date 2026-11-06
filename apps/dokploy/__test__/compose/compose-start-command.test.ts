import { startCompose } from "@dokploy/server/services/compose";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();

vi.mock("@dokploy/server/db", () => {
	const chain: any = {
		set: vi.fn(() => chain),
		where: vi.fn(() => chain),
		returning: vi.fn().mockResolvedValue([{}]),
	};
	return {
		db: {
			update: vi.fn(() => chain),
			query: { compose: { findFirst: (...args: any[]) => findFirst(...args) } },
		},
	};
});

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	ExecError: class ExecError extends Error {},
}));

const baseCompose = {
	composeId: "compose-id",
	appName: "compose-app",
	composeType: "docker-compose",
	sourceType: "git",
	composePath: "compose.yaml",
	command: "",
	serverId: null,
	mounts: [],
	domains: [],
};

describe("startCompose", () => {
	beforeEach(() => {
		vi.mocked(execAsync).mockReset();
		findFirst.mockReset();
	});

	it("starts with only the compose path when there is no custom command", async () => {
		findFirst.mockResolvedValue(baseCompose);

		await startCompose("compose-id");

		expect(vi.mocked(execAsync).mock.calls[0]?.[0]).toBe(
			'env -i PATH="$PATH" docker compose -p compose-app -f compose.yaml up -d',
		);
	});

	it("starts with the custom command, so its extra compose files are kept", async () => {
		findFirst.mockResolvedValue({
			...baseCompose,
			command:
				"compose -f compose.yaml -f compose.override-prod.yaml up -d --remove-orphans",
		});

		await startCompose("compose-id");

		expect(vi.mocked(execAsync).mock.calls[0]?.[0]).toBe(
			'env -i PATH="$PATH" docker compose -f compose.yaml -f compose.override-prod.yaml up -d --remove-orphans',
		);
	});

	it("rejects a custom command with shell control characters, like deploy", async () => {
		findFirst.mockResolvedValue({
			...baseCompose,
			command: "compose up -d; touch /tmp/x",
		});

		await expect(startCompose("compose-id")).rejects.toThrow(
			"Invalid characters in compose command",
		);
		expect(execAsync).not.toHaveBeenCalled();
	});
});
