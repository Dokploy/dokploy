import { createHmac, timingSafeEqual } from "node:crypto";

// How far a callback's timestamp may be from now before it is refused as a replay.
export const QC_WEBHOOK_TOLERANCE_SECONDS = 300;

export interface QcWebhookPayload {
	event: string;
	runId: string;
	status: string;
	verdict: string | null;
}

// The service signs "<timestamp>.<raw body>" with HMAC-SHA256 and sends it as
// `sha256=<hex>` next to the timestamp. Returns the payload when the signature
// is valid and fresh, otherwise null.
export const verifyQcWebhook = (params: {
	secret: string;
	timestamp: string | undefined;
	signature: string | undefined;
	rawBody: string;
	nowSeconds?: number;
}): QcWebhookPayload | null => {
	const { secret, timestamp, signature, rawBody } = params;
	if (!secret || !timestamp || !signature) {
		return null;
	}
	const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
	const sent = Number(timestamp);
	if (
		!Number.isFinite(sent) ||
		Math.abs(now - sent) > QC_WEBHOOK_TOLERANCE_SECONDS
	) {
		return null;
	}

	const expected = `sha256=${createHmac("sha256", secret)
		.update(`${timestamp}.${rawBody}`)
		.digest("hex")}`;
	const a = Buffer.from(expected);
	const b = Buffer.from(signature);
	if (a.length !== b.length || !timingSafeEqual(a, b)) {
		return null;
	}

	try {
		const payload = JSON.parse(rawBody) as QcWebhookPayload;
		return typeof payload.runId === "string" ? payload : null;
	} catch {
		return null;
	}
};
