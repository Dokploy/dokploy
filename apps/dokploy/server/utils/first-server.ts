import {
	captureEvent,
	findServersByUserId,
	findUserById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import ServerSetupFailedEmail from "@dokploy/server/emails/emails/server-setup-failed";
import { sendEmail } from "@dokploy/server/verification/send-verification-email";
import { render } from "@react-email/components";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { Client } from "ssh2";
import { CONNECT_FAILURES, type ConnectFailKind } from "@/lib/onboarding";
import { user } from "@/server/db/schema";
import {
	getBillingStatus,
	startTrial,
	TRIAL_DURATION_DAYS,
} from "@/server/utils/billing";
import { WEBSITE_URL } from "@/server/utils/stripe";

// Below the advertised 2 GB / 30 GB because providers report less than the
// plan size (kernel reserve, GiB vs GB).
const MIN_MEMORY_MB = 1700;
const MIN_DISK_GB = 25;
const FAILED_EMAIL_INTERVAL_MS = 60 * 60 * 1000;
const REQUIREMENTS_TIMEOUT_MS = 30_000;
const REQUIREMENTS_MAX_OUTPUT = 16 * 1024;

const REQUIREMENTS_COMMAND = `
. /etc/os-release 2>/dev/null
echo "os=$ID"
awk '/MemTotal/ {print "memory=" int($2/1024)}' /proc/meminfo
df -Pk / | awk 'NR==2 {print "disk=" int($2/1048576)}'
`;

interface SshTarget {
	ipAddress: string;
	privateKey: string;
}

const readRequirements = (target: SshTarget) =>
	new Promise<Record<string, string>>((resolve, reject) => {
		const client = new Client();
		const fail = (error: Error) => {
			clearTimeout(deadline);
			client.destroy();
			reject(error);
		};
		const deadline = setTimeout(
			() => fail(new Error("Requirements check timed out")),
			REQUIREMENTS_TIMEOUT_MS,
		);
		client
			.once("ready", () => {
				client.exec(REQUIREMENTS_COMMAND, (error, stream) => {
					if (error) {
						fail(error);
						return;
					}
					let output = "";
					stream
						.on("data", (data: Buffer) => {
							if (output.length + data.length > REQUIREMENTS_MAX_OUTPUT) {
								fail(new Error("Requirements check returned too much output"));
								return;
							}
							output += data.toString();
						})
						.on("close", () => {
							clearTimeout(deadline);
							client.end();
							resolve(
								Object.fromEntries(
									output
										.split("\n")
										.map((line) => line.trim().split("="))
										.filter((pair) => pair.length === 2),
								),
							);
						})
						.stderr.on("data", () => {});
				});
			})
			.once("error", fail)
			.connect({
				host: target.ipAddress,
				port: 22,
				username: "root",
				privateKey: target.privateKey,
				readyTimeout: 15_000,
			});
	});

export const checkServerRequirements = async (
	target: SshTarget,
): Promise<ConnectFailKind | null> => {
	let facts: Record<string, string>;
	try {
		facts = await readRequirements(target);
	} catch {
		return "ssh";
	}
	if (facts.os !== "ubuntu" && facts.os !== "debian") return "os";
	if (Number(facts.memory) < MIN_MEMORY_MB) return "memory";
	if (Number(facts.disk) < MIN_DISK_GB) return "disk";
	return null;
};

// The trial starts here, when the first server is reachable, instead of at
// signup. Returns false when the account has no free server slot.
export const ensureServerSlot = async (
	ownerId: string,
	organizationId: string,
) => {
	const owner = await findUserById(ownerId);
	const servers = await findServersByUserId(owner.id);
	if (servers.length < owner.serversQuantity) return true;

	const billingStatus = await getBillingStatus(owner.id);
	if (billingStatus.hasActiveAccess || billingStatus.hasUsedTrial) {
		return false;
	}

	await startTrial(owner.id, "hobby");
	void captureEvent({
		distinctId: owner.id,
		event: "trial_started",
		organizationId,
		properties: {
			tier: "hobby",
			trial_days: TRIAL_DURATION_DAYS,
			source: "server_connected",
			$set: { billing_status: "trialing", plan_tier: "hobby" },
		},
	});
	return true;
};

export const canConnectFirstServer = async (ownerId: string) => {
	const owner = await findUserById(ownerId);
	const servers = await findServersByUserId(owner.id);
	if (servers.length < owner.serversQuantity) return true;
	const billingStatus = await getBillingStatus(owner.id);
	return !billingStatus.hasActiveAccess && !billingStatus.hasUsedTrial;
};

// Runs while the connect command waits on the server, so a failure is printed
// in that terminal and stored for the onboarding screen to show.
export const prepareFirstServer = async ({
	target,
	userId,
	ownerId,
	organizationId,
}: {
	target: SshTarget;
	userId: string;
	ownerId: string;
	organizationId: string;
}): Promise<ConnectFailKind | null> => {
	const kind =
		(await checkServerRequirements(target)) ??
		((await ensureServerSlot(ownerId, organizationId)) ? null : "limit");
	await db
		.update(user)
		.set({ serverConnectFailure: kind })
		.where(eq(user.id, userId));
	if (!kind) {
		void captureEvent({
			distinctId: userId,
			event: "server_preflight_passed",
			organizationId,
		});
		return null;
	}

	void captureEvent({
		distinctId: userId,
		event: "server_connect_failed",
		organizationId,
		properties: { kind },
	});
	await sendServerSetupFailedEmail(userId, ownerId, kind).catch((error) => {
		console.error("Failed to send the server setup email:", error);
	});
	return kind;
};

export const sendServerSetupFailedEmail = async (
	userId: string,
	ownerId: string,
	kind: ConnectFailKind,
) => {
	const [recipient] = await db
		.update(user)
		.set({ serverSetupFailedEmailAt: new Date() })
		.where(
			and(
				eq(user.id, userId),
				or(
					sql`${user.serverSetupFailedEmailAt} is null`,
					lt(
						user.serverSetupFailedEmailAt,
						new Date(Date.now() - FAILED_EMAIL_INTERVAL_MS),
					),
				),
			),
		)
		.returning({ email: user.email, firstName: user.firstName });
	if (!recipient) return;

	const owner = await findUserById(ownerId);
	const failure = CONNECT_FAILURES[kind];
	const html = await render(
		ServerSetupFailedEmail({
			userName: recipient.firstName || "User",
			title: failure.title,
			body: failure.body,
			fix: failure.fix,
			returnUrl: `${WEBSITE_URL}/dashboard/home?onboarding=connect`,
			trialNotStarted: !owner.stripeSubscriptionId,
		}),
	);
	await sendEmail({
		email: recipient.email,
		subject: `Server setup stopped: ${failure.title}`,
		text: html,
	});
};
