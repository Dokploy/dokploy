import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {},
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { readDirectory } = await import("@dokploy/server/services/settings");

describe("remote Traefik directory listing", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the JSON tree locally from NUL-delimited remote output", async () => {
		const remoteOutput = [
			"dynamic\td",
			"dynamic/evil`) || Host(`attacker.example.yml\tf",
			"dokploy.yml\tf",
			"",
		].join("\0");
		mocks.execAsyncRemote.mockResolvedValue({
			stdout: Buffer.from(remoteOutput, "utf8").toString("base64"),
			stderr: "",
		});

		const result = await readDirectory("/etc/dokploy/traefik", "server-1");

		expect(result).toEqual([
			{
				id: "/etc/dokploy/traefik/dynamic",
				name: "dynamic",
				type: "directory",
				children: [
					{
						id: "/etc/dokploy/traefik/dynamic/evil`) || Host(`attacker.example.yml",
						name: "evil`) || Host(`attacker.example.yml",
						type: "file",
					},
				],
			},
			{
				id: "/etc/dokploy/traefik/dokploy.yml",
				name: "dokploy.yml",
				type: "file",
			},
		]);

		const command = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		expect(command).toContain('find "$root_dir" -mindepth 1');
		expect(command).not.toContain("eval");
		expect(command).not.toContain("evil`) || Host(`attacker.example.yml");
	});
});
