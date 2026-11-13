import {
	type ConnectTokenPayload,
	captureEvent,
	createServer,
	decodeConnectToken,
	findServersByUserId,
	findUserById,
	IS_CLOUD,
	verifyConnectToken,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	checkPermission,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	type apiCreateServer,
	organization,
	sshKeys,
} from "@/server/db/schema";
import { applyDockerCleanupSchedule } from "@/server/utils/docker-cleanup";

export const canOwnerCreateMoreServers = async (ownerId: string) => {
	if (!IS_CLOUD) return true;
	const owner = await findUserById(ownerId);
	const servers = await findServersByUserId(owner.id);
	return servers.length < owner.serversQuantity;
};

export const createServerWithSideEffects = async ({
	input,
	organizationId,
	actor,
	ownerId,
	sessionId,
}: {
	input: z.infer<typeof apiCreateServer>;
	organizationId: string;
	actor: { id: string; email: string; role: string };
	ownerId: string;
	sessionId?: string | null;
}) => {
	const newServer = await createServer(input, organizationId);
	try {
		await applyDockerCleanupSchedule(
			newServer.serverId,
			organizationId,
			input.enableDockerCleanup,
		);
	} catch (error) {
		console.error("Failed to schedule docker cleanup:", error);
	}
	await audit(
		{ user: actor, session: { activeOrganizationId: organizationId } },
		{
			action: "create",
			resourceType: "server",
			resourceId: newServer.serverId,
			resourceName: newServer.name,
		},
	);
	void captureEvent({
		distinctId: ownerId,
		event: "server_created",
		organizationId,
		sessionId,
		properties: { server_type: newServer.serverType },
	});
	return newServer;
};

type VerifiedToken =
	| { status: "invalid" | "expired" }
	| {
			status: "valid";
			payload: ConnectTokenPayload;
			sshKey: typeof sshKeys.$inferSelect;
	  };

export const resolveConnectToken = async (
	token: string,
): Promise<VerifiedToken> => {
	const payload = decodeConnectToken(token);
	if (!payload) return { status: "invalid" };
	const sshKey = await db.query.sshKeys.findFirst({
		where: eq(sshKeys.sshKeyId, payload.sshKeyId),
	});
	if (!sshKey) return { status: "invalid" };
	const status = verifyConnectToken(token, sshKey.privateKey);
	if (status !== "valid") return { status };
	return { status, payload, sshKey };
};

export const registerConnectedServer = async ({
	token,
	ipAddress,
}: {
	token: string;
	ipAddress: string | null;
}): Promise<{ status: number; message: string; serverId?: string }> => {
	const resolved = await resolveConnectToken(token);
	if (resolved.status !== "valid") {
		return resolved.status === "expired"
			? {
					status: 410,
					message: "This command expired. Generate a new one in Dokploy.",
				}
			: {
					status: 400,
					message: "This command is not valid. Generate a new one in Dokploy.",
				};
	}
	if (!ipAddress) {
		return {
			status: 400,
			message: "Could not detect this server's IP address.",
		};
	}

	const { payload, sshKey } = resolved;
	const organizationId = sshKey.organizationId;
	let member: Awaited<ReturnType<typeof findMemberByUserId>>;
	try {
		member = await findMemberByUserId(payload.userId, organizationId);
		await checkPermission(
			{
				user: { id: payload.userId },
				session: { activeOrganizationId: organizationId },
			},
			{ server: ["create"] },
		);
	} catch {
		return {
			status: 403,
			message: "The user who generated this command can no longer add servers.",
		};
	}

	const org = await db.query.organization.findFirst({
		where: eq(organization.id, organizationId),
		columns: { ownerId: true },
	});
	if (!org || !(await canOwnerCreateMoreServers(org.ownerId))) {
		return {
			status: 403,
			message: "You cannot create more servers. Upgrade your plan in Dokploy.",
		};
	}

	// Claiming the key makes the command single-use, also against concurrent
	// runs and after the server is deleted.
	const [claimed] = await db
		.update(sshKeys)
		.set({ lastUsedAt: new Date().toISOString() })
		.where(
			and(eq(sshKeys.sshKeyId, sshKey.sshKeyId), isNull(sshKeys.lastUsedAt)),
		)
		.returning({ sshKeyId: sshKeys.sshKeyId });
	if (!claimed) {
		return { status: 409, message: "This command was already used." };
	}

	let newServer: Awaited<ReturnType<typeof createServerWithSideEffects>>;
	try {
		newServer = await createServerWithSideEffects({
			input: {
				name: sshKey.name,
				description: sshKey.description ?? "",
				ipAddress,
				port: 22,
				username: "root",
				sshKeyId: sshKey.sshKeyId,
				serverType: payload.serverType,
				enableDockerCleanup: payload.enableDockerCleanup,
			},
			organizationId,
			actor: {
				id: member.user.id,
				email: member.user.email,
				role: member.role,
			},
			ownerId: org.ownerId,
		});
	} catch (error) {
		await db
			.update(sshKeys)
			.set({ lastUsedAt: null })
			.where(eq(sshKeys.sshKeyId, sshKey.sshKeyId));
		throw error;
	}

	return {
		status: 200,
		message: `Server "${newServer.name.replace(/\p{Cc}/gu, "")}" is connected. Go back to Dokploy to complete the setup.`,
		serverId: newServer.serverId,
	};
};
