import { db } from "@/server/db";
import { type apiCreateCompose, compose } from "@/server/db/schema";
import type { ComposeSpecification } from "@/server/utils/docker/types";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { load } from "js-yaml";

export type Compose = typeof compose.$inferSelect;

export const createCompose = async (input: typeof apiCreateCompose._type) => {
	const newDestination = await db
		.insert(compose)
		.values({
			...input,
			composeFile: "",
		})
		.returning()
		.then((value) => value[0]);

	if (!newDestination) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting compose",
		});
	}

	return newDestination;
};

export const findComposeById = async (composeId: string) => {
	const result = await db.query.compose.findFirst({
		where: eq(compose.composeId, composeId),
		with: {
			project: true,
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Compose not found",
		});
	}
	return result;
};

export const loadServices = async (composeId: string) => {
	const compose = await findComposeById(composeId);
	// use js-yaml to parse the docker compose file and then extact the services
	const composeFile = compose.composeFile;
	const composeData = load(composeFile) as ComposeSpecification;

	if (!composeData.services) {
		return ["All Services"];
	}

	const services = Object.keys(composeData.services);

	return [...services, "All Services"];
};

export const updateCompose = async (
	composeId: string,
	composeData: Partial<Compose>,
) => {
	const composeResult = await db
		.update(compose)
		.set({
			...composeData,
		})
		.where(eq(compose.composeId, composeId))
		.returning();

	return composeResult[0];
};
