import { describe, it, expect } from "vitest";
import { enterpriseOnlyResources, statements } from "@dokploy/server/lib/access-control";

const FREE_TIER_RESOURCES = [
	"organization",
	"member",
	"invitation",
	"team",
	"ac",
	"project",
	"service",
	"environment",
	"docker",
	"sshKeys",
	"gitProviders",
	"traefikFiles",
	"api",
];

const ENTERPRISE_RESOURCES = [
	"volume",
	"deployment",
	"envVars",
	"projectEnvVars",
	"environmentEnvVars",
	"server",
	"registry",
	"certificate",
	"backup",
	"volumeBackup",
	"schedule",
	"domain",
	"destination",
	"notification",
	"logs",
	"monitoring",
	"auditLog",
];

describe("enterpriseOnlyResources set", () => {
	it("contains all enterprise resources", () => {
		for (const resource of ENTERPRISE_RESOURCES) {
			expect(enterpriseOnlyResources.has(resource)).toBe(true);
		}
	});

	it("does NOT contain free-tier resources", () => {
		for (const resource of FREE_TIER_RESOURCES) {
			expect(enterpriseOnlyResources.has(resource)).toBe(false);
		}
	});

	it("every resource in statements is either free or enterprise", () => {
		const allResources = Object.keys(statements);
		for (const resource of allResources) {
			const isFree = FREE_TIER_RESOURCES.includes(resource);
			const isEnterprise = enterpriseOnlyResources.has(resource);
			expect(isFree || isEnterprise).toBe(true);
		}
	});

	it("free and enterprise sets don't overlap", () => {
		for (const resource of FREE_TIER_RESOURCES) {
			expect(enterpriseOnlyResources.has(resource)).toBe(false);
		}
	});

	it("all statement resources are accounted for", () => {
		const allResources = Object.keys(statements);
		const categorized = [...FREE_TIER_RESOURCES, ...ENTERPRISE_RESOURCES];
		for (const resource of allResources) {
			expect(categorized).toContain(resource);
		}
	});
});
