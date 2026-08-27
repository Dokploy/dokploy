import {
	assertDifferentMoveTarget,
	assertLocalMoveTargetAllowed,
	assertValidRemoteMoveTarget,
} from "@dokploy/server/utils/migration/validate-target";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

const activeOrgServer = {
	organizationId: "org-1",
	serverStatus: "active" as const,
	serverType: "deploy" as const,
	sshKeyId: "ssh-1",
};

describe("assertValidRemoteMoveTarget", () => {
	it("accepts an active deploy server with an SSH key in the caller's org", () => {
		expect(() =>
			assertValidRemoteMoveTarget(activeOrgServer, "org-1"),
		).not.toThrow();
	});

	it("rejects a server from a different organization", () => {
		expect(() => assertValidRemoteMoveTarget(activeOrgServer, "org-2")).toThrow(
			TRPCError,
		);
	});

	it("rejects an inactive server", () => {
		expect(() =>
			assertValidRemoteMoveTarget(
				{ ...activeOrgServer, serverStatus: "inactive" },
				"org-1",
			),
		).toThrow(TRPCError);
	});

	it("rejects a build-only server", () => {
		expect(() =>
			assertValidRemoteMoveTarget(
				{ ...activeOrgServer, serverType: "build" },
				"org-1",
			),
		).toThrow(TRPCError);
	});

	it("rejects a server without an SSH key", () => {
		expect(() =>
			assertValidRemoteMoveTarget(
				{ ...activeOrgServer, sshKeyId: null },
				"org-1",
			),
		).toThrow(TRPCError);
	});
});

describe("assertLocalMoveTargetAllowed", () => {
	it("allows self-hosted instances that aren't locked to remote-servers-only", () => {
		expect(() =>
			assertLocalMoveTargetAllowed({
				isCloud: false,
				remoteServersOnly: false,
			}),
		).not.toThrow();
	});

	it("rejects on cloud", () => {
		expect(() =>
			assertLocalMoveTargetAllowed({ isCloud: true, remoteServersOnly: false }),
		).toThrow(TRPCError);
	});

	it("rejects when locked to remote-servers-only", () => {
		expect(() =>
			assertLocalMoveTargetAllowed({ isCloud: false, remoteServersOnly: true }),
		).toThrow(TRPCError);
	});
});

describe("assertDifferentMoveTarget", () => {
	it("allows moving to a different server", () => {
		expect(() =>
			assertDifferentMoveTarget("server-a", "server-b"),
		).not.toThrow();
		expect(() => assertDifferentMoveTarget(null, "server-b")).not.toThrow();
		expect(() => assertDifferentMoveTarget("server-a", null)).not.toThrow();
	});

	it("rejects moving a service to its current server", () => {
		expect(() => assertDifferentMoveTarget("server-a", "server-a")).toThrow(
			TRPCError,
		);
		expect(() => assertDifferentMoveTarget(null, null)).toThrow(TRPCError);
	});
});
