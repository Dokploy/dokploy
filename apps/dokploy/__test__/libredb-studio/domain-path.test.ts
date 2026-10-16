import { apiCreateDomain, apiUpdateDomain } from "@dokploy/server/db/schema";
import { domainCompose } from "@dokploy/server/db/validations/domain";
import { describe, expect, it } from "vitest";
import {
	domain as uiDomain,
	domainCompose as uiDomainCompose,
} from "@/server/db/validations/domain";

const createInput = {
	host: "a.example.com",
	applicationId: "app-1",
	customCertResolver: "",
};

const updateInput = {
	host: "a.example.com",
	domainId: "domain-1",
	customCertResolver: "",
};

const ruleBreakingPaths = [
	"/x`) || Host(`studio.example.com",
	"/x`)",
	"/x(y)",
	"/x y",
	"/x\ny",
	"/x|y",
	'/x"y',
	"/${HOST}",
];

describe("domain path validation", () => {
	it.each(ruleBreakingPaths)("refuses path %j on create", (path) => {
		expect(apiCreateDomain.safeParse({ ...createInput, path }).success).toBe(
			false,
		);
	});

	it.each(ruleBreakingPaths)("refuses internalPath %j on create", (path) => {
		expect(
			apiCreateDomain.safeParse({ ...createInput, internalPath: path }).success,
		).toBe(false);
	});

	it.each(ruleBreakingPaths)("refuses path %j on update", (path) => {
		expect(apiUpdateDomain.safeParse({ ...updateInput, path }).success).toBe(
			false,
		);
	});

	it.each(ruleBreakingPaths)("refuses internalPath %j on update", (path) => {
		expect(
			apiUpdateDomain.safeParse({ ...updateInput, internalPath: path }).success,
		).toBe(false);
	});

	it.each([
		"/",
		"/api",
		"/api/v1/",
		"/a-b_c.d~e",
		"/%E2%9C%93",
		"/a:b@c",
		"/a;b=c,d+e*f!g&h",
	])("accepts path %j", (path) => {
		expect(
			apiCreateDomain.safeParse({ ...createInput, path, internalPath: path })
				.success,
		).toBe(true);
		expect(
			apiUpdateDomain.safeParse({ ...updateInput, path, internalPath: path })
				.success,
		).toBe(true);
	});

	it("accepts an empty internalPath", () => {
		expect(
			apiCreateDomain.safeParse({ ...createInput, internalPath: "" }).success,
		).toBe(true);
	});
});

describe("compose and UI domain schema path validation", () => {
	const composeInput = {
		host: "a.example.com",
		customCertResolver: "",
		serviceName: "web",
	};

	describe.each([
		["domainCompose", domainCompose],
		["the UI domain copy", uiDomain],
		["the UI domainCompose copy", uiDomainCompose],
	] as const)("%s", (_name, schema) => {
		it.each(ruleBreakingPaths)("refuses path %j", (path) => {
			expect(schema.safeParse({ ...composeInput, path }).success).toBe(false);
		});

		it.each(["/", "/api", "/api/v1/", "/a:b@c"])("accepts path %j", (path) => {
			expect(schema.safeParse({ ...composeInput, path }).success).toBe(true);
		});
	});

	it.each(ruleBreakingPaths)(
		"refuses internalPath %j in domainCompose",
		(path) => {
			expect(
				domainCompose.safeParse({ ...composeInput, internalPath: path })
					.success,
			).toBe(false);
		},
	);

	it("accepts a valid internalPath in domainCompose", () => {
		expect(
			domainCompose.safeParse({ ...composeInput, internalPath: "/app/v2" })
				.success,
		).toBe(true);
	});
});
