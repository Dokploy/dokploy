import { db } from "@dokploy/server/db";
import {
        apiRemoveGpgKey,
        apiUpdateGpgKey,
        gpgKeys,
} from "@dokploy/server/db/schema";
import { decryptSecret, encryptSecret } from "@dokploy/server/utils/encryption/secrets";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

type InsertGpgKey = typeof gpgKeys.$inferInsert;

export const createGpgKey = async (input: InsertGpgKey) => {
        // Encrypt sensitive fields before storing
        const encryptedPrivateKey = input.privateKey
                ? await encryptSecret(input.privateKey)
                : undefined;
        const encryptedPassphrase = input.passphrase
                ? await encryptSecret(input.passphrase)
                : undefined;

        const [gpgKey] = await db
                .insert(gpgKeys)
                .values({
                        ...input,
                        privateKey: encryptedPrivateKey,
                        passphrase: encryptedPassphrase,
                })
                .returning();

        if (!gpgKey) {
                throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Error creating the GPG key",
                });
        }

        return gpgKey;
};

export const removeGpgKeyById = async (
        gpgKeyId: typeof apiRemoveGpgKey._type.gpgKeyId,
) => {
        const [removed] = await db
                .delete(gpgKeys)
                .where(eq(gpgKeys.gpgKeyId, gpgKeyId))
                .returning();

        return removed;
};

export const updateGpgKeyById = async (
        input: typeof apiUpdateGpgKey._type,
) => {
        const { gpgKeyId, privateKey, passphrase, ...otherUpdates } = input;

        // Encrypt sensitive fields if they're being updated
        const encryptedPrivateKey = privateKey
                ? await encryptSecret(privateKey)
                : undefined;
        const encryptedPassphrase = passphrase
                ? await encryptSecret(passphrase)
                : undefined;

        const updateData: Record<string, unknown> = { ...otherUpdates };
        if (encryptedPrivateKey !== undefined) {
                updateData.privateKey = encryptedPrivateKey;
        }
        if (encryptedPassphrase !== undefined) {
                updateData.passphrase = encryptedPassphrase;
        }

        const [updated] = await db
                .update(gpgKeys)
                .set(updateData)
                .where(eq(gpgKeys.gpgKeyId, gpgKeyId))
                .returning();

        if (!updated) {
                throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Error updating the GPG key",
                });
        }

        return updated;
};

export const findGpgKeyById = async (
        gpgKeyId: typeof apiRemoveGpgKey._type.gpgKeyId,
) => {
        const gpgKey = await db.query.gpgKeys.findFirst({
                where: eq(gpgKeys.gpgKeyId, gpgKeyId),
        });

        if (!gpgKey) {
                throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "GPG key not found",
                });
        }

        // Decrypt sensitive fields before returning
        const decryptedPrivateKey = gpgKey.privateKey
                ? await decryptSecret(gpgKey.privateKey)
                : null;
        const decryptedPassphrase = gpgKey.passphrase
                ? await decryptSecret(gpgKey.passphrase)
                : null;

        return {
                ...gpgKey,
                privateKey: decryptedPrivateKey,
                passphrase: decryptedPassphrase,
        };
};
