import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { validatePermissions } from "@/server/api/routers/proprietary/custom-role-utils";

describe("validatePermissions", () => {
	it("accepts valid custom role permissions", () => {
		expect(() =>
			validatePermissions({
				project: ["create"],
				service: ["read", "delete"],
			}),
		).not.toThrow();
	});

	it("rejects internally managed better-auth resources", () => {
		expect(() =>
			validatePermissions({
				organization: ["update"],
			}),
		).toThrow(TRPCError);
	});

	it("rejects invalid actions before role update side effects can run", () => {
		expect(() =>
			validatePermissions({
				project: ["read"],
			}),
		).toThrow('Invalid action "read" for resource "project"');
	});
});
