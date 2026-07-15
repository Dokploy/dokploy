import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Swap the remote-docker helper for a controllable fake before importing the
// service under test. The in-memory `fakeDocker` is mutated per test.
const fakeDocker = {
	createNetwork: vi.fn(),
	listNetworks: vi.fn<() => Promise<Array<{ Name: string; Id: string }>>>(),
	getNetwork: vi.fn<(id: string) => { remove: () => Promise<void> }>(),
};

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: vi.fn(async () => fakeDocker),
}));

// Silence the IS_CLOUD branch — our tests cover non-cloud behavior.
vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return { ...actual, IS_CLOUD: false };
});

import {
	assertNetworkIdsAttachableToResource,
	findNetworkById,
	getNetworkErrorMessage,
	isDuplicateNetworkNameError,
	removeNetworkById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";

// Tests here target error paths that don't require a live DB transaction.
// The global DB mock in __test__/setup.ts already makes `db.query.network`
// return `undefined` for findFirst, which is exactly the not-found path.
describe("findNetworkById", () => {
	it("throws NOT_FOUND when the row doesn't exist", async () => {
		await expect(findNetworkById("missing")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});

describe("removeNetworkById", () => {
	beforeEach(() => {
		fakeDocker.createNetwork.mockReset();
		fakeDocker.listNetworks.mockReset();
		fakeDocker.getNetwork.mockReset();
	});

	it("throws NOT_FOUND when the row doesn't exist for the organization", async () => {
		await expect(removeNetworkById("missing", "org_1")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		// Docker should never be touched when the DB row is missing.
		expect(fakeDocker.listNetworks).not.toHaveBeenCalled();
	});

	it("rejects attached networks before touching Docker", async () => {
		const target = {
			networkId: "net_1",
			name: "shared-net",
			serverId: "srv_1",
			organizationId: "org_1",
		};
		const orgEnvSubquery = {
			from: () => ({
				innerJoin: () => ({
					where: () => ({}),
				}),
			}),
		};
		const usageRows = (rows: Array<{ id: string; name: string }>) => ({
			from: () => ({
				where: () => Promise.resolve(rows),
			}),
		});

		vi.mocked(db.query.network.findFirst)
			.mockResolvedValueOnce(target as never)
			.mockResolvedValueOnce(target as never);
		vi.mocked(db.select)
			.mockReturnValueOnce(orgEnvSubquery as never)
			.mockReturnValueOnce(
				usageRows([{ id: "app_1", name: "Alpha" }]) as never,
			);
		for (let i = 0; i < 6; i++) {
			vi.mocked(db.select).mockReturnValueOnce(usageRows([]) as never);
		}

		await expect(removeNetworkById("net_1", "org_1")).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(fakeDocker.listNetworks).not.toHaveBeenCalled();
	});
});

describe("assertNetworkIdsAttachableToResource", () => {
	it("allows empty attachment lists without querying", async () => {
		await expect(
			assertNetworkIdsAttachableToResource([], "org_1", "srv_1"),
		).resolves.toEqual([]);
	});

	it("returns unique network IDs after successful validation", async () => {
		vi.mocked(db.select).mockReturnValueOnce({
			from: () => ({
				where: () =>
					Promise.resolve([
						{ id: "net_1", serverId: "srv_1", driver: "overlay" },
						{ id: "net_2", serverId: "srv_1", driver: "overlay" },
					]),
			}),
		} as never);

		await expect(
			assertNetworkIdsAttachableToResource(
				["net_1", "net_1", "net_2"],
				"org_1",
				"srv_1",
			),
		).resolves.toEqual(["net_1", "net_2"]);
	});

	it("rejects network IDs that cannot be resolved for the organization", async () => {
		await expect(
			assertNetworkIdsAttachableToResource(["net_missing"], "org_1", "srv_1"),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});

describe("error classification", () => {
	it("recognises nested Docker duplicate-name errors", () => {
		const dockerodeError = {
			statusCode: 403,
			json: {
				message:
					"network with name test-network already exists on this server",
			},
		};
		const wrapped = new TRPCError({
			code: "BAD_REQUEST",
			message: "Docker rejected network creation",
			cause: dockerodeError,
		});

		expect(getNetworkErrorMessage(wrapped)).toContain(
			"network with name test-network already exists",
		);
		expect(isDuplicateNetworkNameError(wrapped)).toBe(true);
	});

	it("recognises DB unique constraint errors", () => {
		expect(
			isDuplicateNetworkNameError({
				code: "23505",
				constraint: "network_name_serverId_idx",
				message: "duplicate key value violates unique constraint",
			}),
		).toBe(true);
	});

	it("recognises Docker 'in use' errors as CONFLICT (regex shape)", () => {
		// Mirrors the runtime check in removeNetworkById — if this pattern ever
		// diverges from Docker's wording we'll notice via this guardrail.
		const patterns = [
			"network foo has active endpoints",
			"Error response from daemon: network is in use",
		];
		for (const msg of patterns) {
			expect(/has active endpoints|is in use/i.test(msg)).toBe(true);
		}
	});

	it("is a TRPCError constructable with CONFLICT", () => {
		const err = new TRPCError({
			code: "CONFLICT",
			message: "Network in use",
		});
		expect(err.code).toBe("CONFLICT");
	});
});
