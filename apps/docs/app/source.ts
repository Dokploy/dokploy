import { map } from "@/.map";
import { createMDXSource } from "fumadocs-mdx";
import { loader } from "fumadocs-core/source";
import { languages } from "@/i18n";

export const { getPage, getPages, pageTree, getLanguages } = loader({
	baseUrl: "/",
	languages,
	source: createMDXSource(map),
});
