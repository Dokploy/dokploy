import { generatePassword } from "@dokploy/server/templates";
import { faker } from "@faker-js/faker";
import { customAlphabet } from "nanoid";

const alphabet = "abcdefghijklmnopqrstuvwxyz123456789";

const customNanoid = customAlphabet(alphabet, 6);

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

export const shEscape = (s: string | null | undefined) => {
	if (!s) return "''";
	return `'${s.replace(/'/g, `'\\''`)}'`;
};

export const isNonEmptyString = (s: unknown): boolean => {
	if (!s) return false;
	if (typeof s !== "string") return false;
	if (s.trim() === "") return false;
	if (s.trim().length < 1) return false;
	return true;
};
