export type Storefront = {
	id: string;
	type: string;
	href: string;
	attributes: {
		name: string;
		defaultLanguageTag: string;
		supportedLanguageTags: string[];
	};
};

export const storefronts: Storefront[] = [
	// {
	// 	id: "dz",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/dz",
	// 	attributes: {
	// 		name: "Algeria",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR", "ar"],
	// 	},
	// },
	// {
	// 	id: "ao",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ao",
	// 	attributes: {
	// 		name: "Angola",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ai",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ai",
	// 	attributes: {
	// 		name: "Anguilla",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ag",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ag",
	// 	attributes: {
	// 		name: "Antigua and Barbuda",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ar",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ar",
	// 	attributes: {
	// 		name: "Argentina",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "am",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/am",
	// 	attributes: {
	// 		name: "Armenia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "au",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/au",
	// 	attributes: {
	// 		name: "Australia",
	// 		defaultLanguageTag: "en-AU",
	// 		supportedLanguageTags: ["en-AU", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "at",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/at",
	// 	attributes: {
	// 		name: "Austria",
	// 		defaultLanguageTag: "de-DE",
	// 		supportedLanguageTags: ["de-DE", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "az",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/az",
	// 	attributes: {
	// 		name: "Azerbaijan",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "bs",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/bs",
	// 	attributes: {
	// 		name: "Bahamas",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "bh",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/bh",
	// 	attributes: {
	// 		name: "Bahrain",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ar"],
	// 	},
	// },
	// {
	// 	id: "bb",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/bb",
	// 	attributes: {
	// 		name: "Barbados",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "by",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/by",
	// 	attributes: {
	// 		name: "Belarus",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "be",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/be",
	// 	attributes: {
	// 		name: "Belgium",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR", "nl"],
	// 	},
	// },
	// {
	// 	id: "bz",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/bz",
	// 	attributes: {
	// 		name: "Belize",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "es-MX"],
	// 	},
	// },
	// {
	// 	id: "bj",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/bj",
	// 	attributes: {
	// 		name: "Benin",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "bm",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/bm",
	// 	attributes: {
	// 		name: "Bermuda",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "bt",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/bt",
	// 	attributes: {
	// 		name: "Bhutan",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "bo",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/bo",
	// 	attributes: {
	// 		name: "Bolivia",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "ba",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ba",
	// 	attributes: {
	// 		name: "Bosnia and Herzegovina",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "hr"],
	// 	},
	// },
	// {
	// 	id: "bw",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/bw",
	// 	attributes: {
	// 		name: "Botswana",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "br",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/br",
	// 	attributes: {
	// 		name: "Brazil",
	// 		defaultLanguageTag: "pt-BR",
	// 		supportedLanguageTags: ["pt-BR", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "vg",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/vg",
	// 	attributes: {
	// 		name: "British Virgin Islands",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "bg",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/bg",
	// 	attributes: {
	// 		name: "Bulgaria",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "kh",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/kh",
	// 	attributes: {
	// 		name: "Cambodia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "cm",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/cm",
	// 	attributes: {
	// 		name: "Cameroon",
	// 		defaultLanguageTag: "fr-FR",
	// 		supportedLanguageTags: ["fr-FR", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "ca",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ca",
	// 	attributes: {
	// 		name: "Canada",
	// 		defaultLanguageTag: "en-CA",
	// 		supportedLanguageTags: ["en-CA", "fr-CA"],
	// 	},
	// },
	// {
	// 	id: "cv",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/cv",
	// 	attributes: {
	// 		name: "Cape Verde",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ky",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ky",
	// 	attributes: {
	// 		name: "Cayman Islands",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "td",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/td",
	// 	attributes: {
	// 		name: "Chad",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "cl",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/cl",
	// 	attributes: {
	// 		name: "Chile",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	{
		id: "cn",
		type: "storefronts",
		href: "/v1/storefronts/cn",
		attributes: {
			name: "中国大陆",
			defaultLanguageTag: "zh-Hans-CN",
			supportedLanguageTags: ["zh-Hans-CN", "en-GB"],
		},
	},
	// {
	// 	id: "co",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/co",
	// 	attributes: {
	// 		name: "Colombia",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "cr",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/cr",
	// 	attributes: {
	// 		name: "Costa Rica",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "hr",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/hr",
	// 	attributes: {
	// 		name: "Croatia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "hr"],
	// 	},
	// },
	// {
	// 	id: "cy",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/cy",
	// 	attributes: {
	// 		name: "Cyprus",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "el", "tr"],
	// 	},
	// },
	// {
	// 	id: "cz",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/cz",
	// 	attributes: {
	// 		name: "Czech Republic",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "cs"],
	// 	},
	// },
	// {
	// 	id: "ci",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ci",
	// 	attributes: {
	// 		name: "Côte d’Ivoire",
	// 		defaultLanguageTag: "fr-FR",
	// 		supportedLanguageTags: ["fr-FR", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "cd",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/cd",
	// 	attributes: {
	// 		name: "Democratic Republic of the Congo",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "dk",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/dk",
	// 	attributes: {
	// 		name: "Denmark",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "da"],
	// 	},
	// },
	// {
	// 	id: "dm",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/dm",
	// 	attributes: {
	// 		name: "Dominica",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "do",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/do",
	// 	attributes: {
	// 		name: "Dominican Republic",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "ec",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ec",
	// 	attributes: {
	// 		name: "Ecuador",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "eg",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/eg",
	// 	attributes: {
	// 		name: "Egypt",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR", "ar"],
	// 	},
	// },
	// {
	// 	id: "sv",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/sv",
	// 	attributes: {
	// 		name: "El Salvador",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "ee",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ee",
	// 	attributes: {
	// 		name: "Estonia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "sz",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/sz",
	// 	attributes: {
	// 		name: "Eswatini",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "fj",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/fj",
	// 	attributes: {
	// 		name: "Fiji",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "fi",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/fi",
	// 	attributes: {
	// 		name: "Finland",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fi"],
	// 	},
	// },
	// {
	// 	id: "fr",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/fr",
	// 	attributes: {
	// 		name: "France",
	// 		defaultLanguageTag: "fr-FR",
	// 		supportedLanguageTags: ["fr-FR", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "ga",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ga",
	// 	attributes: {
	// 		name: "Gabon",
	// 		defaultLanguageTag: "fr-FR",
	// 		supportedLanguageTags: ["fr-FR", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "gm",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/gm",
	// 	attributes: {
	// 		name: "Gambia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ge",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ge",
	// 	attributes: {
	// 		name: "Georgia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "de",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/de",
	// 	attributes: {
	// 		name: "Germany",
	// 		defaultLanguageTag: "de-DE",
	// 		supportedLanguageTags: ["de-DE", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "gh",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/gh",
	// 	attributes: {
	// 		name: "Ghana",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "gr",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/gr",
	// 	attributes: {
	// 		name: "Greece",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "el"],
	// 	},
	// },
	// {
	// 	id: "gd",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/gd",
	// 	attributes: {
	// 		name: "Grenada",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "gt",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/gt",
	// 	attributes: {
	// 		name: "Guatemala",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "gw",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/gw",
	// 	attributes: {
	// 		name: "Guinea-Bissau",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "gy",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/gy",
	// 	attributes: {
	// 		name: "Guyana",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "hn",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/hn",
	// 	attributes: {
	// 		name: "Honduras",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "hk",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/hk",
	// 	attributes: {
	// 		name: "Hong Kong",
	// 		defaultLanguageTag: "zh-Hant-HK",
	// 		supportedLanguageTags: ["zh-Hant-HK", "en-GB", "zh-Hant-TW"],
	// 	},
	// },
	// {
	// 	id: "hu",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/hu",
	// 	attributes: {
	// 		name: "Hungary",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "hu"],
	// 	},
	// },
	// {
	// 	id: "is",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/is",
	// 	attributes: {
	// 		name: "Iceland",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "in",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/in",
	// 	attributes: {
	// 		name: "India",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "hi"],
	// 	},
	// },
	// {
	// 	id: "id",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/id",
	// 	attributes: {
	// 		name: "Indonesia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "id"],
	// 	},
	// },
	// {
	// 	id: "iq",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/iq",
	// 	attributes: {
	// 		name: "Iraq",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ar"],
	// 	},
	// },
	// {
	// 	id: "ie",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ie",
	// 	attributes: {
	// 		name: "Ireland",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "il",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/il",
	// 	attributes: {
	// 		name: "Israel",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "he"],
	// 	},
	// },
	// {
	// 	id: "it",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/it",
	// 	attributes: {
	// 		name: "Italy",
	// 		defaultLanguageTag: "it",
	// 		supportedLanguageTags: ["it", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "jm",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/jm",
	// 	attributes: {
	// 		name: "Jamaica",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "jp",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/jp",
	// 	attributes: {
	// 		name: "Japan",
	// 		defaultLanguageTag: "ja",
	// 		supportedLanguageTags: ["ja", "en-US"],
	// 	},
	// },
	// {
	// 	id: "jo",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/jo",
	// 	attributes: {
	// 		name: "Jordan",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ar"],
	// 	},
	// },
	// {
	// 	id: "kz",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/kz",
	// 	attributes: {
	// 		name: "Kazakhstan",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ke",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ke",
	// 	attributes: {
	// 		name: "Kenya",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "kr",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/kr",
	// 	attributes: {
	// 		name: "Korea, Republic of",
	// 		defaultLanguageTag: "ko",
	// 		supportedLanguageTags: ["ko", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "xk",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/xk",
	// 	attributes: {
	// 		name: "Kosovo",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "kw",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/kw",
	// 	attributes: {
	// 		name: "Kuwait",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ar"],
	// 	},
	// },
	// {
	// 	id: "kg",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/kg",
	// 	attributes: {
	// 		name: "Kyrgyzstan",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "la",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/la",
	// 	attributes: {
	// 		name: "Lao People’s Democratic Republic",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "lv",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/lv",
	// 	attributes: {
	// 		name: "Latvia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "lb",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/lb",
	// 	attributes: {
	// 		name: "Lebanon",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR", "ar"],
	// 	},
	// },
	// {
	// 	id: "lr",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/lr",
	// 	attributes: {
	// 		name: "Liberia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ly",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ly",
	// 	attributes: {
	// 		name: "Libya",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ar"],
	// 	},
	// },
	// {
	// 	id: "lt",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/lt",
	// 	attributes: {
	// 		name: "Lithuania",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "lu",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/lu",
	// 	attributes: {
	// 		name: "Luxembourg",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR", "de-DE"],
	// 	},
	// },
	// {
	// 	id: "mo",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mo",
	// 	attributes: {
	// 		name: "Macao",
	// 		defaultLanguageTag: "zh-Hant-HK",
	// 		supportedLanguageTags: ["zh-Hant-HK", "en-GB", "zh-Hant-TW"],
	// 	},
	// },
	// {
	// 	id: "mg",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mg",
	// 	attributes: {
	// 		name: "Madagascar",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "mw",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mw",
	// 	attributes: {
	// 		name: "Malawi",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "my",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/my",
	// 	attributes: {
	// 		name: "Malaysia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ms"],
	// 	},
	// },
	// {
	// 	id: "mv",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mv",
	// 	attributes: {
	// 		name: "Maldives",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ml",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ml",
	// 	attributes: {
	// 		name: "Mali",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "mt",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mt",
	// 	attributes: {
	// 		name: "Malta",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "mr",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mr",
	// 	attributes: {
	// 		name: "Mauritania",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR", "ar"],
	// 	},
	// },
	// {
	// 	id: "mu",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mu",
	// 	attributes: {
	// 		name: "Mauritius",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "mx",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mx",
	// 	attributes: {
	// 		name: "Mexico",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "fm",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/fm",
	// 	attributes: {
	// 		name: "Micronesia, Federated States of",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "md",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/md",
	// 	attributes: {
	// 		name: "Moldova",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "mn",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mn",
	// 	attributes: {
	// 		name: "Mongolia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "me",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/me",
	// 	attributes: {
	// 		name: "Montenegro",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "hr"],
	// 	},
	// },
	// {
	// 	id: "ms",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ms",
	// 	attributes: {
	// 		name: "Montserrat",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ma",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ma",
	// 	attributes: {
	// 		name: "Morocco",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR", "ar"],
	// 	},
	// },
	// {
	// 	id: "mz",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mz",
	// 	attributes: {
	// 		name: "Mozambique",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "mm",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mm",
	// 	attributes: {
	// 		name: "Myanmar",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "na",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/na",
	// 	attributes: {
	// 		name: "Namibia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "np",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/np",
	// 	attributes: {
	// 		name: "Nepal",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "nl",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/nl",
	// 	attributes: {
	// 		name: "Netherlands",
	// 		defaultLanguageTag: "nl",
	// 		supportedLanguageTags: ["nl", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "nz",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/nz",
	// 	attributes: {
	// 		name: "New Zealand",
	// 		defaultLanguageTag: "en-AU",
	// 		supportedLanguageTags: ["en-AU", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "ni",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ni",
	// 	attributes: {
	// 		name: "Nicaragua",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "ne",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ne",
	// 	attributes: {
	// 		name: "Niger",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "ng",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ng",
	// 	attributes: {
	// 		name: "Nigeria",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "mk",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/mk",
	// 	attributes: {
	// 		name: "North Macedonia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "no",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/no",
	// 	attributes: {
	// 		name: "Norway",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "nb"],
	// 	},
	// },
	// {
	// 	id: "om",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/om",
	// 	attributes: {
	// 		name: "Oman",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ar"],
	// 	},
	// },
	// {
	// 	id: "pa",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/pa",
	// 	attributes: {
	// 		name: "Panama",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "pg",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/pg",
	// 	attributes: {
	// 		name: "Papua New Guinea",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "py",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/py",
	// 	attributes: {
	// 		name: "Paraguay",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "pe",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/pe",
	// 	attributes: {
	// 		name: "Peru",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "ph",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ph",
	// 	attributes: {
	// 		name: "Philippines",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "pl",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/pl",
	// 	attributes: {
	// 		name: "Poland",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "pl"],
	// 	},
	// },
	// {
	// 	id: "pt",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/pt",
	// 	attributes: {
	// 		name: "Portugal",
	// 		defaultLanguageTag: "pt-PT",
	// 		supportedLanguageTags: ["pt-PT", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "qa",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/qa",
	// 	attributes: {
	// 		name: "Qatar",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ar"],
	// 	},
	// },
	// {
	// 	id: "cg",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/cg",
	// 	attributes: {
	// 		name: "Republic of the Congo",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "ro",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ro",
	// 	attributes: {
	// 		name: "Romania",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ro"],
	// 	},
	// },
	// {
	// 	id: "ru",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ru",
	// 	attributes: {
	// 		name: "Russia",
	// 		defaultLanguageTag: "ru",
	// 		supportedLanguageTags: ["ru", "en-GB", "uk"],
	// 	},
	// },
	// {
	// 	id: "rw",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/rw",
	// 	attributes: {
	// 		name: "Rwanda",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "sa",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/sa",
	// 	attributes: {
	// 		name: "Saudi Arabia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ar"],
	// 	},
	// },
	// {
	// 	id: "sn",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/sn",
	// 	attributes: {
	// 		name: "Senegal",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "rs",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/rs",
	// 	attributes: {
	// 		name: "Serbia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "hr"],
	// 	},
	// },
	// {
	// 	id: "sc",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/sc",
	// 	attributes: {
	// 		name: "Seychelles",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "sl",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/sl",
	// 	attributes: {
	// 		name: "Sierra Leone",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "sg",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/sg",
	// 	attributes: {
	// 		name: "Singapore",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "zh-Hans-CN"],
	// 	},
	// },
	// {
	// 	id: "sk",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/sk",
	// 	attributes: {
	// 		name: "Slovakia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "sk"],
	// 	},
	// },
	// {
	// 	id: "si",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/si",
	// 	attributes: {
	// 		name: "Slovenia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "sb",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/sb",
	// 	attributes: {
	// 		name: "Solomon Islands",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "za",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/za",
	// 	attributes: {
	// 		name: "South Africa",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "es",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/es",
	// 	attributes: {
	// 		name: "Spain",
	// 		defaultLanguageTag: "es-ES",
	// 		supportedLanguageTags: ["es-ES", "en-GB", "ca"],
	// 	},
	// },
	// {
	// 	id: "lk",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/lk",
	// 	attributes: {
	// 		name: "Sri Lanka",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "kn",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/kn",
	// 	attributes: {
	// 		name: "St. Kitts and Nevis",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "lc",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/lc",
	// 	attributes: {
	// 		name: "St. Lucia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "vc",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/vc",
	// 	attributes: {
	// 		name: "St. Vincent and The Grenadines",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "sr",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/sr",
	// 	attributes: {
	// 		name: "Suriname",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "nl"],
	// 	},
	// },
	// {
	// 	id: "se",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/se",
	// 	attributes: {
	// 		name: "Sweden",
	// 		defaultLanguageTag: "sv",
	// 		supportedLanguageTags: ["sv", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "ch",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ch",
	// 	attributes: {
	// 		name: "Switzerland",
	// 		defaultLanguageTag: "de-CH",
	// 		supportedLanguageTags: ["de-CH", "de-DE", "en-GB", "fr-FR", "it"],
	// 	},
	// },
	// {
	// 	id: "tw",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/tw",
	// 	attributes: {
	// 		name: "Taiwan",
	// 		defaultLanguageTag: "zh-Hant-TW",
	// 		supportedLanguageTags: ["zh-Hant-TW", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "tj",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/tj",
	// 	attributes: {
	// 		name: "Tajikistan",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "tz",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/tz",
	// 	attributes: {
	// 		name: "Tanzania",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "th",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/th",
	// 	attributes: {
	// 		name: "Thailand",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "th"],
	// 	},
	// },
	// {
	// 	id: "to",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/to",
	// 	attributes: {
	// 		name: "Tonga",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "tt",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/tt",
	// 	attributes: {
	// 		name: "Trinidad and Tobago",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "tn",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/tn",
	// 	attributes: {
	// 		name: "Tunisia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR", "ar"],
	// 	},
	// },
	// {
	// 	id: "tr",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/tr",
	// 	attributes: {
	// 		name: "Turkey",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "tr"],
	// 	},
	// },
	// {
	// 	id: "tm",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/tm",
	// 	attributes: {
	// 		name: "Turkmenistan",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "tc",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/tc",
	// 	attributes: {
	// 		name: "Turks and Caicos",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ae",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ae",
	// 	attributes: {
	// 		name: "UAE",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ar"],
	// 	},
	// },
	// {
	// 	id: "ug",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ug",
	// 	attributes: {
	// 		name: "Uganda",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "ua",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ua",
	// 	attributes: {
	// 		name: "Ukraine",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "uk", "ru"],
	// 	},
	// },
	// {
	// 	id: "gb",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/gb",
	// 	attributes: {
	// 		name: "United Kingdom",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	{
		id: "us",
		type: "storefronts",
		href: "/v1/storefronts/us",
		attributes: {
			name: "United States",
			defaultLanguageTag: "en-US",
			supportedLanguageTags: ["en-US", "es-MX", "ar", "ru", "zh-Hans-CN"],
		},
	},
	// {
	// 	id: "uy",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/uy",
	// 	attributes: {
	// 		name: "Uruguay",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "es-MX"],
	// 	},
	// },
	// {
	// 	id: "uz",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/uz",
	// 	attributes: {
	// 		name: "Uzbekistan",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "vu",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/vu",
	// 	attributes: {
	// 		name: "Vanuatu",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "fr-FR"],
	// 	},
	// },
	// {
	// 	id: "ve",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ve",
	// 	attributes: {
	// 		name: "Venezuela",
	// 		defaultLanguageTag: "es-MX",
	// 		supportedLanguageTags: ["es-MX", "en-GB"],
	// 	},
	// },
	// {
	// 	id: "vn",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/vn",
	// 	attributes: {
	// 		name: "Vietnam",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "vi"],
	// 	},
	// },
	// {
	// 	id: "ye",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/ye",
	// 	attributes: {
	// 		name: "Yemen",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB", "ar"],
	// 	},
	// },
	// {
	// 	id: "zm",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/zm",
	// 	attributes: {
	// 		name: "Zambia",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
	// {
	// 	id: "zw",
	// 	type: "storefronts",
	// 	href: "/v1/storefronts/zw",
	// 	attributes: {
	// 		name: "Zimbabwe",
	// 		defaultLanguageTag: "en-GB",
	// 		supportedLanguageTags: ["en-GB"],
	// 	},
	// },
];
