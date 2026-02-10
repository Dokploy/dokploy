import type { ComposeSpecification, Domain } from "@dokploy/server";
import { assertDomainsMatchComposeServices } from "@dokploy/server";
import { expect, test } from "vitest";

const baseDomain: Domain = {
	applicationId: "",
	certificateType: "none",
	createdAt: "",
	domainId: "",
	host: "",
	https: false,
	path: null,
	port: null,
	serviceName: "",
	composeId: "",
	customCertResolver: null,
	domainType: "application",
	uniqueConfigKey: 1,
	previewDeploymentId: "",
	internalPath: "/",
	stripPath: false,
};

test("throws a clear error when a domain references a missing compose service", () => {
	const composeSpec = {
		services: {
			"python-backend": {},
		},
	} as ComposeSpecification;

	const domains = [
		{
			...baseDomain,
			host: "api.example.com",
			serviceName: "php-backend",
		},
	];

	expect(() => assertDomainsMatchComposeServices(composeSpec, domains)).toThrow(
		/Domain configuration references a service.*api\.example\.com.*php-backend.*python-backend/i,
	);
});

test("does not throw when all domains reference existing services", () => {
	const composeSpec = {
		services: {
			"python-backend": {},
		},
	} as ComposeSpecification;

	const domains = [
		{
			...baseDomain,
			host: "api.example.com",
			serviceName: "python-backend",
		},
	];

	expect(() =>
		assertDomainsMatchComposeServices(composeSpec, domains),
	).not.toThrow();
});
