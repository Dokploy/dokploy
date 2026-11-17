import { open } from "node:fs/promises";
import {
	type ConnectTokenPayload,
	captureEvent,
	createServer,
	decodeConnectToken,
	findAllDeploymentsByServerId,
	findServersByUserId,
	findUserById,
	IS_CLOUD,
	serverSetup,
	verifyConnectToken,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	checkPermission,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { CONNECT_FAILURES } from "@/lib/onboarding";
import { audit } from "@/server/api/utils/audit";
import {
	type apiCreateServer,
	organization,
	sshKeys,
} from "@/server/db/schema";
import { applyDockerCleanupSchedule } from "@/server/utils/docker-cleanup";
import { prepareFirstServer } from "@/server/utils/first-server";

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

const SETUP_LOG_BYTES = 64 * 1024;

export const readServerSetupLog = async (serverId: string) => {
	const deployments = await findAllDeploymentsByServerId(serverId);
	const setup = deployments.find((item) => item.title === "Setup Server");
	if (!setup) return null;
	let log = "";
	try {
		const file = await open(setup.logPath, "r");
		try {
			const { size } = await file.stat();
			const length = Math.min(size, SETUP_LOG_BYTES);
			const { buffer } = await file.read(
				Buffer.alloc(length),
				0,
				length,
				size - length,
			);
			log = buffer.toString("utf8");
		} finally {
			await file.close();
		}
	} catch {}
	return { status: setup.status, log };
};

export const registerConnectedServer = async ({
	token,
	ipAddress,
	setup = false,
}: {
	token: string;
	ipAddress: string | null;
	setup?: boolean;
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
	if (!org) {
		return {
			status: 403,
			message: "You cannot create more servers. Upgrade your plan in Dokploy.",
		};
	}

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
	const releaseCommand = () =>
		db
			.update(sshKeys)
			.set({ lastUsedAt: null })
			.where(eq(sshKeys.sshKeyId, sshKey.sshKeyId));

	let newServer: Awaited<ReturnType<typeof createServerWithSideEffects>>;
	try {
		if (IS_CLOUD && payload.onboarding) {
			const failure = await prepareFirstServer({
				target: { ipAddress, privateKey: sshKey.privateKey },
				userId: payload.userId,
				ownerId: org.ownerId,
				organizationId,
			});
			if (failure) {
				await releaseCommand();
				const { title, body, fix } = CONNECT_FAILURES[failure];
				return {
					status: 422,
					message: [
						`${title}.`,
						body,
						"",
						...fix.map((step, index) => `${index + 1}. ${step}`),
					].join("\n"),
				};
			}
		} else if (!(await canOwnerCreateMoreServers(org.ownerId))) {
			await releaseCommand();
			return {
				status: 403,
				message:
					"You cannot create more servers. Upgrade your plan in Dokploy.",
			};
		}

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
		await releaseCommand();
		throw error;
	}

	if (setup) {
		void serverSetup(newServer.serverId).catch((error) => {
			console.error("Failed to set up the connected server:", error);
		});
	}

	return {
		status: 200,
		message: `Server "${newServer.name.replace(/\p{Cc}/gu, "")}" is connected. ${setup ? "Dokploy is installing Docker and the rest of its requirements now. Go back to Dokploy to follow the progress." : "Go back to Dokploy to complete the setup."}`,
		serverId: newServer.serverId,
	};
};
