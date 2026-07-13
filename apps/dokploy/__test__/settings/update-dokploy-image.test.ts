import {
	buildDokployServiceUpdateCommand,
	getDockerImageRepository,
	getDockerImageTagFromReference,
	resolveDokployUpdateImage,
} from "@dokploy/server/services/settings";
import { describe, expect, it } from "vitest";

describe("Dokploy update image resolution", () => {
	it("preserves the current image repository when updating a forked GHCR image", () => {
		expect(
			resolveDokployUpdateImage(
				"ghcr.io/acme/dokploy:0.35.2@sha256:abc123",
				"v0.36.0",
				"latest",
			),
		).toBe("ghcr.io/acme/dokploy:0.36.0");
	});

	it("handles Docker Hub images and registry ports", () => {
		expect(
			resolveDokployUpdateImage("dokploy/dokploy:latest", "v0.36.0", "latest"),
		).toBe("dokploy/dokploy:0.36.0");

		expect(
			resolveDokployUpdateImage(
				"localhost:5000/fork/dokploy@sha256:abc123",
				"v0.36.0",
				"latest",
			),
		).toBe("localhost:5000/fork/dokploy:0.36.0");
	});

	it("keeps canary and feature release channels on their current channel tag", () => {
		expect(
			resolveDokployUpdateImage(
				"ghcr.io/acme/dokploy:canary",
				"v0.36.0",
				"canary",
			),
		).toBe("ghcr.io/acme/dokploy:canary");

		expect(
			resolveDokployUpdateImage(
				"ghcr.io/acme/dokploy:feature",
				"v0.36.0",
				"feature",
			),
		).toBe("ghcr.io/acme/dokploy:feature");
	});

	it("parses repositories and tags without treating registry ports as tags", () => {
		expect(
			getDockerImageRepository("registry.example.com:5000/acme/dokploy:0.36.0"),
		).toBe("registry.example.com:5000/acme/dokploy");
		expect(
			getDockerImageTagFromReference(
				"registry.example.com:5000/acme/dokploy:0.36.0",
			),
		).toBe("0.36.0");

		expect(
			getDockerImageRepository("registry.example.com:5000/acme/dokploy"),
		).toBe("registry.example.com:5000/acme/dokploy");
		expect(
			getDockerImageTagFromReference("registry.example.com:5000/acme/dokploy"),
		).toBe("latest");
	});

	it("builds a stop-first service update command with rollback", () => {
		const command = buildDokployServiceUpdateCommand(
			"dokploy",
			"ghcr.io/acme/dokploy:0.35.2",
			"v0.36.0",
			"latest",
		);

		expect(command).toContain("--update-order stop-first");
		expect(command).not.toContain("--update-order start-first");
		expect(command).toContain("--update-failure-action rollback");
		expect(command).toContain("--with-registry-auth");
		expect(command).toContain("--image ghcr.io/acme/dokploy:0.36.0");
		expect(command).not.toContain("ghcr.io/bl4ckbl1zz/dokploy");
	});
});
