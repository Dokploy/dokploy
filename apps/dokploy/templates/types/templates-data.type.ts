import type { templates } from "../templates";
import type { Schema, Template } from "../utils";

/**
 * Type representing the keys of the templates.
 */
export type TemplatesKeys = (typeof templates)[number]["id"];

/**
 * Interface representing the data structure for a template.
 */
export type TemplateData = {
	/**
	 * Unique identifier for the template.
	 */
	id: string;

	/**
	 * Name of the template.
	 */
	name: string;

	/**
	 * Description of the template Max(150 Characters).
	 */
	description: string;

	/**
	 * Links related to the template.
	 */
	links: {
		/**
		 * GitHub repository link for the template.
		 */
		github: string;

		/**
		 * Optional documentation link for the template.
		 */
		docs?: string;

		/**
		 * Optional website link for the template.
		 */
		website?: string;
	};
	/**
	 * Version of the template.
	 */
	version: string;

	/**
	 * Tags associated with the template.
	 */
	tags: string[];

	/**
	 * Name of the logo file with extension (e.g. pocketbase.png).
	 */
	logo: string;

	/**
	 * Function to load the template, returning a promise that resolves with a function
	 * taking a schema and returning a template.
	 */
	load: () => Promise<(schema: Schema) => Template>;
};
