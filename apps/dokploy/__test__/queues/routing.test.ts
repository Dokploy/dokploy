import { describe, expect, it } from "vitest";
import {
	CANCEL_CHANNEL,
	getQueueName,
	getTargetKey,
	LOCAL_TARGET,
} from "../../server/queues/queue-routing";

describe("queue routing", () => {
	it("routes jobs without a serverId to LOCAL_TARGET", () => {
		expect(getTargetKey({ serverId: undefined })).toBe(LOCAL_TARGET);
		expect(getTargetKey({} as { serverId?: string })).toBe(LOCAL_TARGET);
	});

	it("routes jobs with a serverId to that server's key", () => {
		expect(getTargetKey({ serverId: "srv-abc" })).toBe("srv-abc");
	});

	it("preserves canary's 'deployments' queue name for LOCAL_TARGET (upgrade-safe)", () => {
		expect(getQueueName(LOCAL_TARGET)).toBe("deployments");
	});

	it("namespaces remote queues per server (uses __ since BullMQ rejects :)", () => {
		expect(getQueueName("srv-abc")).toBe("deployments__srv-abc");
		expect(getQueueName("srv-xyz")).toBe("deployments__srv-xyz");
	});

	it("never produces a queue name containing : (BullMQ requirement)", () => {
		expect(getQueueName(LOCAL_TARGET)).not.toContain(":");
		expect(getQueueName("srv-with-colons-disallowed")).not.toContain(":");
	});

	it("uses a stable cross-process cancel channel name", () => {
		expect(CANCEL_CHANNEL).toBe("dokploy:deployments:cancel");
	});

	it("treats null/undefined serverId identically (no NaN keys)", () => {
		expect(getTargetKey({ serverId: undefined })).toBe(LOCAL_TARGET);
		expect(getTargetKey({ serverId: null as unknown as undefined })).toBe(
			LOCAL_TARGET,
		);
	});
});
