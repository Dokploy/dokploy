import { decryptValue, encryptValue } from "@dokploy/server/lib/encryption";
import { generatePassword } from "@dokploy/server/templates";
import { faker } from "@faker-js/faker";
import { customType } from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";

/**
 * Text column encrypted at rest (AES-256-GCM, key derived from
 * BETTER_AUTH_SECRET). Legacy plaintext values are passed through on read
 * and get encrypted the next time they are written.
 */
export const encryptedText = customType<{ data: string; driverData: string }>({
	dataType() {
		return "text";
	},
	toDriver(value) {
		return encryptValue(value);
	},
	fromDriver(value) {
		try {
			return decryptValue(value);
		} catch {
			// Fail open so a key mismatch (e.g. restoring a backup under a
			// different BETTER_AUTH_SECRET) degrades to showing ciphertext
			// instead of breaking every query that touches the row.
			console.error(
				"Failed to decrypt an encrypted column; returning the raw value. This usually means BETTER_AUTH_SECRET changed after the value was encrypted.",
			);
			return value;
		}
	},
});

const alphabet = "abcdefghijklmnopqrstuvwxyz123456789";

const customNanoid = customAlphabet(alphabet, 6);

/** App name: letters, numbers, dots, underscores, hyphens only (no spaces). Safe for shell/Docker. */
export const APP_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;

export const APP_NAME_MESSAGE =
	"App name can only contain letters, numbers, dots, underscores and hyphens";

/** Database password: blocks shell-dangerous characters like $ ! ' " \ / and spaces. */
export const DATABASE_PASSWORD_REGEX =
	/^[a-zA-Z0-9@#%^&*()_+\-=[\]{}|;:,.<>?~`]*$/;

export const DATABASE_PASSWORD_MESSAGE =
	"Password contains invalid characters. Please avoid: $ ! ' \" \\ / and space characters for database compatibility";

export const generateAppName = (type: string) => {
	const verb = faker.hacker.verb().replace(/ /g, "-");
	const adjective = faker.hacker.adjective().replace(/ /g, "-");
	const noun = faker.hacker.noun().replace(/ /g, "-");
	const randomFakerElement = `${verb}-${adjective}-${noun}`;
	const nanoidPart = customNanoid();
	return `${type}-${randomFakerElement}-${nanoidPart}`;
};

export const cleanAppName = (appName?: string) => {
	if (!appName) {
		return appName?.toLowerCase();
	}
	return appName.trim().replace(/ /g, "-").toLowerCase();
};

export const buildAppName = (type: string, baseAppName?: string) => {
	if (baseAppName) {
		return `${cleanAppName(baseAppName)}-${generatePassword(6)}`;
	}
	return generateAppName(type);
};
