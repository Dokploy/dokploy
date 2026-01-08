import type * as schema from "@dokploy/server/db/schema";
import type {
	BuildQueryResult,
	DBQueryConfig,
	ExtractTablesWithRelations,
} from "drizzle-orm";
import { z } from "zod";

/*
 * This is for testing purposes in the case we need a nested relational types
 *
 */

type Schema = typeof schema;
type TSchema = ExtractTablesWithRelations<Schema>;

export type IncludeRelation<TableName extends keyof TSchema> = DBQueryConfig<
	"one" | "many",
	boolean,
	TSchema,
	TSchema[TableName]
>["with"];

export type InferResultType<
	TableName extends keyof TSchema,
	With extends IncludeRelation<TableName> | undefined = undefined,
> = BuildQueryResult<
	TSchema,
	TSchema[TableName],
	{
		with: With;
	}
>;

type AnyObj = Record<PropertyKey, unknown>;

type ZodObj<T extends AnyObj> = {
	[key in keyof T]: z.ZodType<T[key]>;
};
const _zObject = <T extends AnyObj>(arg: ZodObj<T>) => z.object(arg);

// const goodDogScheme = zObject<UserWithPosts>({
//   //   prueba: schema.selectDatabaseSchema,
//   // domain: z.string(),
//   // domainId: z.string(),
// });
