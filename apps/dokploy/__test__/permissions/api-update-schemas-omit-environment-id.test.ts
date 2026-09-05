import { describe, expect, it } from "vitest";

// The cross-org re-parenting vector through `application.update` exists for every
// service type: each apiUpdate* schema derives from createSchema.partial() and
// previously only omitted serverId, leaving environmentId settable through the
// `update` mutation with no target-env authorization. The fix omits environmentId
// from every apiUpdate* schema. These tests pin that contract so a future
// createSchema/.partial() refactor cannot silently re-introduce it.

import {
	apiUpdateCompose,
	apiUpdateLibsql,
	apiUpdateMariaDB,
	apiUpdateMongo,
	apiUpdateMySql,
	apiUpdatePostgres,
	apiUpdateRedis,
} from "@/server/db/schema";

const schemas = {
	apiUpdatePostgres: {
		schema: apiUpdatePostgres,
		idField: "postgresId",
		extra: { dockerImage: "postgres:16" },
	},
	apiUpdateRedis: {
		schema: apiUpdateRedis,
		idField: "redisId",
		extra: { dockerImage: "redis:7" },
	},
	apiUpdateMariaDB: {
		schema: apiUpdateMariaDB,
		idField: "mariadbId",
		extra: { dockerImage: "mariadb:11" },
	},
	apiUpdateMySql: {
		schema: apiUpdateMySql,
		idField: "mysqlId",
		extra: { dockerImage: "mysql:8" },
	},
	apiUpdateMongo: {
		schema: apiUpdateMongo,
		idField: "mongoId",
		extra: { dockerImage: "mongo:7" },
	},
	apiUpdateLibsql: { schema: apiUpdateLibsql, idField: "libsqlId", extra: {} },
	apiUpdateCompose: {
		schema: apiUpdateCompose,
		idField: "composeId",
		extra: { composeFile: "services:\n  web:\n    image: nginx" },
	},
};

describe("apiUpdate* schemas omit environmentId (no re-parenting via update)", () => {
	for (const [name, { schema, idField, extra }] of Object.entries(schemas)) {
		describe(name, () => {
			it("drops environmentId from the parsed payload", () => {
				const parsed = schema.parse({
					[idField]: "svc-1",
					environmentId: "foreign-env",
				} as Record<string, unknown>);
				expect(parsed).not.toHaveProperty("environmentId");
			});

			it("still parses legitimate update fields", () => {
				const parsed = schema.parse({
					[idField]: "svc-1",
					...extra,
				} as Record<string, unknown>);
				expect(parsed).toHaveProperty(idField, "svc-1");
				for (const [k, v] of Object.entries(extra)) {
					expect(parsed).toHaveProperty(k, v);
				}
			});
		});
	}
});
