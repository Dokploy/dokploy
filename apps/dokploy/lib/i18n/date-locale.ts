import { enUS, type Locale, ru } from "date-fns/locale";
import { useTranslation } from "react-i18next";

export const useDateLocale = (): Locale => {
	const { i18n } = useTranslation();
	return i18n.language === "ru" ? ru : enUS;
};
