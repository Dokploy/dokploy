export enum Languages {
	English = "en",
	Polish = "pl",
	Russian = "ru",
	French = "fr",
	German = "de",
	ChineseTraditional = "zh-Hant",
	ChineseSimplified = "zh-Hans",
	Turkish = "tr",
	Kazakh = "kz",
	Persian = "fa",
	Korean = "ko",
	Portuguese = "pt-br",
}

export type Language = keyof typeof Languages;
