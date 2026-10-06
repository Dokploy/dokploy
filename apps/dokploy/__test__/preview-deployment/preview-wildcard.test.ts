import {
	apiUpdateApplication,
	apiUpdateCompose,
} from "@dokploy/server/db/schema";
import { generatePreviewWildcardDomain } from "@dokploy/server/services/preview-deployment";
import {
	hasPreviewTemplateVariable,
	isValidPreviewWildcard,
	PREVIEW_WILDCARD_GUIDANCE,
} from "@dokploy/server/utils/preview-wildcard";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

const ACCEPTED = [
	"*.preview.example.com",
	"*.sslip.io",
	"${prNumber}.preview.example.com",
	"pr-${prNumber}-${appName}.example.com",
	"${branchName}.example.com",
	"${uniqueId}.example.com",
	"*.${prNumber}.example.com",
];

const REJECTED = [
	"preview.example.com",
	"*preview.example.com",
	"*-apps.example.com",
	"${appName}.example.com",
	" *.example.com",
	"example.com",
];

describe("isValidPreviewWildcard", () => {
	it.each(ACCEPTED)("accepts %s", (value) => {
		expect(isValidPreviewWildcard(value)).toBe(true);
	});

	it.each(REJECTED)("rejects %s", (value) => {
		expect(isValidPreviewWildcard(value)).toBe(false);
	});

	it("allows empty and missing values (they fall back to *.sslip.io)", () => {
		expect(isValidPreviewWildcard("")).toBe(true);
		expect(isValidPreviewWildcard(undefined)).toBe(true);
		expect(isValidPreviewWildcard(null)).toBe(true);
	});

	it("only treats prNumber, branchName and uniqueId as unique template variables", () => {
		expect(hasPreviewTemplateVariable("${prNumber}.x.com")).toBe(true);
		expect(hasPreviewTemplateVariable("${branchName}.x.com")).toBe(true);
		expect(hasPreviewTemplateVariable("${uniqueId}.x.com")).toBe(true);
		expect(hasPreviewTemplateVariable("${appName}.x.com")).toBe(false);
	});
});

describe("previewWildcard in the update schemas", () => {
	const applicationBase = { applicationId: "app-1" };
	const composeBase = { composeId: "compose-1" };

	it.each(ACCEPTED)("application schema accepts %s", (value) => {
		expect(
			apiUpdateApplication.safeParse({
				...applicationBase,
				previewWildcard: value,
			}).success,
		).toBe(true);
	});

	it.each(ACCEPTED)("compose schema accepts %s", (value) => {
		expect(
			apiUpdateCompose.safeParse({
				...composeBase,
				previewWildcard: value,
			}).success,
		).toBe(true);
	});

	it("accepts a missing or empty previewWildcard", () => {
		expect(apiUpdateApplication.safeParse(applicationBase).success).toBe(true);
		expect(
			apiUpdateApplication.safeParse({
				...applicationBase,
				previewWildcard: "",
			}).success,
		).toBe(true);
		expect(apiUpdateCompose.safeParse(composeBase).success).toBe(true);
		expect(
			apiUpdateCompose.safeParse({ ...composeBase, previewWildcard: "" })
				.success,
		).toBe(true);
	});

	it.each(REJECTED)("application schema rejects %s with guidance", (value) => {
		const result = apiUpdateApplication.safeParse({
			...applicationBase,
			previewWildcard: value,
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(PREVIEW_WILDCARD_GUIDANCE);
			expect(result.error.issues[0]?.path).toEqual(["previewWildcard"]);
		}
	});

	it.each(REJECTED)("compose schema rejects %s with guidance", (value) => {
		const result = apiUpdateCompose.safeParse({
			...composeBase,
			previewWildcard: value,
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(PREVIEW_WILDCARD_GUIDANCE);
		}
	});

	it("guidance mentions both accepted forms", () => {
		expect(PREVIEW_WILDCARD_GUIDANCE).toContain("*.preview.example.com");
		expect(PREVIEW_WILDCARD_GUIDANCE).toContain(
			"${prNumber}.preview.example.com",
		);
	});
});

describe("generatePreviewWildcardDomain", () => {
	it("throws a BAD_REQUEST TRPCError with guidance for an invalid base domain", async () => {
		const error = await generatePreviewWildcardDomain(
			"preview.example.com",
			"preview-app-abc123",
			"1.2.3.4",
			"user-1",
		).catch((e) => e);

		expect(error).toBeInstanceOf(TRPCError);
		expect(error.code).toBe("BAD_REQUEST");
		expect(error.message).toContain("preview.example.com");
		expect(error.message).toContain(PREVIEW_WILDCARD_GUIDANCE);
	});

	it("still builds a host for a valid wildcard base domain", async () => {
		await expect(
			generatePreviewWildcardDomain(
				"*.preview.example.com",
				"preview-app-abc123",
				"1.2.3.4",
				"user-1",
			),
		).resolves.toBe("preview-app-abc123.preview.example.com");
	});
});
