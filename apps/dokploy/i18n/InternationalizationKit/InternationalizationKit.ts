import type {
	dateTimeFormatOptions,
	LocaleOptions,
	numberFormatOptions,
	PlaceholdersObject,
} from "./interface/interface";
import Locales from "./interface/locales";
import print from "./utils/print";

// 定义 localesData 的类型，可以是直接的 Locales 对象或返回 Promise 的函数
type LocalesData = {
	[lang: string]: Locales | (() => Promise<Locales>);
};

class InternationalizationKit {
	private static instance: InternationalizationKit;
	private currentLocale: string;
	private fallbackLocales: string[];
	private localesData: LocalesData;
	private loadedLocales: { [lang: string]: Locales } = {};
	private numberFormat?: Intl.NumberFormatOptions;
	private dateTimeFormat?: Intl.DateTimeFormatOptions;
	private defaultPlaceholders?: PlaceholdersObject;

	private constructor(options: LocaleOptions) {
		this.currentLocale = options.defaultLocale;
		this.fallbackLocales = options.fallbackLocales;
		this.localesData = options.localesData;
		this.numberFormat = options.numberFormat;
		this.dateTimeFormat = options.dateTimeFormat;
		this.defaultPlaceholders = options.defaultPlaceholders;

		// 在实例初始化时加载所有语言数据
		this.initializeLocales();
	}

	private async initializeLocales() {
		// 加载默认语言
		await this.loadLocale(this.currentLocale);

		// 加载所有后备语言
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
			// 如果是函数，异步加载语言数据
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
			// 如果是对象，直接使用
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

	// 替换占位符的通用函数
	private replacePlaceholders(
		text: string,
		placeholdersText?: { [key: string]: string },
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

	// 获取特定语言的文本
	public getText(
		key: keyof Locales,
		placeholdersText?: { [key: string]: string },
		placeholders?: PlaceholdersObject
	): string {
		let text: string | undefined =
			this.loadedLocales[this.currentLocale]?.[key];

		if (!text) {
			// 如果当前语言未找到，尝试使用后备语言
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

	// 日期时间格式化接受 Date 对象、时间戳或者日期字符串
	public getDateTimeFormat(options: dateTimeFormatOptions): string {
		const actualDateTimeFormat =
			options.dateTimeFormat || this.dateTimeFormat;
		const actualLocale = options.locale || this.currentLocale;

		if (actualLocale || actualDateTimeFormat) {
			try {
				return new Intl.DateTimeFormat(
					actualLocale,
					actualDateTimeFormat
				).format(options.date);
			} catch (error) {
				print(`Error in getDateTimeFormat: ${error}`, "error");
			}
		}
		return new Intl.DateTimeFormat().format(options.date);
	}

	// 数字格式化接受数字或者大整数
	public getNumberFormat(options: numberFormatOptions): string {
		const actualLocale = options.locale || this.currentLocale;
		const actualNumberFormat = options.numberFormat || this.numberFormat;

		if (actualLocale || actualNumberFormat) {
			try {
				return new Intl.NumberFormat(
					actualLocale,
					actualNumberFormat
				).format(options.value);
			} catch (error) {
				print(`Error in getNumberFormat: ${error}`, "error");
			}
		}
		return new Intl.NumberFormat().format(options.value);
	}
}

export default InternationalizationKit;
