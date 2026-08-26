import {
	buildComposeServerMoveDescription,
	parseComposeServerMoveMetadata,
} from "@dokploy/server/utils/migration/move-metadata";
import { describe, expect, it } from "vitest";

describe("compose server-move metadata", () => {
	it("round-trips through build -> parse", () => {
		const metadata = {
			type: "server-move" as const,
			status: "pending" as const,
			sourceServerId: "server-a",
			targetServerId: "server-b",
		};
		const description = buildComposeServerMoveDescription(metadata);
		expect(parseComposeServerMoveMetadata(description)).toEqual(metadata);
	});

	it("round-trips a local (null) server id", () => {
		const metadata = {
			type: "server-move" as const,
			status: "finalized" as const,
			sourceServerId: null,
			targetServerId: "server-b",
		};
		const description = buildComposeServerMoveDescription(metadata);
		expect(parseComposeServerMoveMetadata(description)).toEqual(metadata);
	});

	it("returns null for missing, empty, or unrelated descriptions", () => {
		expect(parseComposeServerMoveMetadata(null)).toBeNull();
		expect(parseComposeServerMoveMetadata(undefined)).toBeNull();
		expect(parseComposeServerMoveMetadata("")).toBeNull();
		expect(parseComposeServerMoveMetadata("Commit: abc123")).toBeNull();
		expect(parseComposeServerMoveMetadata("{not json")).toBeNull();
	});

	it("returns null for a description that parses as JSON but doesn't match the schema", () => {
		expect(
			parseComposeServerMoveMetadata(JSON.stringify({ foo: "bar" })),
		).toBeNull();
		expect(
			parseComposeServerMoveMetadata(
				JSON.stringify({ type: "server-move", status: "unknown" }),
			),
		).toBeNull();
	});
});
