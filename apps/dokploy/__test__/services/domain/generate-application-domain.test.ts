import { afterEach, describe, expect, it, vi } from "vitest";
import {
	generateApplicationDomain,
	generatePreviewDeploymentDomain,
	generateCustomWildcardDomain,
	getProjectWildcardDomain,
} from "@dokploy/server";

// Mock the project service
vi.mock("@dokploy/server/services/project", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/project")
	>("@dokploy/server/services/project");
	return {
		...actual,
		getProjectWildcardDomain: vi.fn(),
	};
});

// Import after mocking to get the mocked version
import * as projectService from "@dokploy/server/services/project";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("generateApplicationDomain", () => {
	it("uses project wildcard domains when available", async () => {
		vi.mocked(projectService.getProjectWildcardDomain).mockResolvedValue(
			"*.apps.example.com",
		);

		const domain = await generateApplicationDomain(
			"my-application",
			"user-1",
			"project-1",
		);

		expect(domain).toMatch(/my-application-[0-9a-f]{6}\.apps\.example\.com/);
	});

	it("falls back to traefik.me when no wildcard domain is configured", async () => {
		vi.mocked(projectService.getProjectWildcardDomain).mockResolvedValue(null);
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "development";

		const domain = await generateApplicationDomain("app", "user-2");

		process.env.NODE_ENV = originalEnv;

		expect(domain).toMatch(/app-[0-9a-f]{6}\.traefik\.me/);
	});
});

describe("generatePreviewDeploymentDomain", () => {
	it("prefers the application preview wildcard when provided", async () => {
		const traefikMock = vi.fn();

		const domain = await generatePreviewDeploymentDomain(
			"preview-app",
			"user-1",
			"project-1",
			"server-1",
			"*-preview.example.com",
			{ fallbackGenerator: traefikMock },
		);

		expect(domain).toMatch(
			/preview-app-[0-9a-f]{6}-preview\.example\.com/,
		);
		expect(projectService.getProjectWildcardDomain).not.toHaveBeenCalled();
		expect(traefikMock).not.toHaveBeenCalled();
	});

	it("uses project wildcard domain when no preview wildcard is set", async () => {
		vi.mocked(projectService.getProjectWildcardDomain).mockResolvedValue(
			"*.apps.example.com",
		);
		const traefikMock = vi.fn();

		const domain = await generatePreviewDeploymentDomain(
			"preview-app",
			"user-2",
			"project-1",
			undefined,
			undefined,
			{ fallbackGenerator: traefikMock },
		);

		expect(domain).toMatch(/preview-app-[0-9a-f]{6}\.apps\.example\.com/);
		expect(traefikMock).not.toHaveBeenCalled();
	});

	it("falls back to traefik.me when no wildcard domains exist", async () => {
		vi.mocked(projectService.getProjectWildcardDomain).mockResolvedValue(null);
		const traefikMock = vi
			.fn()
			.mockResolvedValue("preview-app-a1b2c3.traefik.me");

		const domain = await generatePreviewDeploymentDomain(
			"preview-app",
			"user-3",
			undefined,
			undefined,
			undefined,
			{ fallbackGenerator: traefikMock },
		);

		expect(domain).toBe("preview-app-a1b2c3.traefik.me");
		expect(traefikMock).toHaveBeenCalledWith(
			"preview-app",
			"user-3",
			undefined,
		);
	});
});

describe("generateCustomWildcardDomain", () => {
	it("replaces the wildcard token with the app name and a hash", () => {
		const domain = generateCustomWildcardDomain({
			appName: "blog",
			wildcardDomain: "*-apps.example.com",
		});

		expect(domain).toMatch(/blog-[0-9a-f]{6}-apps\.example\.com/);
	});
});
