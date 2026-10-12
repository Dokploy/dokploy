import {
	describeDockerHubResolution,
	findRegistryMismatch,
	getImageRegistryHost,
	isDockerHubHost,
	normalizeRegistryHost,
	registryAuthAddress,
} from "@dokploy/server/utils/docker/registry-reference";
import { describe, expect, it } from "vitest";

describe("normalizeRegistryHost", () => {
	it("strips scheme, path and trailing slash", () => {
		expect(normalizeRegistryHost("https://registry.example.com/team/")).toBe(
			"registry.example.com",
		);
		expect(normalizeRegistryHost("http://registry.example.com")).toBe(
			"registry.example.com",
		);
		expect(normalizeRegistryHost("registry.example.com/team")).toBe(
			"registry.example.com",
		);
	});

	it("keeps an explicit port", () => {
		expect(normalizeRegistryHost("registry.example.com:5000/team")).toBe(
			"registry.example.com:5000",
		);
		expect(normalizeRegistryHost("https://registry.example.com:5000")).toBe(
			"registry.example.com:5000",
		);
	});

	it("is empty for an unset value", () => {
		expect(normalizeRegistryHost(undefined)).toBe("");
		expect(normalizeRegistryHost(null)).toBe("");
		expect(normalizeRegistryHost("   ")).toBe("");
	});
});

describe("getImageRegistryHost", () => {
	it("returns null for references that resolve to Docker Hub", () => {
		expect(getImageRegistryHost("nginx:latest")).toBeNull();
		expect(getImageRegistryHost("amelio-dev:latest")).toBeNull();
		expect(getImageRegistryHost("team/app:1.2.3")).toBeNull();
	});

	it("detects a registry host", () => {
		expect(getImageRegistryHost("registry.example.com/team/app:latest")).toBe(
			"registry.example.com",
		);
		expect(getImageRegistryHost("localhost:5000/app")).toBe("localhost:5000");
		expect(getImageRegistryHost("localhost/app")).toBe("localhost");
	});
});

describe("registryAuthAddress", () => {
	it("reduces a private registry to its host", () => {
		expect(registryAuthAddress("https://registry.example.com/team/")).toBe(
			"registry.example.com",
		);
	});

	it("passes Docker Hub through untouched", () => {
		// The canonical Hub auth key is the legacy v1 URL; rewriting it would
		// store the credential under a key the Hub pull never looks up.
		expect(registryAuthAddress("https://index.docker.io/v1/")).toBe(
			"https://index.docker.io/v1/",
		);
		expect(isDockerHubHost("index.docker.io")).toBe(true);
	});

	it("is empty for an unset value", () => {
		expect(registryAuthAddress(null)).toBe("");
	});
});

describe("describeDockerHubResolution", () => {
	it("adds the implicit library namespace only to single-component names", () => {
		expect(describeDockerHubResolution("amelio-dev:latest")).toBe(
			"docker.io/library/amelio-dev:latest",
		);
		expect(describeDockerHubResolution("team/app:latest")).toBe(
			"docker.io/team/app:latest",
		);
	});
});

describe("findRegistryMismatch", () => {
	it("reports an image that would silently be pulled from Docker Hub", () => {
		const message = findRegistryMismatch(
			"amelio-dev:latest",
			"https://amelio-registry.example.com/amelio/",
		);
		expect(message).not.toBeNull();
		expect(message).toContain("docker.io/library/amelio-dev:latest");
		expect(message).toContain("amelio-registry.example.com/amelio-dev:latest");
	});

	it("accepts a fully qualified reference", () => {
		expect(
			findRegistryMismatch(
				"amelio-registry.example.com/amelio/amelio-dev:latest",
				"amelio-registry.example.com",
			),
		).toBeNull();
	});

	it("does not fire without a registry url", () => {
		expect(findRegistryMismatch("nginx:latest", "")).toBeNull();
		expect(findRegistryMismatch("nginx:latest", null)).toBeNull();
	});

	it("does not fire for Docker Hub credentials on a Hub image", () => {
		// Authenticating to Hub for a private repo or to lift anonymous pull
		// rate limits is legitimate and carries no registry host.
		expect(
			findRegistryMismatch("nginx:latest", "https://index.docker.io/v1/"),
		).toBeNull();
		expect(findRegistryMismatch("team/app:latest", "docker.io")).toBeNull();
	});
});
