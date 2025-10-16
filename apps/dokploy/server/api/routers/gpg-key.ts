import {
        createGpgKey,
        findGpgKeyById,
        removeGpgKeyById,
        updateGpgKeyById,
} from "@dokploy/server";
import { decryptSecret } from "@dokploy/server/utils/encryption/secrets";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
        apiCreateGpgKey,
        apiFindOneGpgKey,
        apiRemoveGpgKey,
        apiUpdateGpgKey,
        gpgKeys,
} from "@/server/db/schema";

export const gpgKeyRouter = createTRPCRouter({
        create: protectedProcedure
                .input(apiCreateGpgKey)
                .mutation(async ({ input, ctx }) => {
                        try {
                                await createGpgKey({
                                        ...input,
                                        organizationId: ctx.session.activeOrganizationId,
                                });
                        } catch (error) {
                                throw new TRPCError({
                                        code: "BAD_REQUEST",
                                        message: "Error creating the GPG key",
                                        cause: error,
                                });
                        }
                }),
        remove: protectedProcedure
                .input(apiRemoveGpgKey)
                .mutation(async ({ input, ctx }) => {
                        const gpgKey = await findGpgKeyById(input.gpgKeyId);
                        if (gpgKey.organizationId !== ctx.session.activeOrganizationId) {
                                throw new TRPCError({
                                        code: "UNAUTHORIZED",
                                        message: "You are not allowed to delete this GPG key",
                                });
                        }
                        return await removeGpgKeyById(input.gpgKeyId);
                }),
        one: protectedProcedure
                .input(apiFindOneGpgKey)
                .query(async ({ input, ctx }) => {
                        const gpgKey = await findGpgKeyById(input.gpgKeyId);
                        if (gpgKey.organizationId !== ctx.session.activeOrganizationId) {
                                throw new TRPCError({
                                        code: "UNAUTHORIZED",
                                        message: "You are not allowed to access this GPG key",
                                });
                        }
                        return gpgKey;
                }),
        all: protectedProcedure.query(async ({ ctx }) => {
                const allKeys = await db.query.gpgKeys.findMany({
                        where: eq(gpgKeys.organizationId, ctx.session.activeOrganizationId),
                        orderBy: desc(gpgKeys.createdAt),
                });

                // Decrypt sensitive fields for all GPG keys
                return await Promise.all(
                        allKeys.map(async (key) => ({
                                ...key,
                                privateKey: key.privateKey ? await decryptSecret(key.privateKey) : null,
                                passphrase: key.passphrase ? await decryptSecret(key.passphrase) : null,
                        }))
                );
        }),
        update: protectedProcedure
                .input(apiUpdateGpgKey)
                .mutation(async ({ input, ctx }) => {
                        try {
                                const gpgKey = await findGpgKeyById(input.gpgKeyId);
                                if (gpgKey.organizationId !== ctx.session.activeOrganizationId) {
                                        throw new TRPCError({
                                                code: "UNAUTHORIZED",
                                                message: "You are not allowed to update this GPG key",
                                        });
                                }
                                return await updateGpgKeyById(input);
                        } catch (error) {
                                throw new TRPCError({
                                        code: "BAD_REQUEST",
                                        message: "Error updating this GPG key",
                                        cause: error,
                                });
                        }
                }),
});
