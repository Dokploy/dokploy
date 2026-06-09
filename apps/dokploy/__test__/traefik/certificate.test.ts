import path from "node:path";
import { getCertificateConfigPath } from "@dokploy/server/services/certificate";
import { describe, expect, test } from "vitest";

describe("getCertificateConfigPath", () => {
	const dynamicTraefikPath = path.join("/etc", "dokploy", "traefik", "dynamic");

	test("writes the certificate config at the TOP LEVEL of the dynamic dir", () => {
		const certificatePath = "my-cert";
		const result = getCertificateConfigPath(dynamicTraefikPath, certificatePath);

		// Must be the top-level file, NOT nested under a per-cert subdirectory.
		expect(result).toBe(
			path.join(dynamicTraefikPath, `${certificatePath}-certificate.yml`),
		);
	});

	test("does NOT place the config inside the certificates/ subdirectory", () => {
		const result = getCertificateConfigPath(dynamicTraefikPath, "my-cert");

		// Traefik's file.directory provider is non-recursive, so the config must
		// not live under a subdirectory like /certificates/<id>/.
		expect(result).not.toContain(`${path.sep}certificates${path.sep}`);
		expect(path.dirname(result)).toBe(dynamicTraefikPath);
	});

	test("produces a unique filename per certificatePath", () => {
		const a = getCertificateConfigPath(dynamicTraefikPath, "cert-a");
		const b = getCertificateConfigPath(dynamicTraefikPath, "cert-b");

		expect(a).not.toBe(b);
		expect(a).toBe(
			path.join(dynamicTraefikPath, "cert-a-certificate.yml"),
		);
		expect(b).toBe(
			path.join(dynamicTraefikPath, "cert-b-certificate.yml"),
		);
	});
});
