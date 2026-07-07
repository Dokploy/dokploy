import {
	buildPinnedRef,
	extractImageName,
	extractImageTag,
	isDigestRef,
	normalizeRepo,
	parseImageRef,
} from "@dokploy/server/utils/admission/image-ref";
import { describe, expect, it } from "vitest";

describe("image-ref parsing", () => {
	it("extracts name without tag (and handles registry port)", () => {
		expect(extractImageName("nginx:1.27")).toBe("nginx");
		expect(extractImageName("nginx")).toBe("nginx");
		expect(extractImageName("registry:5000/app")).toBe("registry:5000/app");
		expect(extractImageName("registry:5000/app:v1")).toBe("registry:5000/app");
	});

	it("extracts name for a digest ref (splits on @, not :)", () => {
		expect(extractImageName("nginx@sha256:abc")).toBe("nginx");
		expect(extractImageName("registry:5000/app@sha256:abc")).toBe(
			"registry:5000/app",
		);
	});

	it("extracts tag, defaulting to latest", () => {
		expect(extractImageTag("nginx")).toBe("latest");
		expect(extractImageTag("nginx:1.27")).toBe("1.27");
		expect(extractImageTag("myhost:5000/fedora/httpd:v1")).toBe("v1");
	});

	it("detects digest refs", () => {
		expect(isDigestRef("nginx@sha256:abc")).toBe(true);
		expect(isDigestRef("nginx:1.27")).toBe(false);
	});

	it("parses into name/tag/digest", () => {
		expect(parseImageRef("nginx:1.27")).toEqual({
			name: "nginx",
			tag: "1.27",
			digest: null,
		});
		expect(parseImageRef("nginx@sha256:abc")).toEqual({
			name: "nginx",
			tag: null,
			digest: "sha256:abc",
		});
		expect(parseImageRef("r:5000/app:v1@sha256:def")).toEqual({
			name: "r:5000/app",
			tag: "v1",
			digest: "sha256:def",
		});
	});

	it("normalizes Docker Hub shorthand to a canonical repo", () => {
		expect(normalizeRepo("alpine")).toBe("docker.io/library/alpine");
		expect(normalizeRepo("library/alpine")).toBe("docker.io/library/alpine");
		expect(normalizeRepo("user/repo")).toBe("docker.io/user/repo");
		expect(normalizeRepo("ghcr.io/org/app")).toBe("ghcr.io/org/app");
		expect(normalizeRepo("localhost:5000/app")).toBe("localhost:5000/app");
	});

	it("builds a pinned ref preserving the operator's registry/repo", () => {
		expect(buildPinnedRef("ghcr.io/org/app:v1", "sha256:abc")).toBe(
			"ghcr.io/org/app@sha256:abc",
		);
		expect(buildPinnedRef("alpine", "sha256:def")).toBe("alpine@sha256:def");
	});

	it("treats a bare numeric segment as a tag, not a port", () => {
		expect(extractImageName("nginx:123")).toBe("nginx");
		expect(extractImageTag("nginx:123")).toBe("123");
		expect(extractImageName("ghcr.io/org/app:8080")).toBe("ghcr.io/org/app");
		expect(parseImageRef("ghcr.io/org/app:8080")).toEqual({
			name: "ghcr.io/org/app",
			tag: "8080",
			digest: null,
		});
		// host:port/path with no tag is still NOT split (true port case)
		expect(extractImageName("registry:5000/app")).toBe("registry:5000/app");
	});
});
