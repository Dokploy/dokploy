import {
	getImageRegistryHost,
	getRegistryHost,
	isImageFromRegistry,
} from "@dokploy/server/utils/docker/registry-host";
import { describe, expect, it } from "vitest";

describe("getRegistryHost", () => {
	it("strips a scheme and path from the configured URL", () => {
		expect(getRegistryHost("https://registry.example.com/v2/")).toBe(
			"registry.example.com",
		);
	});

	it("keeps the port", () => {
		expect(getRegistryHost("registry.example.com:5000")).toBe(
			"registry.example.com:5000",
		);
	});

	it("returns null for an empty value", () => {
		expect(getRegistryHost("")).toBeNull();
		expect(getRegistryHost(null)).toBeNull();
	});
});

describe("getImageRegistryHost", () => {
	it("detects a registry host in the image reference", () => {
		expect(getImageRegistryHost("registry.example.com/team/app:latest")).toBe(
			"registry.example.com",
		);
	});

	it("returns null for Docker Hub references", () => {
		expect(getImageRegistryHost("nginx:latest")).toBeNull();
		expect(getImageRegistryHost("library/nginx:latest")).toBeNull();
	});

	it("detects localhost and hosts with a port", () => {
		expect(getImageRegistryHost("localhost/app")).toBe("localhost");
		expect(getImageRegistryHost("localhost:5000/app")).toBe("localhost:5000");
	});
});

describe("isImageFromRegistry", () => {
	it("matches an image pulled from the configured registry", () => {
		expect(
			isImageFromRegistry(
				"registry.example.com/team/app:latest",
				"registry.example.com",
			),
		).toBe(true);
		expect(
			isImageFromRegistry(
				"registry.example.com/team/app:latest",
				"https://registry.example.com/v2/",
			),
		).toBe(true);
	});

	it("does not match an image from another registry", () => {
		expect(
			isImageFromRegistry(
				"other.example.com/app:latest",
				"registry.example.com",
			),
		).toBe(false);
	});

	it("does not match a bare Docker Hub image when a private registry is configured", () => {
		expect(isImageFromRegistry("nginx:latest", "registry.example.com")).toBe(
			false,
		);
	});

	it("matches Docker Hub references when the configured registry is Docker Hub", () => {
		expect(isImageFromRegistry("nginx:latest", "docker.io")).toBe(true);
		expect(
			isImageFromRegistry("docker.io/library/nginx", "registry-1.docker.io"),
		).toBe(true);
	});

	it("returns false when either side is missing", () => {
		expect(isImageFromRegistry("", "registry.example.com")).toBe(false);
		expect(isImageFromRegistry("registry.example.com/app", "")).toBe(false);
	});
});
