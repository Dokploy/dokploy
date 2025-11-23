import { validateRequest, findServerById } from "@dokploy/server";
import {
	readContainerLogs,
	streamContainerLogs,
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

	const { containerId } = req.query;

	if (!containerId || typeof containerId !== "string") {
		return res.status(400).json({ message: "containerId is required" });
	}

	try {
		const serverId = req.query.serverId
			? (req.query.serverId as string)
			: undefined;

		if (serverId) {
			const server = await findServerById(serverId);
			if (server.organizationId !== session.activeOrganizationId) {
				return res.status(403).json({ message: "Forbidden" });
			}
		}

		const tail = req.query.tail
			? parseInt(req.query.tail as string, 10)
			: undefined;
		const since = req.query.since ? (req.query.since as string) : undefined;
		const runType =
			req.query.runType === "swarm" || req.query.runType === "native"
				? req.query.runType
				: undefined;
		const follow = req.query.follow === "true";

		if (follow) {
			// Stream logs using Server-Sent Events
			res.setHeader("Content-Type", "text/event-stream");
			res.setHeader("Cache-Control", "no-cache");
			res.setHeader("Connection", "keep-alive");

			const cleanup = await streamContainerLogs(
				containerId,
				serverId || null,
				{
					tail,
					since,
					runType,
				},
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
			const logs = await readContainerLogs(containerId, serverId || null, {
				tail,
				since,
				runType,
			});

			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			return res.status(200).send(logs);
		}
	} catch (error) {
		console.error("Error reading container logs:", error);
		return res.status(500).json({
			message:
				error instanceof Error
					? error.message
					: "Failed to read container logs",
		});
	}
}
