import { randomBytes } from "node:crypto";
import { db } from "@dokploy/server/db";
import { users_temp } from "@dokploy/server/db/schema";
import { getPublicIpWithFallback } from "@dokploy/server/wss/utils";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import encode from "hi-base32";
import { TOTP } from "otpauth";
import QRCode from "qrcode";
import { IS_CLOUD } from "../constants";
import { findUserById } from "./admin";

export const findAuthById = async (authId: string) => {
	const result = await db.query.users_temp.findFirst({
		where: eq(users_temp.id, authId),
		columns: {
			createdAt: false,
			updatedAt: false,
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

export const generate2FASecret = async (userId: string) => {
	const user = await findUserById(userId);

	const base32_secret = generateBase32Secret();

	const totp = new TOTP({
		issuer: "Dokploy",
		label: `${user?.email}`,
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
