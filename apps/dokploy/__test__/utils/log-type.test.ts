import { describe, expect, test } from "vitest";
import { getLogType } from "@/components/dashboard/docker/logs/utils";

describe("getLogType", () => {
	describe("explicit level declared by structured loggers", () => {
		test("JSON string levels (pino, winston, zap)", () => {
			expect(getLogType('{"level":"trace","msg":"x"}').type).toBe("debug");
			expect(getLogType('{"level":"debug","msg":"x"}').type).toBe("debug");
			expect(getLogType('{"level":"info","msg":"x"}').type).toBe("info");
			expect(getLogType('{"level":"warn","msg":"x"}').type).toBe("warning");
			expect(getLogType('{"level":"warning","msg":"x"}').type).toBe("warning");
			expect(getLogType('{"level":"error","msg":"x"}').type).toBe("error");
			expect(getLogType('{"level":"fatal","msg":"x"}').type).toBe("error");
		});

		test("JSON numeric levels (pino, bunyan)", () => {
			expect(getLogType('{"level":20,"msg":"x"}').type).toBe("debug");
			expect(getLogType('{"level":30,"msg":"x"}').type).toBe("info");
			expect(getLogType('{"level":40,"msg":"x"}').type).toBe("warning");
			expect(getLogType('{"level":50,"msg":"x"}').type).toBe("error");
			expect(getLogType('{"level":60,"msg":"x"}').type).toBe("error");
		});

		test("syslog/GELF numeric levels", () => {
			expect(getLogType('{"level":3,"msg":"x"}').type).toBe("error");
			expect(getLogType('{"level":4,"msg":"x"}').type).toBe("warning");
			expect(getLogType('{"level":6,"msg":"x"}').type).toBe("info");
			expect(getLogType('{"level":7,"msg":"x"}').type).toBe("debug");
		});

		test("GCP-style severity and ECS log.level", () => {
			expect(getLogType('{"severity":"ERROR","message":"x"}').type).toBe(
				"error",
			);
			expect(getLogType('{"severity":"WARNING","message":"x"}').type).toBe(
				"warning",
			);
			expect(getLogType('{"log.level":"error","message":"x"}').type).toBe(
				"error",
			);
		});

		test("logfmt levels", () => {
			expect(
				getLogType('ts=2026-06-12T10:00:00Z level=error msg="boom"').type,
			).toBe("error");
			expect(
				getLogType('ts=2026-06-12T10:00:00Z level=info msg="ok"').type,
			).toBe("info");
			expect(getLogType("level=warn msg=careful").type).toBe("warning");
		});

		test("declared level wins over keywords in the message (#4589, #1996)", () => {
			// "version"/"GET" in this pino line would otherwise match the debug keywords
			const pinoError =
				'{"level":"error","version":"72b4450","method":"GET","path":"/api/campaigns","err":{"type":"ForbiddenError","stack":"ForbiddenError: at requireRole (/app/src/plugins/campaign.plugin.ts:166:15)"},"msg":"Forbidden"}';
			expect(getLogType(pinoError).type).toBe("error");

			// info line containing error-like keywords (#4589)
			expect(
				getLogType(
					'{"level":"info","msg":"Failed to open mempool file. Continuing anyway."}',
				).type,
			).toBe("info");

			// successful job summary with "failed: false, error: none" (#4538)
			expect(
				getLogType(
					'level=info msg="Finished job, failed: false, skipped: false, error: none"',
				).type,
			).toBe("info");
		});

		test("declared level wins over statusCode", () => {
			expect(getLogType('{"level":"info","statusCode":500}').type).toBe("info");
		});

		test("unknown level names fall back to keyword detection", () => {
			expect(
				getLogType('{"level":"verbose","msg":"connection failed"}').type,
			).toBe("error");
		});

		test("env-var-like text is not treated as logfmt level", () => {
			expect(getLogType("LOG_LEVEL=error NODE_ENV=production").type).not.toBe(
				"error",
			);
		});
	});

	describe("fallback detection for unstructured logs (unchanged)", () => {
		test("statusCode classification", () => {
			expect(getLogType('{"statusCode":500,"msg":"x"}').type).toBe("error");
			expect(getLogType('{"statusCode":404,"msg":"x"}').type).toBe("warning");
			expect(getLogType('{"statusCode":200,"msg":"x"}').type).toBe("success");
		});

		test("keyword classification", () => {
			expect(getLogType("error: something broke").type).toBe("error");
			expect(getLogType("warning: disk almost full").type).toBe("warning");
			expect(getLogType("Server listening on port 8080").type).toBe("success");
		});

		test("defaults to info", () => {
			expect(getLogType("hello world").type).toBe("info");
		});
	});
});
