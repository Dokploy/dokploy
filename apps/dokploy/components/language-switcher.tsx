"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import type { Locale } from "@/i18n/locale";
import { isLocale } from "@/i18n/locale";
import { useLocaleContext } from "@/i18n/locale-context";
import { cn } from "@/lib/utils";

type Props = {
	className?: string;
};

const LOCALE_OPTIONS: Array<{ locale: Locale; flag: string; labelKey: string }> =
	[
		{ locale: "ru", flag: "🇷🇺", labelKey: "language.ru" },
		{ locale: "en", flag: "🇬🇧", labelKey: "language.en" },
	];

export const LanguageSwitcher = ({ className }: Props) => {
	const t = useTranslations();
	const { locale, setLocale } = useLocaleContext();

	const handleChange = (nextValue: string) => {
		if (!isLocale(nextValue)) return;
		setLocale(nextValue);
	};

	return (
		<label className={cn("flex items-center gap-2", className)}>
			<span className="text-xs text-muted-foreground">{t("language.label")}</span>
			<select
				className={cn(
					"rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground",
				)}
				value={locale}
				onChange={(e) => handleChange(e.target.value)}
			>
				{LOCALE_OPTIONS.map((option) => (
					<option key={option.locale} value={option.locale}>
						{option.flag} {t(option.labelKey)}
					</option>
				))}
			</select>
		</label>
	);
};

