import {
	prepareEnvironmentVariables,
	resolvePreviewDeployUrlReferences,
} from "@dokploy/server/index";
import { describe, expect, it } from "vitest";

const targets = [
	{
		appName: "backend-zeeuhb",
		name: "backend",
		host: "preview-backend-zeeuhb-dtzv3p.preview.xyz.com",
	},
	{
		appName: "frontend-wtcxno",
		name: "frontend",
		host: "preview-frontend-wtcxno-etzxkc.preview.xyz.com",
	},
];

describe("resolvePreviewDeployUrlReferences", () => {
	it("resolves a sibling preview URL by application name", () => {
		const env = "NEXT_PUBLIC_API_URL=https://${{backend.DOKPLOY_DEPLOY_URL}}";

		expect(resolvePreviewDeployUrlReferences(env, targets)).toBe(
			"NEXT_PUBLIC_API_URL=https://preview-backend-zeeuhb-dtzv3p.preview.xyz.com",
		);
	});

	it("resolves a sibling preview URL by appName", () => {
		const env = "CORS=${{frontend-wtcxno.DOKPLOY_DEPLOY_URL}}";

		expect(resolvePreviewDeployUrlReferences(env, targets)).toBe(
			"CORS=preview-frontend-wtcxno-etzxkc.preview.xyz.com",
		);
	});

	it("resolves multiple references in one value", () => {
		const env =
			"ORIGINS=${{frontend.DOKPLOY_DEPLOY_URL}},${{backend.DOKPLOY_DEPLOY_URL}}";

		expect(resolvePreviewDeployUrlReferences(env, targets)).toBe(
			"ORIGINS=preview-frontend-wtcxno-etzxkc.preview.xyz.com,preview-backend-zeeuhb-dtzv3p.preview.xyz.com",
		);
	});

	it("produces output that prepareEnvironmentVariables accepts", () => {
		const env = resolvePreviewDeployUrlReferences(
			"API=${{backend.DOKPLOY_DEPLOY_URL}}\nSELF=${{DOKPLOY_DEPLOY_URL}}\nDOKPLOY_DEPLOY_URL=fe.example.com",
			targets,
		);

		expect(prepareEnvironmentVariables(env)).toEqual([
			"API=preview-backend-zeeuhb-dtzv3p.preview.xyz.com",
			"SELF=fe.example.com",
			"DOKPLOY_DEPLOY_URL=fe.example.com",
		]);
	});

	it("leaves project, environment and vault references untouched", () => {
		const env = [
			"A=${{project.DOKPLOY_DEPLOY_URL}}",
			"B=${{environment.DOKPLOY_DEPLOY_URL}}",
			"C=${{vault.main.DOKPLOY_DEPLOY_URL}}",
			"D=${{DOKPLOY_DEPLOY_URL}}",
		].join("\n");

		expect(resolvePreviewDeployUrlReferences(env, targets)).toBe(env);
	});

	it("throws when no preview exists for the referenced application", () => {
		expect(() =>
			resolvePreviewDeployUrlReferences(
				"API=${{worker.DOKPLOY_DEPLOY_URL}}",
				targets,
			),
		).toThrow(/worker/);
	});

	it("throws when the referenced preview has no domain", () => {
		expect(() =>
			resolvePreviewDeployUrlReferences("API=${{backend.DOKPLOY_DEPLOY_URL}}", [
				{ appName: "backend-zeeuhb", name: "backend", host: null },
			]),
		).toThrow(/backend/);
	});

	it("throws when an application name is ambiguous", () => {
		expect(() =>
			resolvePreviewDeployUrlReferences("API=${{api.DOKPLOY_DEPLOY_URL}}", [
				{ appName: "api-aaaaaa", name: "api", host: "a.example.com" },
				{ appName: "api-bbbbbb", name: "api", host: "b.example.com" },
			]),
		).toThrow(/ambiguous|appName/i);
	});

	it("ignores references in commented-out lines", () => {
		const env = [
			"# API=${{worker.DOKPLOY_DEPLOY_URL}}",
			"API=${{backend.DOKPLOY_DEPLOY_URL}}",
		].join("\n");

		const resolved = resolvePreviewDeployUrlReferences(env, targets);

		expect(prepareEnvironmentVariables(resolved)).toEqual([
			"API=preview-backend-zeeuhb-dtzv3p.preview.xyz.com",
		]);
	});

	it("ignores references in inline comments", () => {
		const env =
			"API=${{backend.DOKPLOY_DEPLOY_URL}} # was ${{worker.DOKPLOY_DEPLOY_URL}}";

		const resolved = resolvePreviewDeployUrlReferences(env, targets);

		expect(prepareEnvironmentVariables(resolved)).toEqual([
			"API=preview-backend-zeeuhb-dtzv3p.preview.xyz.com",
		]);
	});

	it("returns empty input unchanged", () => {
		expect(resolvePreviewDeployUrlReferences(null, targets)).toBe("");
		expect(resolvePreviewDeployUrlReferences("", targets)).toBe("");
	});
});
