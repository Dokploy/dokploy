import { map } from "@/.map";
import { languages } from "@/i18n";
import { loader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx";

export const { getPage, getPages, pageTree, getLanguages } = loader({
	baseUrl: "/",
	languages,
	source: createMDXSource(map),
});
