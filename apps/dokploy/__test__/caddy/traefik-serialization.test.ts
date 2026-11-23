import { writeTraefikSetup } from "@dokploy/server/services/settings";
import {
	recordCaddySwitch,
	withCaddyQueue,
} from "@dokploy/server/utils/caddy/sync";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	assertTraefikProvider: vi.fn(async (_serverId?: string) => undefined),
	getWebServerProvider: vi.fn(async () => "traefik"),
	restoreInterruptedTraefik: vi.fn(),
	initializeStandaloneTraefik: vi.fn(async (): Promise<void> => {}),
	execAsyncRemote: vi.fn(async () => ({ stdout: "standalone", stderr: "" })),
}));

vi.mock("@dokploy/server/services/web-server-settings", async (original) => ({
	...(await original<
		typeof import("@dokploy/server/services/web-server-settings")
	>()),
	assertTraefikProvider: mocks.assertTraefikProvider,
	getWebServerProvider: mocks.getWebServerProvider,
}));
vi.mock("@dokploy/server/setup/traefik-setup", async (original) => ({
	...(await original<typeof import("@dokploy/server/setup/traefik-setup")>()),
	restoreInterruptedTraefik: mocks.restoreInterruptedTraefik,
	initializeStandaloneTraefik: mocks.initializeStandaloneTraefik,
}));
vi.mock("@dokploy/server/utils/process/execAsync", async (original) => ({
	...(await original<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsyncRemote: mocks.execAsyncRemote,
}));

const serverId = "serialization-test";
beforeEach(() => {
	vi.clearAllMocks();
	mocks.assertTraefikProvider.mockResolvedValue(undefined);
	recordCaddySwitch(serverId, {
		target: "traefik",
		status: "done",
		message: "",
	});
});

it("refuses a recreate while a switch is in its preflight", async () => {
	recordCaddySwitch(serverId, {
		target: "caddy",
		status: "running",
		message: "",
	});
	await expect(writeTraefikSetup({ serverId })).rejects.toThrow(
		"switch is running",
	);
	expect(mocks.restoreInterruptedTraefik).not.toHaveBeenCalled();
});

it("checks the provider after queued work completes", async () => {
	let release = () => {};
	const held = withCaddyQueue(
		serverId,
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			}),
	);
	await Promise.resolve();
	const recreate = writeTraefikSetup({ serverId });
	expect(mocks.assertTraefikProvider).not.toHaveBeenCalled();
	mocks.assertTraefikProvider.mockRejectedValueOnce(
		new Error("This server runs Caddy"),
	);
	release();
	await held;
	await expect(recreate).rejects.toThrow("This server runs Caddy");
	expect(mocks.restoreInterruptedTraefik).not.toHaveBeenCalled();
});

it("holds the shared queue until the Traefik recreate completes", async () => {
	let finish = () => {};
	mocks.initializeStandaloneTraefik.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const recreate = writeTraefikSetup({ serverId });
	await vi.waitFor(() =>
		expect(mocks.initializeStandaloneTraefik).toHaveBeenCalled(),
	);
	const switched = vi.fn(async () => undefined);
	const later = withCaddyQueue(serverId, switched);
	await Promise.resolve();
	expect(switched).not.toHaveBeenCalled();
	finish();
	await recreate;
	await later;
	expect(switched).toHaveBeenCalledOnce();
});
