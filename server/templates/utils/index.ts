import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { templates } from "../templates";
import type { TemplatesKeys } from "../types/templates-data.type";

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
