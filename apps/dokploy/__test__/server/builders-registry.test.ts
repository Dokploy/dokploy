import type { Registry } from "@dokploy/server/services/registry";
import { findRegistryByIdWithCredentials } from "@dokploy/server/services/registry";
import {
	type ApplicationNested,
	getAuthConfig,
	getImageName,
} from "@dokploy/server/utils/builders";
import {
	getRegistryTag,
	uploadImageRemoteCommand,
} from "@dokploy/server/utils/cluster/upload";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/registry", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/registry")
	>("@dokploy/server/services/registry");
	return {
		...actual,
		findRegistryByIdWithCredentials: vi.fn(),
	};
});

const createMockRegistry = (overrides: Partial<Registry> = {}): Registry =>
	({
		registryId: "reg-1",
		registryName: "Test Registry",
		username: "myuser",
		password: "reg-password",
		registryUrl: "registry.example.com",
		registryType: "cloud",
		imagePrefix: null,
		createdAt: new Date().toISOString(),
		organizationId: "org-1",
		...overrides,
	}) as Registry;

const createApplication = (
	overrides: Partial<ApplicationNested> = {},
): ApplicationNested =>
	({
		appName: "my-app",
		sourceType: "docker",
		dockerImage: "nginx:latest",
		username: null,
		password: null,
		registryUrl: null,
		registry: null,
		buildRegistry: null,
		rollbackRegistry: null,
		rollbackActive: false,
		environment: {
			project: { env: null },
			env: null,
		},
		...overrides,
	}) as unknown as ApplicationNested;

describe("getImageName", () => {
	beforeEach(() => {
		vi.mocked(findRegistryByIdWithCredentials).mockReset();
	});

	it("returns the configured-registry tag for docker source + registry", async () => {
		const registry = createMockRegistry();
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(registry);
		const application = createApplication({
			registry: { registryId: "reg-1" } as any,
		});

		const result = await getImageName(application);

		expect(findRegistryByIdWithCredentials).toHaveBeenCalledWith("reg-1");
		expect(result).toBe("registry.example.com/myuser/nginx:latest");
		expect(result).not.toBe("nginx:latest");
	});

	it("returns the configured buildRegistry tag for docker source + buildRegistry", async () => {
		const buildRegistry = createMockRegistry({
			registryId: "build-reg-1",
			registryUrl: "build.example.com",
		});
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(buildRegistry);
		const application = createApplication({
			buildRegistry: { registryId: "build-reg-1" } as any,
		});

		const result = await getImageName(application);

		expect(findRegistryByIdWithCredentials).toHaveBeenCalledWith("build-reg-1");
		expect(result).toBe("build.example.com/myuser/nginx:latest");
	});

	it("prefers registry over buildRegistry for docker source (mirrors upload order)", async () => {
		const registry = createMockRegistry({ registryId: "reg-1" });
		const buildRegistry = createMockRegistry({
			registryId: "build-reg-1",
			registryUrl: "build.example.com",
		});
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(registry);
		const application = createApplication({
			registry: { registryId: "reg-1" } as any,
			buildRegistry: { registryId: "build-reg-1" } as any,
		});

		const result = await getImageName(application);

		expect(findRegistryByIdWithCredentials).toHaveBeenCalledTimes(1);
		expect(findRegistryByIdWithCredentials).toHaveBeenCalledWith("reg-1");
		expect(result).toBe("registry.example.com/myuser/nginx:latest");
	});

	it("returns the raw dockerImage when docker source has no registry configured", async () => {
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(
			createMockRegistry(),
		);
		const application = createApplication();

		const result = await getImageName(application);

		expect(findRegistryByIdWithCredentials).not.toHaveBeenCalled();
		expect(result).toBe("nginx:latest");
	});

	it("returns ERROR-NO-IMAGE-PROVIDED when docker source has no dockerImage and no registry", async () => {
		const application = createApplication({ dockerImage: null });

		const result = await getImageName(application);

		expect(result).toBe("ERROR-NO-IMAGE-PROVIDED");
	});

	it("returns the configured-registry tag for non-docker source + registry", async () => {
		const registry = createMockRegistry();
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(registry);
		const application = createApplication({
			sourceType: "github",
			registry: { registryId: "reg-1" } as any,
		});

		const result = await getImageName(application);

		expect(result).toBe("registry.example.com/myuser/my-app:latest");
	});

	it("returns <appName>:latest when non-docker source has no registry", async () => {
		const application = createApplication({ sourceType: "github" });

		const result = await getImageName(application);

		expect(result).toBe("my-app:latest");
		expect(findRegistryByIdWithCredentials).not.toHaveBeenCalled();
	});

	it("uses imagePrefix instead of username when present", async () => {
		const registry = createMockRegistry({ imagePrefix: "myorg" });
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(registry);
		const application = createApplication({
			registry: { registryId: "reg-1" } as any,
		});

		const result = await getImageName(application);

		expect(result).toBe("registry.example.com/myorg/nginx:latest");
	});
});

describe("getAuthConfig", () => {
	beforeEach(() => {
		vi.mocked(findRegistryByIdWithCredentials).mockReset();
	});

	it("returns the configured registry credentials for docker source + registry", async () => {
		const registry = createMockRegistry({
			password: "reg-secret",
			username: "reg-user",
			registryUrl: "registry.example.com",
		});
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(registry);
		const application = createApplication({
			registry: { registryId: "reg-1" } as any,
		});

		const result = await getAuthConfig(application);

		expect(findRegistryByIdWithCredentials).toHaveBeenCalledWith("reg-1");
		expect(result).toEqual({
			password: "reg-secret",
			username: "reg-user",
			serveraddress: "registry.example.com",
		});
	});

	it("returns the configured buildRegistry credentials for docker source + buildRegistry", async () => {
		const buildRegistry = createMockRegistry({
			registryId: "build-reg-1",
			password: "build-secret",
			username: "build-user",
			registryUrl: "build.example.com",
		});
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(buildRegistry);
		const application = createApplication({
			buildRegistry: { registryId: "build-reg-1" } as any,
		});

		const result = await getAuthConfig(application);

		expect(findRegistryByIdWithCredentials).toHaveBeenCalledWith("build-reg-1");
		expect(result).toEqual({
			password: "build-secret",
			username: "build-user",
			serveraddress: "build.example.com",
		});
	});

	it("prefers the configured registry over app-level credentials for docker source", async () => {
		const registry = createMockRegistry({
			password: "reg-secret",
			username: "reg-user",
			registryUrl: "registry.example.com",
		});
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(registry);
		const application = createApplication({
			registry: { registryId: "reg-1" } as any,
			username: "app-user",
			password: "app-secret",
			registryUrl: "docker.io",
		});

		const result = await getAuthConfig(application);

		expect(result).toEqual({
			password: "reg-secret",
			username: "reg-user",
			serveraddress: "registry.example.com",
		});
	});

	it("falls back to app-level credentials for docker source with no configured registry", async () => {
		const application = createApplication({
			username: "app-user",
			password: "app-secret",
			registryUrl: "docker.io",
		});

		const result = await getAuthConfig(application);

		expect(findRegistryByIdWithCredentials).not.toHaveBeenCalled();
		expect(result).toEqual({
			password: "app-secret",
			username: "app-user",
			serveraddress: "docker.io",
		});
	});

	it("returns undefined for docker source with no registry and no app-level credentials", async () => {
		const application = createApplication();

		const result = await getAuthConfig(application);

		expect(result).toBeUndefined();
	});

	it("uses empty serveraddress fallback when docker source has app creds but no registryUrl", async () => {
		const application = createApplication({
			username: "app-user",
			password: "app-secret",
			registryUrl: null,
		});

		const result = await getAuthConfig(application);

		expect(result).toEqual({
			password: "app-secret",
			username: "app-user",
			serveraddress: "",
		});
	});

	it("returns the configured registry credentials for non-docker source + registry", async () => {
		const registry = createMockRegistry({
			password: "reg-secret",
			username: "reg-user",
			registryUrl: "registry.example.com",
		});
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(registry);
		const application = createApplication({
			sourceType: "github",
			registry: { registryId: "reg-1" } as any,
		});

		const result = await getAuthConfig(application);

		expect(result).toEqual({
			password: "reg-secret",
			username: "reg-user",
			serveraddress: "registry.example.com",
		});
	});

	it("returns undefined for non-docker source with no configured registry", async () => {
		const application = createApplication({ sourceType: "github" });

		const result = await getAuthConfig(application);

		expect(result).toBeUndefined();
		expect(findRegistryByIdWithCredentials).not.toHaveBeenCalled();
	});
});

describe("push/pull registry consistency for docker source", () => {
	beforeEach(() => {
		vi.mocked(findRegistryByIdWithCredentials).mockReset();
	});

	it("getImageName (pull) and uploadImageRemoteCommand (push) target the same registry tag", async () => {
		const registry = createMockRegistry({
			registryUrl: "registry.example.com",
			username: "myuser",
		});
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(registry);
		const application = createApplication({
			dockerImage: "nginx:latest",
			registry: { registryId: "reg-1" } as any,
		});
		const expectedTag = getRegistryTag(registry, "nginx:latest");

		const pullImage = await getImageName(application);
		const pushCommand = await uploadImageRemoteCommand(application);
		const unescaped = pushCommand.replace(/\\(.)/g, "$1");

		expect(pullImage).toBe(expectedTag);
		expect(unescaped).toContain(`docker tag nginx:latest ${expectedTag}`);
		expect(unescaped).toContain(`docker push ${expectedTag}`);
		expect(pullImage).not.toBe("nginx:latest");
	});

	it("getImageName (pull) and uploadImageRemoteCommand (push) stay consistent for buildRegistry", async () => {
		const buildRegistry = createMockRegistry({
			registryId: "build-reg-1",
			registryUrl: "build.example.com",
			username: "myuser",
		});
		vi.mocked(findRegistryByIdWithCredentials).mockResolvedValue(buildRegistry);
		const application = createApplication({
			dockerImage: "myuser/myrepo:1.2.3",
			buildRegistry: { registryId: "build-reg-1" } as any,
		});
		const expectedTag = getRegistryTag(buildRegistry, "myuser/myrepo:1.2.3");

		const pullImage = await getImageName(application);
		const pushCommand = await uploadImageRemoteCommand(application);
		const unescaped = pushCommand.replace(/\\(.)/g, "$1");

		expect(pullImage).toBe(expectedTag);
		expect(unescaped).toContain(
			`docker tag myuser/myrepo:1.2.3 ${expectedTag}`,
		);
		expect(unescaped).toContain(`docker push ${expectedTag}`);
	});
});
