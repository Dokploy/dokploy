import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { IS_CLOUD } from "../../constants";
import { db } from "../../db";
import { deployments, organization } from "../../db/schema";

export const POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_PROJECT_KEY = "phc_v5vhiTaD9Pq92jZihu3xoYAhX6VQL97wt5sCCY5FpYVu";

export const getPostHogKey = () => (IS_CLOUD ? POSTHOG_PROJECT_KEY : null);

interface CaptureInput {
	distinctId: string;
	event: string;
	organizationId?: string | null;
	sessionId?: string | null;
	uuid?: string;
	timestamp?: Date;
	properties?: Record<string, unknown>;
}

// PostHog drops events that repeat the same uuid and timestamp, so a stable seed
// (e.g. a Stripe event id) keeps webhook retries from being counted twice.
export const stableEventUuid = (seed: string) => {
	const hex = createHash("sha1").update(seed).digest("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

// posthog-js sends this header (tracing_headers) so server events can link to the browser's session replay.
export const getPostHogSessionId = (
	headers: Headers | Record<string, string | string[] | undefined> | undefined,
) => {
	const value =
		headers instanceof Headers
			? headers.get("x-posthog-session-id")
			: headers?.["x-posthog-session-id"];
	return typeof value === "string" && value.length > 0 ? value : null;
};

export const captureEvent = async ({
	distinctId,
	event,
	organizationId,
	sessionId,
	uuid,
	timestamp = new Date(),
	properties = {},
}: CaptureInput) => {
	const apiKey = getPostHogKey();
	if (!apiKey) return;

	try {
		const response = await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				api_key: apiKey,
				event,
				distinct_id: distinctId,
				timestamp: timestamp.toISOString(),
				...(uuid ? { uuid } : {}),
				properties: {
					...properties,
					...(sessionId ? { $session_id: sessionId } : {}),
					...(organizationId
						? { $groups: { organization: organizationId } }
						: {}),
				},
			}),
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) {
			console.error(
				`PostHog rejected event ${event}: ${response.status} ${await response.text().catch(() => "")}`,
			);
		}
	} catch (error) {
		console.error(`Failed to send PostHog event ${event}`, error);
	}
};

const findOrganizationOwnerId = async (organizationId: string) => {
	const org = await db.query.organization.findFirst({
		where: eq(organization.id, organizationId),
		columns: { ownerId: true },
	});
	return org?.ownerId ?? null;
};

export const trackDeploymentResult = async (
	deploymentId: string,
	status: "done" | "error",
) => {
	if (!getPostHogKey()) return;

	const deployment = await db.query.deployments.findFirst({
		where: eq(deployments.deploymentId, deploymentId),
		with: {
			application: {
				columns: { sourceType: true, buildType: true },
				with: {
					environment: {
						with: { project: { columns: { organizationId: true } } },
					},
				},
			},
			compose: {
				columns: { sourceType: true, composeType: true },
				with: {
					environment: {
						with: { project: { columns: { organizationId: true } } },
					},
				},
			},
			server: { columns: { organizationId: true, serverType: true } },
		},
	});
	if (!deployment || deployment.previewDeploymentId) return;

	const succeeded = status === "done";
	let event: string;
	let organizationId: string;
	let properties: Record<string, unknown>;

	if (deployment.application) {
		event = succeeded ? "deployment_succeeded" : "deployment_failed";
		organizationId = deployment.application.environment.project.organizationId;
		properties = {
			service_type: "application",
			source_type: deployment.application.sourceType,
			build_type: deployment.application.buildType,
		};
	} else if (deployment.compose) {
		event = succeeded ? "deployment_succeeded" : "deployment_failed";
		organizationId = deployment.compose.environment.project.organizationId;
		properties = {
			service_type: "compose",
			source_type: deployment.compose.sourceType,
			compose_type: deployment.compose.composeType,
		};
	} else if (
		deployment.server &&
		!deployment.scheduleId &&
		!deployment.backupId &&
		!deployment.volumeBackupId
	) {
		event = succeeded ? "server_setup_succeeded" : "server_setup_failed";
		organizationId = deployment.server.organizationId;
		properties = { server_type: deployment.server.serverType };
	} else {
		return;
	}

	const ownerId = await findOrganizationOwnerId(organizationId);
	if (!ownerId) return;

	await captureEvent({
		distinctId: ownerId,
		event,
		organizationId,
		properties,
	});
};
