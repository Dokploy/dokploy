import { db } from "@dokploy/server/db";
import {
	type apiCreateDomain,
	type apiFindDomainByApplication,
	domains,
} from "@dokploy/server/db/schema";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { generateRandomDomain } from "@dokploy/templates/utils";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { findAdmin } from "./admin";
import { findApplicationById } from "./application";

export type Domain = typeof domains.$inferSelect;

export const createDomain = async (input: typeof apiCreateDomain._type) => {
	await db.transaction(async (tx) => {
		const application = await findApplicationById(input.applicationId);

		const domain = await tx
			.insert(domains)
			.values({
				...input,
			})
			.returning()
			.then((response) => response[0]);

		if (!domain) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to create the domain",
			});
		}

		await manageDomain(application, domain);
	});
};

export const generateDomain = async (
	input: typeof apiFindDomainByApplication._type,
) => {
	const application = await findApplicationById(input.applicationId);
	const admin = await findAdmin();
	const domain = await createDomain({
		applicationId: application.applicationId,
		host: generateRandomDomain({
			serverIp: admin.serverIp || "",
			projectName: application.appName,
		}),
		port: 3000,
		certificateType: "none",
		https: false,
		path: "/",
	});

	return domain;
};

export const generateWildcard = async (
	input: typeof apiFindDomainByApplication._type,
) => {
	const application = await findApplicationById(input.applicationId);
	const admin = await findAdmin();

	if (!admin.host) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "We need a host to generate a wildcard domain",
		});
	}
	const domain = await createDomain({
		applicationId: application.applicationId,
		host: generateWildcardDomain(application.appName, admin.host || ""),
		port: 3000,
		certificateType: "none",
		https: false,
		path: "/",
	});

	return domain;
};

export const generateWildcardDomain = (
	appName: string,
	serverDomain: string,
) => {
	return `${appName}-${serverDomain}`;
};

export const findDomainById = async (domainId: string) => {
	const domain = await db.query.domains.findFirst({
		where: eq(domains.domainId, domainId),
		with: {
			application: true,
		},
	});
	if (!domain) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Domain not found",
		});
	}
	return domain;
};

export const findDomainsByApplicationId = async (applicationId: string) => {
	const domainsArray = await db.query.domains.findMany({
		where: eq(domains.applicationId, applicationId),
		with: {
			application: true,
		},
	});

	return domainsArray;
};

export const updateDomainById = async (
	domainId: string,
	domainData: Partial<Domain>,
) => {
	const domain = await db
		.update(domains)
		.set({
			...domainData,
		})
		.where(eq(domains.domainId, domainId))
		.returning();

	return domain[0];
};

export const removeDomainById = async (domainId: string) => {
	await findDomainById(domainId);
	// TODO: fix order
	const result = await db
		.delete(domains)
		.where(eq(domains.domainId, domainId))
		.returning();

	return result[0];
};
