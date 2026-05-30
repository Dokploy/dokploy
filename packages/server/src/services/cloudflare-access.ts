import { db } from "@dokploy/server/db";
import { cloudflareAccessApplication } from "@dokploy/server/db/schema";
import { findCloudflareById } from "@dokploy/server/services/cloudflare";
import { type Domain, updateDomainById } from "@dokploy/server/services/domain";
import {
	buildAccessIncludeRules,
	createAccessApplication,
	createAccessPolicy,
	deleteAccessApplication,
	updateAccessApplication,
	updateAccessPolicy,
} from "@dokploy/server/utils/providers/cloudflare";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type CloudflareAccessApplication =
	typeof cloudflareAccessApplication.$inferSelect;

export const findAccessApplicationByDomainId = async (
	domainId: string,
): Promise<CloudflareAccessApplication | undefined> =>
	db.query.cloudflareAccessApplication.findFirst({
		where: eq(cloudflareAccessApplication.domainId, domainId),
	});

const ACCESS_POLICY_NAME = "Dokploy allow policy";

const accessAppName = (host: string) => `Dokploy - ${host}`;

export interface AccessConfigInput {
	sessionDuration?: string;
	allowEmails: string[];
	allowEmailDomains: string[];
}

/**
 * Creates or updates a self-hosted Cloudflare Access application (+ allow
 * policy) for a published domain. Idempotent. Requires the domain to be
 * published via Cloudflare and at least one allow rule (an allow policy with no
 * include rules would lock everyone out).
 */
export const provisionCloudflareAccessForDomain = async (
	domain: Domain,
	config: AccessConfigInput,
): Promise<CloudflareAccessApplication> => {
	if (!domain.publishToCloudflare || !domain.cloudflareId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cloudflare Access can only be enabled on a domain published via Cloudflare",
		});
	}

	const [integration, existing] = await Promise.all([
		findCloudflareById(domain.cloudflareId),
		findAccessApplicationByDomainId(domain.domainId),
	]);
	const { apiToken, accountId, organizationId } = integration;

	// Fall back to the integration's org defaults when the caller supplied no
	// identities/duration of its own. This lets "protect by default" provision
	// Access without re-entering the allow-list each time. Identities fall back
	// only when BOTH lists are empty, so a caller that set just emails keeps them.
	const hasOwnIdentities =
		config.allowEmails.length > 0 || config.allowEmailDomains.length > 0;
	const allowEmails = hasOwnIdentities
		? config.allowEmails
		: integration.defaultAllowEmails;
	const allowEmailDomains = hasOwnIdentities
		? config.allowEmailDomains
		: integration.defaultAllowEmailDomains;
	const sessionDuration =
		config.sessionDuration || integration.defaultSessionDuration || "24h";

	const include = buildAccessIncludeRules(allowEmails, allowEmailDomains);
	if (include.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Add at least one allowed email or email domain before enabling Access",
		});
	}

	if (existing) {
		await updateAccessApplication(
			apiToken,
			accountId,
			existing.cloudflareAppId,
			{
				name: accessAppName(domain.host),
				domain: domain.host,
				sessionDuration,
			},
		);
		let policyId = existing.cloudflarePolicyId;
		if (policyId) {
			await updateAccessPolicy(
				apiToken,
				accountId,
				existing.cloudflareAppId,
				policyId,
				{ name: ACCESS_POLICY_NAME, include },
			);
		} else {
			const policy = await createAccessPolicy(
				apiToken,
				accountId,
				existing.cloudflareAppId,
				{ name: ACCESS_POLICY_NAME, include },
			);
			policyId = policy.id;
		}
		const updated = await db
			.update(cloudflareAccessApplication)
			.set({
				appDomain: domain.host,
				sessionDuration,
				allowEmails,
				allowEmailDomains,
				cloudflarePolicyId: policyId,
			})
			.where(eq(cloudflareAccessApplication.id, existing.id))
			.returning()
			.then((rows) => rows[0]);
		if (!updated) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to update Cloudflare Access application",
			});
		}
		return updated;
	}

	// Create the Access application, then its app-scoped allow policy. If any
	// later step fails, compensate by deleting the app so we never leave an
	// orphaned external application without a persisted row.
	const app = await createAccessApplication(apiToken, accountId, {
		name: accessAppName(domain.host),
		domain: domain.host,
		sessionDuration,
	});
	const compensate = () =>
		deleteAccessApplication(apiToken, accountId, app.id).catch(() => {
			// best-effort: the app may already be gone
		});

	let policyId: string | null = null;
	try {
		const policy = await createAccessPolicy(apiToken, accountId, app.id, {
			name: ACCESS_POLICY_NAME,
			include,
		});
		policyId = policy.id;
	} catch (error) {
		await compensate();
		throw error;
	}

	let inserted: CloudflareAccessApplication | undefined;
	try {
		inserted = await db
			.insert(cloudflareAccessApplication)
			.values({
				organizationId,
				cloudflareId: domain.cloudflareId,
				domainId: domain.domainId,
				cloudflareAppId: app.id,
				cloudflarePolicyId: policyId,
				appDomain: domain.host,
				sessionDuration,
				allowEmails,
				allowEmailDomains,
			})
			.returning()
			.then((rows) => rows[0]);
	} catch (error) {
		// Persistence failed (e.g. unique domainId conflict from a concurrent
		// enable) — don't leave the external Access app orphaned.
		await compensate();
		throw error;
	}

	if (!inserted) {
		await compensate();
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to persist Cloudflare Access application",
		});
	}

	await updateDomainById(domain.domainId, {
		enableCloudflareAccess: true,
		cloudflareAccessApplicationId: inserted.id,
	});

	return inserted;
};

/**
 * Removes the Cloudflare Access application for a domain (deleting the app also
 * removes its policies). Best-effort and idempotent; clears the domain status.
 */
export const deprovisionCloudflareAccessForDomain = async (
	domain: Domain,
): Promise<void> => {
	const existing = await findAccessApplicationByDomainId(domain.domainId);
	if (!existing) {
		// Make sure the domain status doesn't claim Access is on.
		if (domain.enableCloudflareAccess) {
			await updateDomainById(domain.domainId, {
				enableCloudflareAccess: false,
				cloudflareAccessApplicationId: null,
			});
		}
		return;
	}

	const integration = await findCloudflareById(existing.cloudflareId).catch(
		() => null,
	);
	if (integration) {
		try {
			await deleteAccessApplication(
				integration.apiToken,
				integration.accountId,
				existing.cloudflareAppId,
			);
		} catch {
			// best-effort: the app may already be gone
		}
	}

	await db
		.delete(cloudflareAccessApplication)
		.where(eq(cloudflareAccessApplication.id, existing.id));

	await updateDomainById(domain.domainId, {
		enableCloudflareAccess: false,
		cloudflareAccessApplicationId: null,
	});
};
