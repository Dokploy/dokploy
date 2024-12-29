import { db } from "@dokploy/server/db";
import {
	type apiCreateSshKey,
	type apiFindOneSshKey,
	type apiRemoveSshKey,
	type apiUpdateSshKey,
	sshKeys,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export const createSshKey = async (input: typeof apiCreateSshKey._type) => {
	await db.transaction(async (tx) => {
		const sshKey = await tx
			.insert(sshKeys)
			.values(input)
			.returning()
			.then((response) => response[0])
			.catch((e) => console.error(e));

		if (!sshKey) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the SSH Key",
			});
		}
		return sshKey;
	});
};

export const removeSSHKeyById = async (
	sshKeyId: (typeof apiRemoveSshKey._type)["sshKeyId"],
) => {
	const result = await db
		.delete(sshKeys)
		.where(eq(sshKeys.sshKeyId, sshKeyId))
		.returning();

	return result[0];
};

export const updateSSHKeyById = async ({
	sshKeyId,
	...input
}: typeof apiUpdateSshKey._type) => {
	const result = await db
		.update(sshKeys)
		.set(input)
		.where(eq(sshKeys.sshKeyId, sshKeyId))
		.returning();

	return result[0];
};

export const findSSHKeyById = async (
	sshKeyId: (typeof apiFindOneSshKey._type)["sshKeyId"],
) => {
	const sshKey = await db.query.sshKeys.findFirst({
		where: eq(sshKeys.sshKeyId, sshKeyId),
	});
	if (!sshKey) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "SSH Key not found",
		});
	}
	return sshKey;
};
