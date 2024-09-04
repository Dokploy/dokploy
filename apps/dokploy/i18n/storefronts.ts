export type Storefront = {
	id: string;
	href: string;
	label: string;
	defaultLanguageTag: string;
	supportedLanguageTags: string[];
};

export const storefronts: Storefront[] = [
	{
		id: "us",
		href: "/us",
		label: "United States",
		defaultLanguageTag: "en-US",
		supportedLanguageTags: [],
	},
	{
		id: "cn",
		href: "/cn",
		label: "中国大陆",
		defaultLanguageTag: "zh-Hans-CN",
		supportedLanguageTags: [],
	},
];
