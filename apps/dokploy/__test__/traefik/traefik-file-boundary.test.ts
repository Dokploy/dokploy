import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	paths: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: mocks.paths,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { readConfigInPath, writeTraefikConfigInPath, writeTraefikConfigRemote } =
	await import("@dokploy/server/utils/traefik/application");

describe("Traefik file path boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.paths.mockImplementation((remote?: boolean) => ({
			DYNAMIC_TRAEFIK_PATH: remote
				? "/etc/dokploy/traefik/dynamic"
				: "/var/lib/dokploy/traefik/dynamic",
			MAIN_TRAEFIK_PATH: remote
				? "/etc/dokploy/traefik"
				: "/var/lib/dokploy/traefik",
		}));
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "http: {}\n" });
	});

	it("rejects local reads outside MAIN_TRAEFIK_PATH", async () => {
		await expect(
			readConfigInPath("/var/lib/dokploy/applications/app/.env"),
		).rejects.toThrow("Invalid Traefik config path");
	});

	it("rejects local writes outside MAIN_TRAEFIK_PATH", async () => {
		await expect(
			writeTraefikConfigInPath(
				"/var/lib/dokploy/applications/app/.env",
				"SECRET=value",
			),
		).rejects.toThrow("Invalid Traefik config path");
	});

	it("rejects remote reads outside the remote MAIN_TRAEFIK_PATH", async () => {
		await expect(
			readConfigInPath("/etc/dokploy/applications/app/.env", "server-1"),
		).rejects.toThrow("Invalid Traefik config path");

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("rejects remote writes outside the remote MAIN_TRAEFIK_PATH", async () => {
		await expect(
			writeTraefikConfigInPath(
				"/etc/dokploy/applications/app/.env",
				"SECRET=value",
				"server-1",
			),
		).rejects.toThrow("Invalid Traefik config path");

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("quotes remote Traefik file paths before shell execution", async () => {
		const remotePath = "/etc/dokploy/traefik/dynamic/app'$(id).yml";

		await expect(readConfigInPath(remotePath, "server-1")).resolves.toBe(
			"http: {}\n",
		);

		expect(mocks.execAsyncRemote).toHaveBeenLastCalledWith(
			"server-1",
			`cat "/etc/dokploy/traefik/dynamic/app'\\$(id).yml"`,
		);

		await writeTraefikConfigInPath(remotePath, "http: {}", "server-1");

		const writeCommand = mocks.execAsyncRemote.mock.calls.at(-1)?.[1];
		expect(writeCommand).toContain(
			`base64 -d > "/etc/dokploy/traefik/dynamic/app'\\$(id).yml"`,
		);
	});

	it("writes remote Traefik YAML as encoded data instead of raw shell text", async () => {
		await writeTraefikConfigRemote(
			{
				http: {
					middlewares: {
						"redirect-app-1": {
							redirectRegex: {
								regex: "Host(`example.com`)'; touch /tmp/pwn #",
								replacement: "https://example.com/$1$(id)",
								permanent: true,
							},
						},
					},
				},
			},
			"middlewares",
			"server-1",
		);

		const writeCommand = mocks.execAsyncRemote.mock.calls.at(-1)?.[1] as string;
		expect(writeCommand).toMatch(
			/^echo "[A-Za-z0-9+/=]+" \| base64 -d > \/etc\/dokploy\/traefik\/dynamic\/middlewares\.yml$/,
		);
		expect(writeCommand).not.toContain("echo '");
		expect(writeCommand).not.toContain("touch /tmp/pwn");
		expect(writeCommand).not.toContain("$(id)");

		const encodedPayload = writeCommand.match(/^echo "([^"]+)"/)?.[1] ?? "";
		const decodedPayload = Buffer.from(encodedPayload, "base64").toString(
			"utf8",
		);
		expect(decodedPayload).toContain("touch /tmp/pwn");
		expect(decodedPayload).toContain("$(id)");
	});

	it("quotes remote Traefik YAML destination paths before shell execution", async () => {
		await writeTraefikConfigRemote(
			{ http: { middlewares: {} } },
			"middlewares'$(id)",
			"server-1",
		);

		const writeCommand = mocks.execAsyncRemote.mock.calls.at(-1)?.[1] as string;
		expect(writeCommand).toContain(
			`base64 -d > "/etc/dokploy/traefik/dynamic/middlewares'\\$(id).yml"`,
		);
		expect(writeCommand).not.toContain(
			"> /etc/dokploy/traefik/dynamic/middlewares'$(id).yml",
		);
	});
});
