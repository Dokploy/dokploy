import {
	type Application,
	updateApplication,
} from "@dokploy/server/services/application";
import { reconcileSwarmVipConnectionReuse } from "@dokploy/server/utils/traefik/domain";
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
		update: vi.fn(() => chain),
		events: [] as string[],
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: { findFirst: protocol.findFirst },
		},
		update: protocol.update,
	},
	dbUrl: "postgres://mock:mock@localhost:5432/mock",
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	reconcileSwarmVipConnectionReuse: vi.fn(),
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
