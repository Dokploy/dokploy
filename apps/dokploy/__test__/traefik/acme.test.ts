import type { AcmeStore } from "@dokploy/server";
import { removeAcmeCertificates } from "@dokploy/server";
import { describe, expect, it } from "vitest";

const buildStore = (mains: string[]): AcmeStore => ({
	letsencrypt: {
		Account: { Email: "test@example.com" },
		Certificates: mains.map((main) => ({
			domain: { main },
			certificate: "cert",
			key: "key",
		})),
	},
});

describe("removeAcmeCertificates", () => {
	it("removes only the requested hosts", () => {
		const store = buildStore(["a.example.com", "b.example.com"]);

		const result = removeAcmeCertificates(store, ["a.example.com"]);

		expect(result.removed).toEqual(["a.example.com"]);
		expect(result.store.letsencrypt?.Certificates).toHaveLength(1);
		expect(result.store.letsencrypt?.Certificates?.[0]?.domain.main).toBe(
			"b.example.com",
		);
	});

	it("keeps the Account object intact", () => {
		const store = buildStore(["a.example.com"]);

		const result = removeAcmeCertificates(store, ["a.example.com"]);

		expect(result.store.letsencrypt?.Account).toEqual({
			Email: "test@example.com",
		});
		expect(result.store.letsencrypt?.Certificates).toEqual([]);
	});

	it("reports nothing removed when the host is absent", () => {
		const store = buildStore(["a.example.com"]);

		const result = removeAcmeCertificates(store, ["other.example.com"]);

		expect(result.removed).toEqual([]);
		expect(result.store.letsencrypt?.Certificates).toHaveLength(1);
	});

	it("tolerates a resolver with no Certificates array", () => {
		const store: AcmeStore = { letsencrypt: { Account: {} } };

		const result = removeAcmeCertificates(store, ["a.example.com"]);

		expect(result.removed).toEqual([]);
	});

	it("does not mutate the input store", () => {
		const store = buildStore(["a.example.com"]);

		removeAcmeCertificates(store, ["a.example.com"]);

		expect(store.letsencrypt?.Certificates).toHaveLength(1);
	});
});

describe("removeAcmeCertificates with multiple resolvers", () => {
	it("only touches the resolver that holds the host", () => {
		const store: AcmeStore = {
			letsencrypt: {
				Account: {},
				Certificates: [
					{ domain: { main: "a.example.com" }, certificate: "c", key: "k" },
				],
			},
			other: {
				Account: {},
				Certificates: [
					{ domain: { main: "b.example.com" }, certificate: "c", key: "k" },
				],
			},
		};

		const result = removeAcmeCertificates(store, ["a.example.com"]);

		expect(result.removed).toEqual(["a.example.com"]);
		expect(result.store.letsencrypt?.Certificates).toEqual([]);
		expect(result.store.other?.Certificates).toHaveLength(1);
	});
});
