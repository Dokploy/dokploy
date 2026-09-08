import { fs, vol } from "memfs";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

import path from "node:path";
import { paths, removeAcmeCertificate } from "@dokploy/server";
import { beforeEach, expect, test, vi } from "vitest";

const { DYNAMIC_TRAEFIK_PATH } = paths();
const acmeJsonPath = path.join(DYNAMIC_TRAEFIK_PATH, "acme.json");

const acmeStore = {
	letsencrypt: {
		Account: { Email: "test@localhost.com" },
		Certificates: [
			{ domain: { main: "example.com" }, certificate: "cert-1", key: "key-1" },
			{
				domain: { main: "app.example.com", sans: ["www.app.example.com"] },
				certificate: "cert-2",
				key: "key-2",
			},
		],
	},
};

beforeEach(() => {
	vol.reset();
	vol.mkdirSync(DYNAMIC_TRAEFIK_PATH, { recursive: true });
	vol.writeFileSync(acmeJsonPath, JSON.stringify(acmeStore));
});

test("removes the certificate matching the deleted host", async () => {
	await removeAcmeCertificate("example.com");

	const updated = JSON.parse(fs.readFileSync(acmeJsonPath, "utf8") as string);
	expect(updated.letsencrypt.Certificates).toHaveLength(1);
	expect(
		updated.letsencrypt.Certificates.some(
			(cert: { domain: { main: string } }) =>
				cert.domain.main === "example.com",
		),
	).toBe(false);
});

test("removes the certificate matching a SAN entry", async () => {
	await removeAcmeCertificate("www.app.example.com");

	const updated = JSON.parse(fs.readFileSync(acmeJsonPath, "utf8") as string);
	expect(updated.letsencrypt.Certificates).toHaveLength(1);
	expect(updated.letsencrypt.Certificates[0].domain.main).toBe("example.com");
});

test("is case-insensitive when matching the host", async () => {
	await removeAcmeCertificate("EXAMPLE.com");

	const updated = JSON.parse(fs.readFileSync(acmeJsonPath, "utf8") as string);
	expect(updated.letsencrypt.Certificates).toHaveLength(1);
});

test("is a no-op when the host has no matching certificate", async () => {
	await removeAcmeCertificate("unrelated.com");

	const updated = JSON.parse(fs.readFileSync(acmeJsonPath, "utf8") as string);
	expect(updated.letsencrypt.Certificates).toHaveLength(2);
});

test("does not throw when acme.json does not exist", async () => {
	vol.reset();

	await expect(removeAcmeCertificate("example.com")).resolves.not.toThrow();
});
