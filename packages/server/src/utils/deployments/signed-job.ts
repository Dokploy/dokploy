import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { findApplicationById } from "@dokploy/server/services/application";
import { findComposeById } from "@dokploy/server/services/compose";
import { findPreviewDeploymentById } from "@dokploy/server/services/preview-deployment";
import { findServerById } from "@dokploy/server/services/server";

export type DeploymentQueueJob =
	| {
			applicationId: string;
			titleLog?: string;
			descriptionLog?: string;
			server?: boolean;
			type: "deploy" | "redeploy";
			applicationType: "application";
			serverId: string;
	  }
	| {
			composeId: string;
			titleLog?: string;
			descriptionLog?: string;
			server?: boolean;
			type: "deploy" | "redeploy";
			applicationType: "compose";
			serverId: string;
	  }
	| {
			applicationId: string;
			previewDeploymentId: string;
			titleLog?: string;
			descriptionLog?: string;
			server?: boolean;
			type: "deploy" | "redeploy";
			applicationType: "application-preview";
			serverId: string;
	  };

export type DeploymentCancelJob =
	| { applicationId: string; applicationType: "application" }
	| { composeId: string; applicationType: "compose" };

export type DeploymentJobOperation = "deploy" | "cancel";
export type DeploymentJobsReadOperation = "read-jobs";

export type DeploymentJobScope = {
	version: 1;
	operation: DeploymentJobOperation;
	applicationType: DeploymentQueueJob["applicationType"];
	objectId: string;
	applicationId: string | null;
	deploymentType: DeploymentQueueJob["type"] | null;
	serverId: string | null;
	organizationId: string | null;
	expiresAt: number;
	nonce: string;
};

export type SignedDeploymentQueueJob = DeploymentQueueJob & {
	scope: DeploymentJobScope;
	signature: string;
};

export type SignedDeploymentCancelJob = DeploymentCancelJob & {
	scope: DeploymentJobScope;
	signature: string;
};

export type DeploymentJobsReadScope = {
	version: 1;
	operation: DeploymentJobsReadOperation;
	serverId: string;
	organizationId: string | null;
	expiresAt: number;
	nonce: string;
};

export type SignedDeploymentJobsReadRequest = {
	serverId: string;
	scope: DeploymentJobsReadScope;
	signature: string;
};

type ScopeOptions = {
	now?: number;
	requireActiveServer?: boolean;
	ttlMs?: number;
};

type SigningOptions = ScopeOptions & {
	operation: DeploymentJobOperation;
};

const DEFAULT_SCOPE_TTL_MS = 5 * 60_000;
const LEGACY_API_KEY_DERIVATION_CONTEXT = "dokploy:deployments-signing-key:v1";

const deriveLegacySigningKey = (apiKey: string) =>
	createHmac("sha256", apiKey)
		.update(LEGACY_API_KEY_DERIVATION_CONTEXT)
		.digest("base64url");

const getSigningKey = () => {
	const key = process.env.DEPLOYMENTS_SIGNING_KEY?.trim();
	if (!key) {
		const legacyApiKey = process.env.API_KEY?.trim();
		if (legacyApiKey) {
			return deriveLegacySigningKey(legacyApiKey);
		}
		throw new Error(
			"Deployment job signing key is not configured. Set DEPLOYMENTS_SIGNING_KEY or API_KEY before managing deployment jobs.",
		);
	}
	if (process.env.API_KEY?.trim() && key === process.env.API_KEY.trim()) {
		throw new Error("Deployment job signing key must differ from the API key");
	}
	return key;
};

const canonicalScope = (scope: DeploymentJobScope) =>
	JSON.stringify({
		version: scope.version,
		operation: scope.operation,
		applicationType: scope.applicationType,
		objectId: scope.objectId,
		applicationId: scope.applicationId,
		deploymentType: scope.deploymentType,
		serverId: scope.serverId,
		organizationId: scope.organizationId,
		expiresAt: scope.expiresAt,
		nonce: scope.nonce,
	});

const signScope = (scope: DeploymentJobScope) =>
	createHmac("sha256", getSigningKey())
		.update(canonicalScope(scope))
		.digest("base64url");

const canonicalReadScope = (scope: DeploymentJobsReadScope) =>
	JSON.stringify({
		version: scope.version,
		operation: scope.operation,
		serverId: scope.serverId,
		organizationId: scope.organizationId,
		expiresAt: scope.expiresAt,
		nonce: scope.nonce,
	});

const signReadScope = (scope: DeploymentJobsReadScope) =>
	createHmac("sha256", getSigningKey())
		.update(canonicalReadScope(scope))
		.digest("base64url");

const assertEqual = (field: string, expected: unknown, actual: unknown) => {
	if (expected !== actual) {
		throw new Error(`Deployment job ${field} does not match its scoped claim`);
	}
};

const assertServerActive = async (serverId: string | null) => {
	if (!serverId) {
		return;
	}
	const server = await findServerById(serverId);
	if (server.serverStatus === "inactive") {
		throw new Error("Deployment job server is inactive");
	}
};

const buildApplicationScope = async (
	applicationId: string,
	options: SigningOptions,
) => {
	const application = await findApplicationById(applicationId);
	const serverId = application.serverId ?? null;
	if (options.requireActiveServer ?? true) {
		await assertServerActive(serverId);
	}
	return {
		objectId: application.applicationId,
		applicationId: application.applicationId,
		serverId,
		organizationId: application.environment.project.organizationId,
	};
};

const buildComposeScope = async (
	composeId: string,
	options: SigningOptions,
) => {
	const compose = await findComposeById(composeId);
	const serverId = compose.serverId ?? null;
	if (options.requireActiveServer ?? true) {
		await assertServerActive(serverId);
	}
	return {
		objectId: compose.composeId,
		applicationId: null,
		serverId,
		organizationId: compose.environment.project.organizationId,
	};
};

const buildPreviewScope = async (
	job: Extract<DeploymentQueueJob, { applicationType: "application-preview" }>,
	options: SigningOptions,
) => {
	const previewDeployment = await findPreviewDeploymentById(
		job.previewDeploymentId,
	);
	assertEqual(
		"application id",
		previewDeployment.applicationId,
		job.applicationId,
	);
	const application = await findApplicationById(
		previewDeployment.applicationId,
	);
	const serverId =
		previewDeployment.application?.serverId ?? application.serverId;
	if (options.requireActiveServer ?? true) {
		await assertServerActive(serverId ?? null);
	}
	return {
		objectId: previewDeployment.previewDeploymentId,
		applicationId: previewDeployment.applicationId,
		serverId: serverId ?? null,
		organizationId: application.environment.project.organizationId,
	};
};

const buildScope = async (
	job: DeploymentQueueJob | DeploymentCancelJob,
	options: SigningOptions,
): Promise<DeploymentJobScope> => {
	const now = options.now ?? Date.now();
	const expiresAt = now + (options.ttlMs ?? DEFAULT_SCOPE_TTL_MS);
	const scope =
		job.applicationType === "application"
			? await buildApplicationScope(job.applicationId, options)
			: job.applicationType === "compose"
				? await buildComposeScope(job.composeId, options)
				: await buildPreviewScope(job, options);

	if ("serverId" in job) {
		assertEqual("server scope", scope.serverId, job.serverId);
	}

	return {
		version: 1,
		operation: options.operation,
		applicationType: job.applicationType,
		objectId: scope.objectId,
		applicationId: scope.applicationId,
		deploymentType: "type" in job ? job.type : null,
		serverId: scope.serverId,
		organizationId: scope.organizationId,
		expiresAt,
		nonce: randomUUID(),
	};
};

const buildReadScope = async (
	serverId: string,
	options: ScopeOptions,
): Promise<DeploymentJobsReadScope> => {
	const now = options.now ?? Date.now();
	const expiresAt = now + (options.ttlMs ?? DEFAULT_SCOPE_TTL_MS);
	const server = await findServerById(serverId);
	return {
		version: 1,
		operation: "read-jobs",
		serverId: server.serverId,
		organizationId: server.organizationId,
		expiresAt,
		nonce: randomUUID(),
	};
};

const assertScopeMatchesJob = (
	job: DeploymentQueueJob | DeploymentCancelJob,
	scope: DeploymentJobScope,
	options: SigningOptions,
) => {
	assertEqual("operation", scope.operation, options.operation);
	assertEqual("application type", scope.applicationType, job.applicationType);
	if (job.applicationType === "application") {
		assertEqual("object id", scope.objectId, job.applicationId);
		assertEqual("application id", scope.applicationId, job.applicationId);
	} else if (job.applicationType === "compose") {
		assertEqual("object id", scope.objectId, job.composeId);
		assertEqual("application id", scope.applicationId, null);
	} else {
		assertEqual("object id", scope.objectId, job.previewDeploymentId);
		assertEqual("application id", scope.applicationId, job.applicationId);
	}
	assertEqual(
		"deployment type",
		scope.deploymentType,
		"type" in job ? job.type : null,
	);
	if ("serverId" in job) {
		assertEqual("server scope", scope.serverId, job.serverId);
	}
};

const assertReadScopeMatchesRequest = (
	request: SignedDeploymentJobsReadRequest,
) => {
	assertEqual("operation", request.scope.operation, "read-jobs");
	assertEqual("server scope", request.scope.serverId, request.serverId);
};

const verifySignature = (
	job: SignedDeploymentQueueJob | SignedDeploymentCancelJob,
) => {
	const expected = signScope(job.scope);
	const expectedBuffer = Buffer.from(expected);
	const actualBuffer = Buffer.from(job.signature);
	if (
		expectedBuffer.length !== actualBuffer.length ||
		!timingSafeEqual(expectedBuffer, actualBuffer)
	) {
		throw new Error("Deployment job scoped claim signature is invalid");
	}
};

const verifyReadSignature = (request: SignedDeploymentJobsReadRequest) => {
	const expected = signReadScope(request.scope);
	const expectedBuffer = Buffer.from(expected);
	const actualBuffer = Buffer.from(request.signature);
	if (
		expectedBuffer.length !== actualBuffer.length ||
		!timingSafeEqual(expectedBuffer, actualBuffer)
	) {
		throw new Error("Deployment jobs read scoped claim signature is invalid");
	}
};

export const signDeploymentQueueJob = async (
	job: DeploymentQueueJob,
	options: SigningOptions,
): Promise<SignedDeploymentQueueJob> => {
	const scope = await buildScope(job, options);
	return {
		...job,
		scope,
		signature: signScope(scope),
	};
};

export const signDeploymentCancelJob = async (
	job: DeploymentCancelJob,
	options: SigningOptions,
): Promise<SignedDeploymentCancelJob> => {
	const scope = await buildScope(job, options);
	return {
		...job,
		scope,
		signature: signScope(scope),
	};
};

export const signDeploymentJobsReadRequest = async (
	serverId: string,
	options: ScopeOptions = {},
): Promise<SignedDeploymentJobsReadRequest> => {
	const scope = await buildReadScope(serverId, options);
	return {
		serverId,
		scope,
		signature: signReadScope(scope),
	};
};

export const assertSignedDeploymentQueueJob = async (
	job: SignedDeploymentQueueJob,
	options: SigningOptions & { requireFreshScope?: boolean },
): Promise<DeploymentQueueJob> => {
	assertScopeMatchesJob(job, job.scope, options);
	verifySignature(job);
	if (job.scope.expiresAt <= (options.now ?? Date.now())) {
		throw new Error("Deployment job scoped claim has expired");
	}
	if (options.requireFreshScope ?? true) {
		const freshScope = await buildScope(job, {
			...options,
			ttlMs: job.scope.expiresAt - (options.now ?? Date.now()),
		});
		assertEqual("server scope", freshScope.serverId, job.scope.serverId);
		assertEqual(
			"organization scope",
			freshScope.organizationId,
			job.scope.organizationId,
		);
	}

	const { scope: _scope, signature: _signature, ...queueJob } = job;
	return queueJob;
};

export const assertSignedDeploymentCancelJob = async (
	job: SignedDeploymentCancelJob,
	options: SigningOptions & { requireFreshScope?: boolean },
): Promise<DeploymentCancelJob> => {
	assertScopeMatchesJob(job, job.scope, options);
	verifySignature(job);
	if (job.scope.expiresAt <= (options.now ?? Date.now())) {
		throw new Error("Deployment job scoped claim has expired");
	}
	if (options.requireFreshScope ?? true) {
		const freshScope = await buildScope(job, {
			...options,
			ttlMs: job.scope.expiresAt - (options.now ?? Date.now()),
		});
		assertEqual("server scope", freshScope.serverId, job.scope.serverId);
		assertEqual(
			"organization scope",
			freshScope.organizationId,
			job.scope.organizationId,
		);
	}

	const { scope: _scope, signature: _signature, ...cancelJob } = job;
	return cancelJob;
};

export const assertSignedDeploymentJobsReadRequest = async (
	request: SignedDeploymentJobsReadRequest,
	options: ScopeOptions & { requireFreshScope?: boolean } = {},
): Promise<string> => {
	assertReadScopeMatchesRequest(request);
	verifyReadSignature(request);
	if (request.scope.expiresAt <= (options.now ?? Date.now())) {
		throw new Error("Deployment jobs read scoped claim has expired");
	}
	if (options.requireFreshScope ?? true) {
		const freshScope = await buildReadScope(request.serverId, {
			...options,
			ttlMs: request.scope.expiresAt - (options.now ?? Date.now()),
		});
		assertEqual("server scope", freshScope.serverId, request.scope.serverId);
		assertEqual(
			"organization scope",
			freshScope.organizationId,
			request.scope.organizationId,
		);
	}
	return request.serverId;
};
