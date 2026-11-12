import {
	buildConnectErrorScript,
	buildConnectScript,
	getConnectClientIp,
} from "@dokploy/server";
import type { NextApiRequest, NextApiResponse } from "next";
import {
	registerConnectedServer,
	resolveConnectToken,
} from "@/server/utils/connect-server";

const firstHeader = (value: string | string[] | undefined) =>
	(Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const token = String(req.query.token ?? "");
	res.setHeader("Content-Type", "text/plain; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");

	if (req.method === "GET") {
		// Always 200: the command runs `curl -f`, which hides error bodies from bash.
		try {
			const resolved = await resolveConnectToken(token);
			if (resolved.status === "valid" && resolved.sshKey.lastUsedAt) {
				res
					.status(200)
					.send(
						buildConnectErrorScript(
							"This command was already used. Generate a new one in Dokploy.",
						),
					);
				return;
			}
			if (resolved.status !== "valid") {
				res
					.status(200)
					.send(
						buildConnectErrorScript(
							resolved.status === "expired"
								? "This command expired. Generate a new one in Dokploy."
								: "This command is not valid. Generate a new one in Dokploy.",
						),
					);
				return;
			}
			const proto = firstHeader(req.headers["x-forwarded-proto"]) || "http";
			const host =
				firstHeader(req.headers["x-forwarded-host"]) || req.headers.host;
			res.status(200).send(
				buildConnectScript({
					publicKey: resolved.sshKey.publicKey,
					registerUrl: `${proto}://${host}/api/connect/${token}`,
				}),
			);
		} catch (error) {
			console.error("Error serving connect script:", error);
			res
				.status(200)
				.send(
					buildConnectErrorScript(
						"Dokploy could not prepare this command. Try again in a moment.",
					),
				);
		}
		return;
	}

	if (req.method === "POST") {
		try {
			const result = await registerConnectedServer({
				token,
				ipAddress: getConnectClientIp(req.headers, req.socket.remoteAddress),
			});
			res.status(result.status).send(result.message);
		} catch (error) {
			console.error("Error registering connected server:", error);
			res.status(500).send("Dokploy could not register this server.");
		}
		return;
	}

	res.setHeader("Allow", "GET, POST");
	res.status(405).send("Method not allowed");
}
