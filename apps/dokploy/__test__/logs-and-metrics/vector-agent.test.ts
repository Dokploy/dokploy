import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	setWebServerProviderIds: vi.fn(),
	setServerProviderIds: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	reconcileVectorAgent: vi.fn(),
	removeVectorAgent: vi.fn(),
	findServerById: vi.fn(),
	assertProvidersBelongToOrg: vi.fn(),
}));

const loadAgent = async (isCloud: boolean) => {
	vi.resetModules();
	vi.doMock("@dokploy/server/constants", () => ({ IS_CLOUD: isCloud }));
	vi.doMock("@dokploy/server/services/server", () => ({
		findServerById: mocks.findServerById,
		setServerProviderIds: mocks.setServerProviderIds,
		getAccessibleServerIds: mocks.getAccessibleServerIds,
	}));
	vi.doMock("@dokploy/server/services/web-server-settings", () => ({
		setWebServerProviderIds: mocks.setWebServerProviderIds,
	}));
	const locks = new Map<string, Promise<unknown>>();
	vi.doMock("@dokploy/server/setup/vector-setup", () => ({
		LOCAL_SERVER_NAME: "Dokploy Server (local)",
		reconcileVectorAgent: mocks.reconcileVectorAgent,
		removeVectorAgent: mocks.removeVectorAgent,
		withVectorTargetLock: (
			serverId: string | undefined,
			fn: () => Promise<unknown>,
		) => {
			const key = serverId ?? "local";
			const current = (locks.get(key) ?? Promise.resolve())
				.catch(() => {})
				.then(fn);
			locks.set(key, current);
			return current;
		},
	}));
	vi.doMock("@dokploy/server/services/logs-and-metrics/service", () => ({
		assertProvidersBelongToOrg: mocks.assertProvidersBelongToOrg,
	}));
	return await import("@dokploy/server/services/logs-and-metrics/vector-agent");
};

const sessionA = { userId: "user-a", activeOrganizationId: "org-a" };
const sessionB = { userId: "user-b", activeOrganizationId: "org-b" };

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
	mocks.findServerById.mockImplementation(async (serverId: string) => ({
		serverId,
		name: `name-of-${serverId}`,
		organizationId: "org-a",
		sshKeyId: "key-1",
	}));
	mocks.setWebServerProviderIds.mockResolvedValue({ id: "ws-1" });
	mocks.setServerProviderIds.mockResolvedValue({ serverId: "server-1" });
});

describe("applyVectorAgentSelection on the local host", () => {
	it("rejects the local host in cloud without touching the database", async () => {
		const { applyVectorAgentSelection } = await loadAgent(true);

		await expect(
			applyVectorAgentSelection(sessionA, undefined, ["lp-1"]),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.setWebServerProviderIds).not.toHaveBeenCalled();
		expect(mocks.reconcileVectorAgent).not.toHaveBeenCalled();
	});

	it("rejects with CONFLICT when another organization owns the local agent, without reconciling", async () => {
		mocks.setWebServerProviderIds.mockResolvedValue(null);
		const { applyVectorAgentSelection } = await loadAgent(false);

		await expect(
			applyVectorAgentSelection(sessionB, undefined, ["mp-1"]),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(mocks.setWebServerProviderIds).toHaveBeenCalledWith("org-b", [
			"mp-1",
		]);
		expect(mocks.reconcileVectorAgent).not.toHaveBeenCalled();
	});

	it("saves the selection and then reconciles", async () => {
		const { applyVectorAgentSelection } = await loadAgent(false);

		await applyVectorAgentSelection(sessionA, undefined, ["lp-1"]);
		expect(mocks.assertProvidersBelongToOrg).toHaveBeenCalledWith(
			["lp-1"],
			"org-a",
		);
		expect(mocks.setWebServerProviderIds).toHaveBeenCalledWith("org-a", [
			"lp-1",
		]);
		expect(mocks.reconcileVectorAgent).toHaveBeenCalledWith(undefined);
		expect(
			mocks.setWebServerProviderIds.mock.invocationCallOrder[0],
		).toBeLessThan(mocks.reconcileVectorAgent.mock.invocationCallOrder[0] ?? 0);
	});

	it("removing the agent saves an empty selection without checking providers", async () => {
		const { applyVectorAgentSelection } = await loadAgent(false);

		await applyVectorAgentSelection(sessionA, undefined, []);
		expect(mocks.assertProvidersBelongToOrg).not.toHaveBeenCalled();
		expect(mocks.setWebServerProviderIds).toHaveBeenCalledWith("org-a", []);
		expect(mocks.reconcileVectorAgent).toHaveBeenCalledWith(undefined);
	});
});

describe("applyVectorAgentSelection on a remote server", () => {
	it("still manages remote servers in cloud", async () => {
		const { applyVectorAgentSelection } = await loadAgent(true);

		const result = await applyVectorAgentSelection(sessionA, "server-1", []);
		expect(result).toEqual({ serverName: "name-of-server-1" });
		expect(mocks.setServerProviderIds).toHaveBeenCalledWith("server-1", []);
		expect(mocks.reconcileVectorAgent).toHaveBeenCalledWith("server-1");
	});

	it("rejects a server of another organization", async () => {
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-b",
			sshKeyId: "key-1",
		});
		const { applyVectorAgentSelection } = await loadAgent(false);

		await expect(
			applyVectorAgentSelection(sessionA, "server-1", ["lp-1"]),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.setServerProviderIds).not.toHaveBeenCalled();
	});

	it("rejects a server without an SSH key before saving anything", async () => {
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-a",
			sshKeyId: null,
		});
		const { applyVectorAgentSelection } = await loadAgent(false);

		await expect(
			applyVectorAgentSelection(sessionA, "server-1", ["lp-1"]),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.setServerProviderIds).not.toHaveBeenCalled();
		expect(mocks.reconcileVectorAgent).not.toHaveBeenCalled();
	});

	it("rejects a server the member cannot access", async () => {
		const { applyVectorAgentSelection } = await loadAgent(false);

		await expect(
			applyVectorAgentSelection(sessionA, "server-2", ["lp-1"]),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.getAccessibleServerIds).toHaveBeenCalledWith(sessionA);
		expect(mocks.setServerProviderIds).not.toHaveBeenCalled();
		expect(mocks.reconcileVectorAgent).not.toHaveBeenCalled();
	});

	it("saves the array and only then reconciles", async () => {
		const { applyVectorAgentSelection } = await loadAgent(false);

		await applyVectorAgentSelection(sessionA, "server-1", ["mp-1"]);
		expect(mocks.setServerProviderIds).toHaveBeenCalledWith("server-1", [
			"mp-1",
		]);
		expect(mocks.setServerProviderIds.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.reconcileVectorAgent.mock.invocationCallOrder[0] ?? 0,
		);
	});

	it("keeps the saved selection when the reconcile fails", async () => {
		mocks.reconcileVectorAgent.mockRejectedValue(
			new Error("validation failed"),
		);
		const { applyVectorAgentSelection } = await loadAgent(false);

		await expect(
			applyVectorAgentSelection(sessionA, "server-1", ["lp-2"]),
		).rejects.toThrow("validation failed");
		expect(mocks.setServerProviderIds).toHaveBeenCalledWith("server-1", [
			"lp-2",
		]);
	});

	it("serializes concurrent selections on the same host so the last reconcile sees the last selection", async () => {
		const saved: string[][] = [];
		const seen: string[][] = [];
		mocks.setServerProviderIds.mockImplementation(
			async (_serverId: string, ids: string[]) => {
				saved.push(ids);
				return { serverId: "server-1" };
			},
		);
		mocks.reconcileVectorAgent.mockImplementation(async () => {
			seen.push(saved.at(-1) ?? []);
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		const { applyVectorAgentSelection } = await loadAgent(false);

		await Promise.all([
			applyVectorAgentSelection(sessionA, "server-1", ["lp-1"]),
			applyVectorAgentSelection(sessionA, "server-1", ["lp-2"]),
		]);
		expect(seen).toEqual([["lp-1"], ["lp-2"]]);
	});
});

describe("removeServerVectorAgent", () => {
	it("removes the agent on server deletion when providers are assigned", async () => {
		const { removeServerVectorAgent } = await loadAgent(false);

		await expect(
			removeServerVectorAgent({
				serverId: "server-1",
				sshKeyId: "key-1",
				telemetryProviderIds: ["lp-1"],
			} as never),
		).resolves.toBeUndefined();
		expect(mocks.removeVectorAgent).toHaveBeenCalledWith("server-1");
	});

	it("attempts cleanup even with an empty selection, since a failed Remove can leave the agent running", async () => {
		const { removeServerVectorAgent } = await loadAgent(false);

		await expect(
			removeServerVectorAgent({
				serverId: "server-1",
				sshKeyId: "key-1",
				telemetryProviderIds: [],
			} as never),
		).resolves.toBeUndefined();
		expect(mocks.removeVectorAgent).toHaveBeenCalledWith("server-1");
	});

	it("skips servers without an SSH key, warning when providers were assigned", async () => {
		const { removeServerVectorAgent } = await loadAgent(false);

		await expect(
			removeServerVectorAgent({
				serverId: "server-1",
				sshKeyId: null,
				telemetryProviderIds: [],
			} as never),
		).resolves.toBeUndefined();
		await expect(
			removeServerVectorAgent({
				serverId: "server-1",
				sshKeyId: null,
				telemetryProviderIds: ["lp-1"],
			} as never),
		).resolves.toMatch(/no SSH key/);
		expect(mocks.removeVectorAgent).not.toHaveBeenCalled();
	});

	it("returns the failure as a message instead of throwing", async () => {
		mocks.removeVectorAgent.mockRejectedValue(new Error("docker down"));
		const { removeServerVectorAgent } = await loadAgent(false);

		await expect(
			removeServerVectorAgent({
				serverId: "server-1",
				sshKeyId: "k",
				telemetryProviderIds: ["lp-1"],
			} as never),
		).resolves.toBe("docker down");
	});
});

describe("reconcileVectorTargets", () => {
	it("re-applies every target under its lock and reports failures as a warning", async () => {
		mocks.reconcileVectorAgent.mockImplementation(async (serverId?: string) => {
			if (serverId === "server-2") throw new Error("ssh down");
		});
		const { reconcileVectorTargets } = await loadAgent(false);

		const warning = await reconcileVectorTargets([
			"server-1",
			"server-2",
			null,
		]);
		expect(mocks.reconcileVectorAgent.mock.calls.map((c) => c[0])).toEqual([
			"server-1",
			"server-2",
			undefined,
		]);
		expect(warning).toBe(
			"The Vector agent could not be re-applied on server-2: ssh down",
		);
	});

	it("returns no warning when every target reconciles, and skips the local host in cloud", async () => {
		const { reconcileVectorTargets } = await loadAgent(true);

		await expect(
			reconcileVectorTargets(["server-1", null]),
		).resolves.toBeUndefined();
		expect(mocks.reconcileVectorAgent).toHaveBeenCalledTimes(1);
		expect(mocks.reconcileVectorAgent).toHaveBeenCalledWith("server-1");
	});
});
