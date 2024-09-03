import type {
	LocaleOptions,
	PlaceholdersObject,
	dateTimeFormatOptions,
	numberFormatOptions,
} from "./interface/interface";
import Locales from "./interface/locales";
import print from "./utils/print";

class InternationalizationKit {
	private static instance: InternationalizationKit;
	private currentLocale: string;
	private fallbackLocales: string[];
	private localesData: { [lang: string]: Locales };
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
	}

	public static getInstance(options: LocaleOptions): InternationalizationKit {
		try {
			// 如果默认语言不在 localesData 中，则使用 fallbackLocales 中的第一个语言，如果 fallbackLocales 为空，则抛出错误
			// this.validateLocale(options);

			if (!InternationalizationKit.instance) {
				InternationalizationKit.instance = new InternationalizationKit(
					options
				);

				print("InternationalizationKit instance created", "success");
			}
			return InternationalizationKit.instance;
		} catch (error) {
			print(error, "error");
			throw new Error(
				"Error in creating InternationalizationKit instance"
			);
		}
	}

	private static validateLocale(options: LocaleOptions) {
		const { defaultLocale, fallbackLocales, localesData } = options;
		if (!localesData[defaultLocale]) {
			print(
				`Default locale "${defaultLocale}" not found in localesData`,
				"error"
			);
		}

		for (const fallbackLocale of fallbackLocales) {
			if (!localesData[fallbackLocale]) {
				print(
					`Fallback locale "${fallbackLocale}" not found in localesData`,
					"error"
				);
			}
		}
	}

	public async loadRemoteLocale(
		fetchFn: Promise<Response>,
		locale: string
	): Promise<void> {
		if (!InternationalizationKit.instance) {
			print(
				"InternationalizationKit instance not created. Please initialize it first.",
				"error"
			);
		}

		try {
			const data: any = await fetchFn;

			// Assuming the remote JSON structure matches the expected structure for locale data.
			// Here you might want to add some logic to validate or process the data as needed.
			// For example, if the data contains multiple locales, you might want to merge them
			// with the existing localesData instead of just setting it for the currentLocale.

			// Merging the loaded data into the existing localesData
			// This is a simplistic approach; you might need more sophisticated merging logic
			// depending on the structure of your localesData and the incoming data.
			this.localesData[locale] = data;

			// print(`Remote locale data for ${JSON.stringify(data)} loaded successfully`, 'success');
		} catch (error) {
			print(`Error loading remote locale: ${error}`, "error");
		}
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

		if (placeholders && placeholders) {
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
		const textData = this.localesData[this.currentLocale] as Locales;

		let text = textData?.[key];
		if (!text) {
			// Fallback to fallback locales if text not found in current locale
			for (const fallbackLang of this.fallbackLocales) {
				text = this.localesData[fallbackLang]?.[key] as string;
				if (text) break;
			}
		}

		if (!text) {
			print(`Text for key "${key}" not found.`, "warning");
			return key;
		}

		// 如果 placeholders 为空，则使用默认的占位符对象
		const actualPlaceholders = placeholders || this.defaultPlaceholders;

		// 使用默认占位符替换文本中的占位符
		text = this.replacePlaceholders(
			text,
			placeholdersText,
			actualPlaceholders
		);

		return text;
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
