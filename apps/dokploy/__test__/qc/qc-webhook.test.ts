import { createHmac } from "node:crypto";
import {
	QC_WEBHOOK_TOLERANCE_SECONDS,
	verifyQcWebhook,
} from "@dokploy/server/services/qc-webhook";
import { describe, expect, it } from "vitest";

const SECRET = "s3cret";
const BODY =
	'{"event":"run.finished","runId":"run-1","status":"done","verdict":"pass"}';
const NOW = 1_700_000_000;
const sign = (body: string, timestamp: string, secret = SECRET) =>
	`sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

const verify = (overrides: Record<string, unknown> = {}) =>
	verifyQcWebhook({
		secret: SECRET,
		timestamp: String(NOW),
		signature: sign(BODY, String(NOW)),
		rawBody: BODY,
		nowSeconds: NOW,
		...overrides,
	} as Parameters<typeof verifyQcWebhook>[0]);

describe("verifyQcWebhook", () => {
	it("accepts what the service's own signing produces", () => {
		// computed by the Python service (app.service.webhook.sign)
		const fromService =
			"sha256=beb5f40aa9adc69645f113679edb40e6b085e46ac5f8160a4da9525fbfcad5e6";
		expect(sign(BODY, "1700000000")).toBe(fromService);
		expect(verify({ signature: fromService })?.runId).toBe("run-1");
	});

	it("returns the payload for a valid, fresh callback", () => {
		expect(verify()).toMatchObject({ runId: "run-1", status: "done" });
	});

	it("refuses a wrong secret, a tampered body and a signature without the timestamp", () => {
		expect(verify({ secret: "other" })).toBeNull();
		expect(verify({ rawBody: BODY.replace("pass", "fail") })).toBeNull();
		expect(
			verify({
				signature: `sha256=${createHmac("sha256", SECRET).update(BODY).digest("hex")}`,
			}),
		).toBeNull();
	});

	it("refuses a replay of an old callback and one from the far future", () => {
		const old = String(NOW - QC_WEBHOOK_TOLERANCE_SECONDS - 1);
		expect(verify({ timestamp: old, signature: sign(BODY, old) })).toBeNull();
		const future = String(NOW + QC_WEBHOOK_TOLERANCE_SECONDS + 1);
		expect(
			verify({ timestamp: future, signature: sign(BODY, future) }),
		).toBeNull();
		const edge = String(NOW - QC_WEBHOOK_TOLERANCE_SECONDS);
		expect(
			verify({ timestamp: edge, signature: sign(BODY, edge) }),
		).not.toBeNull();
	});

	it("refuses missing headers and an unset secret", () => {
		expect(verify({ timestamp: undefined })).toBeNull();
		expect(verify({ signature: undefined })).toBeNull();
		expect(verify({ secret: "" })).toBeNull();
		expect(verify({ timestamp: "soon" })).toBeNull();
	});

	it("refuses a signature of the wrong length without throwing", () => {
		expect(verify({ signature: "sha256=abc" })).toBeNull();
		expect(verify({ signature: "" })).toBeNull();
	});

	it("refuses a validly signed body that is not a run callback", () => {
		const notJson = "not json";
		expect(
			verify({ rawBody: notJson, signature: sign(notJson, String(NOW)) }),
		).toBeNull();
		const noRun = '{"event":"x"}';
		expect(
			verify({ rawBody: noRun, signature: sign(noRun, String(NOW)) }),
		).toBeNull();
	});
});
