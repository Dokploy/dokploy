import { randomBytes } from "node:crypto";
import { createOTP } from "@better-auth/utils/otp";
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
import type { User } from "./user";

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

const generateBase32Secret = () => {
	// Generamos 32 bytes (256 bits) para asegurar que tengamos suficiente longitud
	const buffer = randomBytes(32);
	// Convertimos directamente a hex para Better Auth
	const hex = buffer.toString("hex");
	// También necesitamos la versión base32 para el QR code
	const base32 = encode.encode(buffer).replace(/=/g, "").substring(0, 32);
	return {
		hex,
		base32,
	};
};

export const generate2FASecret = () => {
	const secret = "46JMUCG4NJ3CIU6LQAIVFWUW";

	const totp = new TOTP({
		issuer: "Dokploy",
		label: "siumauricio@hotmail.com",
		algorithm: "SHA1",
		digits: 6,
		secret: secret,
	});

	// Convertir los bytes del secreto a hex
	const secretBytes = totp.secret.bytes;
	const hexSecret = Buffer.from(secretBytes).toString("hex");

	console.log("Secret bytes:", secretBytes);
	console.log("Hex secret:", hexSecret);

	return {
		secret,
		hexSecret,
		totp,
	};
};

export const verify2FA = async (auth: User, secret: string, pin: string) => {
	const totp = new TOTP({
		issuer: "Dokploy",
		label: `${auth?.email}`,
		algorithm: "SHA1",
		digits: 6,
		secret: secret,
		period: 30,
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

const convertBase32ToHex = (base32Secret: string) => {
	try {
		// Asegurarnos de que la longitud sea múltiplo de 8 agregando padding
		let paddedSecret = base32Secret;
		while (paddedSecret.length % 8 !== 0) {
			paddedSecret += "=";
		}

		const bytes = encode.decode.asBytes(paddedSecret.toUpperCase());
		let hex = Buffer.from(bytes).toString("hex");

		// Asegurarnos de que el hex tenga al menos 32 caracteres (16 bytes)
		while (hex.length < 32) {
			hex += "0";
		}

		return hex;
	} catch (error) {
		console.error("Error converting base32 to hex:", error);
		return base32Secret;
	}
};

// Para probar
// const testSecret = "46JMUCG4NJ3CIU6LQAIVFWUW";
// console.log("Original:", testSecret);
// console.log("Converted:", convertBase32ToHex(testSecret));
// console.log(
// 	"Length in bytes:",
// 	Buffer.from(convertBase32ToHex(testSecret), "hex").length,
// );
// console.log(generate2FASecret().secret.secret);

// // Para probar
// const testResult = generate2FASecret();
// console.log("\nResultados:");
// console.log("Original base32:", testResult.secret);
// console.log("Hex convertido:", testResult.hexSecret);
// console.log(
// 	"Longitud en bytes:",
// 	Buffer.from(testResult.hexSecret, "hex").length,
// );
export const symmetricDecrypt = async ({ key, data }) => {
	const keyAsBytes = await createHash("SHA-256").digest(key);
	const dataAsBytes = hexToBytes(data);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
};
// export const migrateExistingSecret = async (
// 	existingBase32Secret: string,
// 	encryptionKey: string,
// ) => {
// 	try {
// 		// 1. Primero asegurarnos que el secreto base32 tenga el padding correcto
// 		let paddedSecret = existingBase32Secret;
// 		while (paddedSecret.length % 8 !== 0) {
// 			paddedSecret += "=";
// 		}

// 		// 2. Decodificar el base32 a bytes usando hi-base32
// 		const bytes = encode.decode.asBytes(paddedSecret.toUpperCase());

// 		// 3. Convertir los bytes a hex
// 		const hexSecret = Buffer.from(bytes).toString("hex");

// 		// 4. Encriptar el secreto hex usando Better Auth
// 		const encryptedSecret = await symmetricEncrypt({
// 			key: encryptionKey,
// 			data: hexSecret,
// 		});

// 		// 5. Crear TOTP con el secreto original para validación
// 		const originalTotp = new TOTP({
// 			issuer: "Dokploy",
// 			label: "migration-test",
// 			algorithm: "SHA1",
// 			digits: 6,
// 			secret: existingBase32Secret,
// 		});

// 		// 6. Generar un código de prueba con el secreto original
// 		const testCode = originalTotp.generate();

// 		// 7. Validar que el código funcione con el secreto original
// 		const isValid = originalTotp.validate({ token: testCode }) !== null;

// 		return {
// 			originalSecret: existingBase32Secret,
// 			hexSecret,
// 			encryptedSecret, // Este es el valor que debes guardar en la base de datos
// 			isValid,
// 			testCode,
// 			secretLength: hexSecret.length,
// 		};
// 	} catch (error: unknown) {
// 		const errorMessage =
// 			error instanceof Error ? error.message : "Unknown error";
// 		console.error("Error durante la migración:", errorMessage);
// 		throw new Error(`Error al migrar el secreto: ${errorMessage}`);
// 	}
// };

// // // Ejemplo de uso con el secreto de prueba
// // const testMigration = await migrateExistingSecret(
// // 	"46JMUCG4NJ3CIU6LQAIVFWUW",
// // 	process.env.BETTER_AUTH_SECRET || "your-encryption-key",
// // );
// // console.log("\nPrueba de migración:");
// // console.log("Secreto original (base32):", testMigration.originalSecret);
// // console.log("Secreto convertido (hex):", testMigration.hexSecret);
// // console.log("Secreto encriptado:", testMigration.encryptedSecret);
// // console.log("Longitud del secreto hex:", testMigration.secretLength);
// // console.log("¿Conversión válida?:", testMigration.isValid);
// // console.log("Código de prueba:", testMigration.testCode);
// const secret = "46JMUCG4NJ3CIU6LQAIVFWUW";
// const isValid = createOTP(secret, {
// 	digits: 6,
// 	period: 30,
// }).verify("123456");

// console.log(isValid.then((isValid) => console.log(isValid)));
