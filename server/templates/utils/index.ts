import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { templates } from "../templates";
import type { TemplatesKeys } from "../types/templates-data.type";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface Schema {
	domain: string;
	projectName: string;
}

export interface Template {
	envs: string[];
	mounts?: {
		mountPath: string;
		content?: string;
	}[];
}

export const generateRandomDomain = ({
	domain,
	projectName,
}: Schema): string => {
	const hash = randomBytes(4).toString("hex");
	return `${projectName}-${hash}.${domain}`;
};

export const generateHash = (projectName: string): string => {
	const hash = randomBytes(4).toString("hex");
	return `${projectName}-${hash}`;
};

export const loadTemplateModule = async (
	folder: TemplatesKeys,
): Promise<(schema: Schema) => Template> => {
	const templateLoader = templates.find((t) => t.folder === folder);
	if (!templateLoader) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Template ${folder} not found or not implemented yet`,
		});
	}

	const generate = await templateLoader.load();
	return generate;
};

export const readComposeFile = async (folder: string) => {
	const composeFile = await readFile(
		join("server", "templates", folder, "docker-compose.yml"),
		"utf8",
	);

	return composeFile;
};
