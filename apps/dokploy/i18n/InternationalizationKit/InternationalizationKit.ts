import type { LocaleOptions, PlaceholdersObject } from "./interface/interface";
import Locales from "./interface/locales";
import print from "./utils/print";

type LocalesData = {
	[lang: string]: Locales | (() => Promise<Locales>);
};

class InternationalizationKit {
	private static instance: InternationalizationKit;
	private currentLocale: string;
	private fallbackLocales: string[];
	private localesData: LocalesData;
	private loadedLocales: { [lang: string]: Locales };
	private defaultPlaceholders?: PlaceholdersObject;

	private constructor(options: LocaleOptions) {
		this.currentLocale = options.defaultLocale;
		this.fallbackLocales = options.fallbackLocales;
		this.localesData = options.localesData;
		this.loadedLocales = options.localesData as { [lang: string]: Locales };
		this.defaultPlaceholders = options.defaultPlaceholders;

		// this.initializeLocales();
	}

	private async initializeLocales() {
		await this.loadLocale(this.currentLocale);

		for (const fallbackLocale of this.fallbackLocales) {
			await this.loadLocale(fallbackLocale);
		}

		print("Locales data loaded successfully", "success");
	}

	private async loadLocale(locale: string) {
		const localeData = this.localesData[locale];

		if (!localeData) {
			print(`Locale "${locale}" not found in localesData`, "error");
			return;
		}

		if (typeof localeData === "function") {
			if (!this.loadedLocales[locale]) {
				try {
					const data = await localeData();
					this.loadedLocales[locale] = data;
				} catch (error) {
					print(
						`Error loading locale "${locale}": ${error}`,
						"error"
					);
				}
			}
		} else {
			this.loadedLocales[locale] = localeData;
		}
	}

	public static getInstance(options: LocaleOptions): InternationalizationKit {
		if (!InternationalizationKit.instance) {
			InternationalizationKit.instance = new InternationalizationKit(
				options
			);
			print("InternationalizationKit instance created", "success");
		}
		return InternationalizationKit.instance;
	}

	public setLocale(locale: string): void {
		this.currentLocale = locale;
	}

	private replacePlaceholders(
		text: string,
		placeholdersText?: { [key: string]: string | null | undefined },
		placeholders?: PlaceholdersObject
	): string {
		let replacedText = text;

		if (placeholders && placeholdersText) {
			for (const placeholder in placeholdersText) {
				if (
					Object.prototype.hasOwnProperty.call(
						placeholdersText,
						placeholder
					)
				) {
					const placeholderValue =
						placeholdersText[placeholder] || "";
					const placeholderPattern = new RegExp(
						`${placeholders.before}${placeholder}${placeholders.after}`,
						"g"
					);
					replacedText = replacedText.replace(
						placeholderPattern,
						placeholderValue
					);
				}
			}
		}

		return replacedText;
	}

	public getText(
		key: keyof Locales,
		placeholdersText?: { [key: string]: string | null | undefined },
		placeholders?: PlaceholdersObject
	): string {
		let text: string | undefined =
			this.loadedLocales[this.currentLocale]?.[key];

		if (!text) {
			for (const fallbackLang of this.fallbackLocales) {
				text = this.loadedLocales[fallbackLang]?.[key];
				if (text) break;
			}
		}

		if (!text) {
			print(`Text for key "${key}" not found.`, "warning");
			return key;
		}

		const actualPlaceholders = placeholders || this.defaultPlaceholders;

		return this.replacePlaceholders(
			text,
			placeholdersText,
			actualPlaceholders
		);
	}
}

export default InternationalizationKit;
