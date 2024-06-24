import { db } from "@/server/db";
import {
	type apiCreateDomain,
	type apiFindDomainByApplication,
	domains,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { findApplicationById } from "./application";
import { manageDomain } from "@/server/utils/traefik/domain";
import { findAdmin } from "./admin";
import { generateRandomDomain } from "@/templates/utils";

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
		port: process.env.NODE_ENV === "development" ? 3000 : 80,
		certificateType: "none",
		https: false,
		path: "/",
	});

	return domain;
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
