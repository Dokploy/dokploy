import {
	type Application,
	findApplicationById,
	updateApplication,
} from "@dokploy/server/services/application";
import { type Domain, updateDomainById } from "@dokploy/server/services/domain";
import { findPreviewDeploymentById } from "@dokploy/server/services/preview-deployment";
import { findServerById } from "@dokploy/server/services/server";
import { transferService } from "@dokploy/server/services/transfer";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { pipeBetweenServers } from "@dokploy/server/utils/process/remoteStream";
import {
	manageDomain,
	reconcileSwarmVipConnectionReuse,
} from "@dokploy/server/utils/traefik/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const protocol = vi.hoisted(() => {
	const chain = {
		set: () => chain,
		where: () => chain,
		returning: vi.fn(),
	};
	return {
		chain,
		findFirst: vi.fn(),
		previewFirst: vi.fn(),
		domainFirst: vi.fn(),
		update: vi.fn(() => chain),
		events: [] as string[],
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: { findFirst: protocol.findFirst },
			previewDeployments: { findFirst: protocol.previewFirst },
			domains: { findFirst: protocol.domainFirst },
		},
		update: protocol.update,
	},
	dbUrl: "postgres://mock:mock@localhost:5432/mock",
}));
vi.mock("@dokploy/server/services/application", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/application")
	>()),
	findApplicationById: vi.fn(),
}));
vi.mock(
	"@dokploy/server/services/preview-deployment",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/services/preview-deployment")
		>()),
		findPreviewDeploymentById: vi.fn(),
	}),
);
vi.mock("@dokploy/server/services/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/services/server")>()),
	findServerById: vi.fn(),
}));
vi.mock("@dokploy/server/utils/traefik/domain", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/traefik/domain")
	>()),
	manageDomain: vi.fn(),
	reconcileSwarmVipConnectionReuse: vi.fn(),
}));
vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));
vi.mock("@dokploy/server/utils/process/remoteStream", () => ({
	pipeBetweenServers: vi.fn(),
}));

const previous = {
	appName: "primary",
	serverId: "source",
	swarmVipConnectionReuse: true,
} satisfies Pick<
	Application,
	"appName" | "serverId" | "swarmVipConnectionReuse"
>;
const previews = [{ appName: "preview-one" }, { appName: "preview-two" }];
const reconcile = vi.mocked(reconcileSwarmVipConnectionReuse);

beforeEach(() => {
	vi.resetAllMocks();
	protocol.events.length = 0;
	protocol.findFirst.mockResolvedValue({
		...previous,
		previewDeployments: previews,
	});
	protocol.update.mockImplementation(() => {
		protocol.events.push("db.update");
		return protocol.chain;
	});
	protocol.chain.returning.mockResolvedValue([{ applicationId: "app" }]);
	reconcile.mockImplementation(async ({ appName, swarmVipConnectionReuse }) => {
		await Promise.resolve();
		protocol.events.push(`${appName}:${swarmVipConnectionReuse}`);
	});
	vi.mocked(findApplicationById, { partial: true }).mockResolvedValue(previous);
});

describe("application connection-reuse saves", () => {
	it.each([false, true])(
		"reconciles every explicit %s save before persistence, even if unchanged",
		async (value) => {
			protocol.findFirst.mockResolvedValue({
				...previous,
				swarmVipConnectionReuse: value,
				previewDeployments: previews,
			});

			await updateApplication("app", { swarmVipConnectionReuse: value });

			expect(protocol.events).toEqual([
				`primary:${value}`,
				`preview-one:${value}`,
				`preview-two:${value}`,
				"db.update",
			]);
			for (const appName of [
				previous.appName,
				...previews.map((item) => item.appName),
			]) {
				expect(reconcile).toHaveBeenCalledWith({
					appName,
					serverId: "source",
					swarmVipConnectionReuse: value,
				});
			}
		},
	);

	it.each(["preview", "database"])(
		"can restore stored true after a failed %s step",
		async (step) => {
			const failure = new Error(`${step} unavailable`);
			if (step === "preview") {
				reconcile.mockImplementation(
					async ({ appName, swarmVipConnectionReuse }) => {
						if (appName === "preview-one" && !swarmVipConnectionReuse)
							throw failure;
					},
				);
			} else {
				protocol.chain.returning.mockRejectedValueOnce(failure);
			}

			await expect(
				updateApplication("app", { swarmVipConnectionReuse: false }),
			).rejects.toBe(failure);
			expect(reconcile).toHaveBeenCalledWith({
				appName: "primary",
				serverId: "source",
				swarmVipConnectionReuse: false,
			});
			expect(protocol.update).toHaveBeenCalledTimes(step === "preview" ? 0 : 1);
			if (step === "database") expect(reconcile).toHaveBeenCalledTimes(3);

			protocol.events.length = 0;
			reconcile.mockImplementation(
				async ({ appName, swarmVipConnectionReuse }) => {
					await Promise.resolve();
					protocol.events.push(`${appName}:${swarmVipConnectionReuse}`);
				},
			);
			await updateApplication("app", { swarmVipConnectionReuse: true });
			expect(protocol.events).toEqual([
				"primary:true",
				"preview-one:true",
				"preview-two:true",
				"db.update",
			]);
		},
	);
});

describe("domain routes are applied before persistence", () => {
	it.each(["application", "preview"] as const)(
		"does not persist a %s domain when route validation fails",
		async (kind) => {
			const changedDomain = {
				domainId: "domain",
				enabled: true,
				forwardAuthEnabled: true,
				applicationId: kind === "application" ? "app" : null,
				previewDeploymentId: kind === "preview" ? "preview" : null,
			} satisfies Partial<Domain>;
			protocol.domainFirst.mockResolvedValue({
				...changedDomain,
				enabled: false,
				forwardAuthEnabled: false,
			});
			protocol.findFirst.mockResolvedValue({
				...previous,
				swarmVipConnectionReuse: false,
			});
			protocol.previewFirst.mockResolvedValue({
				applicationId: "app",
				appName: "preview-one",
			});
			vi.mocked(findApplicationById, { partial: true }).mockResolvedValue({
				...previous,
				swarmVipConnectionReuse: false,
			});
			vi.mocked(findPreviewDeploymentById, { partial: true }).mockResolvedValue(
				{
					applicationId: "app",
					appName: "preview-one",
				},
			);
			const failure = new Error("Traefik FastProxy prevents this route update");
			vi.mocked(manageDomain).mockRejectedValue(failure);

			await expect(
				updateDomainById("domain", {
					enabled: true,
					forwardAuthEnabled: true,
				}),
			).rejects.toBe(failure);
			expect(protocol.update).not.toHaveBeenCalled();
			expect(manageDomain).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					appName: kind === "application" ? "primary" : "preview-one",
					serverId: "source",
					swarmVipConnectionReuse: false,
				}),
				changedDomain,
			);
		},
	);
});

it("rejects transferring an opted-out application to FastProxy before stopping, copying or changing status/server", async () => {
	type FoundApplication = Awaited<ReturnType<typeof findApplicationById>>;
	vi.mocked(findApplicationById, { partial: true }).mockResolvedValue({
		...previous,
		applicationId: "app",
		swarmVipConnectionReuse: false,
		environment: {
			project: { organizationId: "org" },
		} as FoundApplication["environment"],
	});
	vi.mocked(findServerById, { partial: true }).mockResolvedValue({
		serverId: "target",
		organizationId: "org",
		serverStatus: "active",
		serverType: "deploy",
	});
	vi.mocked(execAsyncRemote).mockImplementation(async (serverId, command) => {
		if (serverId !== "target") throw new Error("Source must remain untouched");
		return {
			stdout: command.startsWith("docker ps")
				? "traefik-container"
				: JSON.stringify({ experimental: { fastProxy: {} } }),
			stderr: "",
		};
	});

	await expect(
		transferService(
			{
				serviceType: "application",
				serviceId: "app",
				targetServerId: "target",
				organizationId: "org",
				removeSourceData: false,
			},
			vi.fn(),
		),
	).rejects.toThrow(/FastProxy/);

	expect(execAsyncRemote).toHaveBeenCalledWith(
		"target",
		expect.stringContaining("docker ps"),
	);
	expect(execAsyncRemote).toHaveBeenCalledWith(
		"target",
		expect.stringContaining("docker exec"),
	);
	expect(
		vi
			.mocked(execAsyncRemote)
			.mock.calls.every(([serverId]) => serverId === "target"),
	).toBe(true);
	expect(execAsync).not.toHaveBeenCalled();
	expect(pipeBetweenServers).not.toHaveBeenCalled();
	expect(protocol.update).not.toHaveBeenCalled();
});
