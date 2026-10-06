import { notifyQcRun, verifyQcWebhook } from "@dokploy/server";
import type { NextApiRequest, NextApiResponse } from "next";

// The raw body is what the signature covers, so it must not be parsed first.
export const config = { api: { bodyParser: false } };

const readBody = async (req: NextApiRequest) => {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 64 * 1024) {
			throw new Error("payload too large");
		}
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
};

// QC service callback: "a run finished". It only wakes whoever is polling that
// run, so a missing, late or refused callback is harmless.
export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "POST") {
		return res.status(405).json({ error: "method not allowed" });
	}
	let rawBody: string;
	try {
		rawBody = await readBody(req);
	} catch {
		return res.status(413).json({ error: "payload too large" });
	}

	const payload = verifyQcWebhook({
		secret: process.env.QC_SERVICE_WEBHOOK_SECRET ?? "",
		timestamp: req.headers["x-qc-timestamp"] as string | undefined,
		signature: req.headers["x-qc-signature"] as string | undefined,
		rawBody,
	});
	if (!payload) {
		return res.status(401).json({ error: "invalid signature" });
	}
	notifyQcRun(payload.runId);
	return res.status(200).json({ ok: true });
}
