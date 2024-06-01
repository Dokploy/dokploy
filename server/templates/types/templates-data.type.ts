import type { templates } from "../templates";
import type { Schema, Template } from "../utils";

export type TemplatesKeys = (typeof templates)[number]["folder"];

export type TemplateData = {
	name: string;
	description: string;
	type: string;
	folder: string;
	links: {
		github: string;
		docs: string;
	};
	logo: string;
	load: () => Promise<(schema: Schema) => Template>;
};
