import { validateRequest, findDeploymentById } from "@dokploy/server";
import {
	readDeploymentLogs,
	streamDeploymentLogs,
} from "@dokploy/server/utils/logs/read-logs";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET") {
		return res.status(405).json({ message: "Method not allowed" });
	}

	const { session, user } = await validateRequest(req);

	if (!user || !session) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const { deploymentId } = req.query;

	if (!deploymentId || typeof deploymentId !== "string") {
		return res.status(400).json({ message: "deploymentId is required" });
	}

	try {
		const deployment = await findDeploymentById(deploymentId);

		// Determine serverId based on deployment type
		let serverId: string | null = null;
		if (deployment.applicationId) {
			const application = await import(
				"@dokploy/server/services/application"
			).then((m) => m.findApplicationById(deployment.applicationId!));
			if (
				application.environment.project.organizationId !==
				session.activeOrganizationId
			) {
				return res.status(403).json({ message: "Forbidden" });
			}
			serverId = application.serverId;
		} else if (deployment.composeId) {
			const compose = await import("@dokploy/server/services/compose").then(
				(m) => m.findComposeById(deployment.composeId!),
			);
			if (
				compose.environment.project.organizationId !==
				session.activeOrganizationId
			) {
				return res.status(403).json({ message: "Forbidden" });
			}
			serverId = compose.serverId;
		} else if (deployment.serverId) {
			const { findServerById: findServer } = await import(
				"@dokploy/server/services/server"
			);
			const server = await findServer(deployment.serverId);
			if (server.organizationId !== session.activeOrganizationId) {
				return res.status(403).json({ message: "Forbidden" });
			}
			serverId = deployment.serverId;
		} else if (deployment.previewDeploymentId) {
			const previewDeployment = await import(
				"@dokploy/server/services/preview-deployment"
			).then((m) =>
				m.findPreviewDeploymentById(deployment.previewDeploymentId!),
			);
			if (
				previewDeployment.application?.environment.project.organizationId !==
				session.activeOrganizationId
			) {
				return res.status(403).json({ message: "Forbidden" });
			}
			serverId = previewDeployment.application?.serverId || null;
		}

		const tail = req.query.tail
			? parseInt(req.query.tail as string, 10)
			: undefined;
		const follow = req.query.follow === "true";

		if (follow) {
			// Stream logs using Server-Sent Events
			res.setHeader("Content-Type", "text/event-stream");
			res.setHeader("Cache-Control", "no-cache");
			res.setHeader("Connection", "keep-alive");

			const cleanup = await streamDeploymentLogs(
				deployment.logPath,
				serverId,
				(data) => {
					res.write(`data: ${JSON.stringify({ data })}\n\n`);
				},
				(error) => {
					res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
					res.end();
				},
				() => {
					res.end();
				},
			);

			req.on("close", () => {
				cleanup();
			});
		} else {
			// Return logs as plain text
			const logs = await readDeploymentLogs(deployment.logPath, serverId, {
				tail,
			});

			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			return res.status(200).send(logs);
		}
	} catch (error) {
		console.error("Error reading deployment logs:", error);
		return res.status(500).json({
			message:
				error instanceof Error
					? error.message
					: "Failed to read deployment logs",
		});
	}
}
