import type { FileConfig } from "@dokploy/server";
import { routerNeedsTlsFix } from "@dokploy/server";
import { describe, expect, it } from "vitest";

const configWithRouter = (
	tls: Record<string, unknown> | undefined,
): FileConfig => ({
	http: {
		routers: {
			"my-app-router-websecure-1": {
				rule: "Host(`example.com`)",
				service: "my-app-service-1",
				entryPoints: ["websecure"],
				...(tls === undefined ? {} : { tls }),
			},
		},
		services: {},
	},
});

describe("routerNeedsTlsFix", () => {
	it("is true when the websecure router has no tls key", () => {
		expect(routerNeedsTlsFix(configWithRouter(undefined), "my-app", 1)).toBe(
			true,
		);
	});

	it("is false when the router already has an empty tls block", () => {
		expect(routerNeedsTlsFix(configWithRouter({}), "my-app", 1)).toBe(false);
	});

	it("is false when the router has a cert resolver", () => {
		expect(
			routerNeedsTlsFix(
				configWithRouter({ certResolver: "letsencrypt" }),
				"my-app",
				1,
			),
		).toBe(false);
	});

	it("is false when the router does not exist", () => {
		expect(routerNeedsTlsFix(configWithRouter(undefined), "other-app", 1)).toBe(
			false,
		);
	});

	it("is false for an empty config", () => {
		expect(routerNeedsTlsFix({}, "my-app", 1)).toBe(false);
	});
});
