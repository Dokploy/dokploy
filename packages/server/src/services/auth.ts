import { randomBytes } from "node:crypto";
import { db } from "@dokploy/server/db";
import {
	admins,
	type apiCreateAdmin,
	type apiCreateUser,
	auth,
	users,
} from "@dokploy/server/db/schema";
import { getPublicIpWithFallback } from "@dokploy/server/wss/utils";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import encode from "hi-base32";
import { TOTP } from "otpauth";
import QRCode from "qrcode";
import { IS_CLOUD } from "../constants";

export type Auth = typeof auth.$inferSelect;

export const createAdmin = async (input: typeof apiCreateAdmin._type) => {
	return await db.transaction(async (tx) => {
		const hashedPassword = bcrypt.hashSync(input.password, 10);
		const newAuth = await tx
			.insert(auth)
			.values({
				email: input.email.toLowerCase(),
				password: hashedPassword,
				rol: "admin",
			})
			.returning()
			.then((res) => res[0]);

		if (!newAuth) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the user",
			});
		}

		await tx
			.insert(admins)
			.values({
				authId: newAuth.id,
				...(!IS_CLOUD && {
					serverIp:
						process.env.ADVERTISE_ADDR || (await getPublicIpWithFallback()),
				}),
			})
			.returning();

		return newAuth;
	});
};

export const createUser = async (input: typeof apiCreateUser._type) => {
	return await db.transaction(async (tx) => {
		const hashedPassword = bcrypt.hashSync(input.password, 10);
		const res = await tx
			.update(auth)
			.set({
				password: hashedPassword,
			})
			.where(eq(auth.id, input.id))
			.returning()
			.then((res) => res[0]);

		if (!res) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the user",
			});
		}

		const user = await tx
			.update(users)
			.set({
				isRegistered: true,
				expirationDate: undefined,
			})
			.where(eq(users.token, input.token))
			.returning()
			.then((res) => res[0]);

		return user;
	});
};

export const findAuthByEmail = async (email: string) => {
	const result = await db.query.auth.findFirst({
		where: eq(auth.email, email),
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "User not found",
		});
	}
	return result;
};

export const findAuthById = async (authId: string) => {
	const result = await db.query.auth.findFirst({
		where: eq(auth.id, authId),
		columns: {
			password: false,
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Auth not found",
		});
	}
	return result;
};

export const updateAuthById = async (
	authId: string,
	authData: Partial<Auth>,
) => {
	const result = await db
		.update(auth)
		.set({
			...authData,
		})
		.where(eq(auth.id, authId))
		.returning();

	return result[0];
};

export const generate2FASecret = async (authId: string) => {
	const auth = await findAuthById(authId);

	const base32_secret = generateBase32Secret();

	const totp = new TOTP({
		issuer: "Dokploy",
		label: `${auth?.email}`,
		algorithm: "SHA1",
		digits: 6,
		secret: base32_secret,
	});

	const otpauth_url = totp.toString();

	const qrUrl = await QRCode.toDataURL(otpauth_url);

	return {
		qrCodeUrl: qrUrl,
		secret: base32_secret,
	};
};

export const verify2FA = async (
	auth: Omit<Auth, "password">,
	secret: string,
	pin: string,
) => {
	const totp = new TOTP({
		issuer: "Dokploy",
		label: `${auth?.email}`,
		algorithm: "SHA1",
		digits: 6,
		secret: secret,
	});

	const delta = totp.validate({ token: pin });

	if (delta === null) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid 2FA code",
		});
	}
	return auth;
};

const generateBase32Secret = () => {
	const buffer = randomBytes(15);
	const base32 = encode.encode(buffer).replace(/=/g, "").substring(0, 24);
	return base32;
};
