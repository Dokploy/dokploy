import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyTemplateToCompose,
	type ComposeTemplateTarget,
} from "@/server/utils/apply-template";
import {
	createDomain,
	createMount,
	deleteMount,
	removeDomainById,
	updateCompose,
} from "@dokploy/server";
import type { Template } from "@dokploy/server";

vi.mock("@dokploy/server", () => {
	const fn = vi.fn;
	return {
		createDomain: fn(),
		createMount: fn(),
		deleteMount: fn(),
		removeDomainById: fn(),
		updateCompose: fn(),
	};
});

const deleteMountMock = vi.mocked(deleteMount);
const removeDomainMock = vi.mocked(removeDomainById);
const updateComposeMock = vi.mocked(updateCompose);
const createMountMock = vi.mocked(createMount);
const createDomainMock = vi.mocked(createDomain);

const buildCompose = (overrides?: Partial<ComposeTemplateTarget>) =>
	({
		composeId: "compose-123",
		mounts: [{ mountId: "mount-1" }],
		domains: [{ domainId: "domain-1" }],
		...overrides,
	}) as ComposeTemplateTarget;

const buildTemplate = (overrides?: Partial<Template>): Template => ({
	envs: ["APP_NAME=test", "SECRET=demo"],
	domains: [
		{
			serviceName: "web",
			port: 80,
			host: "example.com",
		},
	],
	mounts: [
		{
			filePath: "/config/app.env",
			content: "SECRET_VAL=demo",
		},
	],
	...overrides,
});

describe("applyTemplateToCompose", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("removes existing resources and recreates them from template data", async () => {
		const compose = buildCompose();
		const template = buildTemplate();

		await applyTemplateToCompose(compose, template, {
			composeFile: "version: '3'",
			sourceType: "raw",
		});

		expect(deleteMountMock).toHaveBeenCalledWith("mount-1");
		expect(removeDomainMock).toHaveBeenCalledWith("domain-1");
		expect(updateComposeMock).toHaveBeenCalledWith(
			"compose-123",
			expect.objectContaining({
				composeFile: "version: '3'",
				sourceType: "raw",
				env: "APP_NAME=test\nSECRET=demo",
				isolatedDeployment: true,
			}),
		);
		expect(createMountMock).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/config/app.env",
				serviceId: "compose-123",
			}),
		);
		expect(createDomainMock).toHaveBeenCalledWith(
			expect.objectContaining({
				serviceName: "web",
				composeId: "compose-123",
				host: "example.com",
			}),
		);
	});

	it("allows overriding isolation flag and handles empty template artifacts", async () => {
		const compose = buildCompose({ mounts: [], domains: [] });
		const template = buildTemplate({
			envs: [],
			domains: [],
			mounts: [],
		});

		await applyTemplateToCompose(compose, template, {
			isolatedDeployment: false,
		});

		expect(deleteMountMock).not.toHaveBeenCalled();
		expect(removeDomainMock).not.toHaveBeenCalled();
		expect(createMountMock).not.toHaveBeenCalled();
		expect(createDomainMock).not.toHaveBeenCalled();
		expect(updateComposeMock).toHaveBeenCalledWith(
			"compose-123",
			expect.objectContaining({
				env: "",
				isolatedDeployment: false,
			}),
		);
	});
});
