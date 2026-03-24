"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useLocaleContext } from "@/i18n/locale-context";
import { api } from "@/utils/api";

const INTL_LOCALE_BY_APP: Record<string, string> = {
	en: "en-US",
	ru: "ru-RU",
};

export function TimeBadge() {
	const t = useTranslations("ui");
	const { locale } = useLocaleContext();
	const { data: serverTime } = api.server.getServerTime.useQuery(undefined);
	const [time, setTime] = useState<Date | null>(null);

	useEffect(() => {
		if (serverTime?.time) {
			setTime(new Date(serverTime.time));
		}
	}, [serverTime]);

	useEffect(() => {
		const timer = setInterval(() => {
			setTime((prevTime) => {
				if (!prevTime) return null;
				const newTime = new Date(prevTime.getTime() + 1000);
				return newTime;
			});
		}, 1000);

		return () => {
			clearInterval(timer);
		};
	}, []);

	if (!time || !serverTime?.timezone) {
		return null;
	}

	const intlLocale = INTL_LOCALE_BY_APP[locale] ?? "en-US";

	/** en-US даёт строку, которую `Date` стабильно парсит; ru-RU ломает парсинг и даёт NaN. */
	const getUtcOffset = (timeZone: string) => {
		const date = new Date();
		const utcDate = new Date(
			date.toLocaleString("en-US", { timeZone: "UTC" }),
		);
		const tzDate = new Date(date.toLocaleString("en-US", { timeZone }));
		const offsetMs = tzDate.getTime() - utcDate.getTime();
		if (!Number.isFinite(offsetMs)) {
			return "UTC+00:00";
		}
		const offsetHours = offsetMs / (1000 * 60 * 60);
		const sign = offsetHours >= 0 ? "+" : "-";
		const hours = Math.floor(Math.abs(offsetHours));
		const minutes = Math.round((Math.abs(offsetHours) * 60) % 60);
		return `UTC${sign}${hours.toString().padStart(2, "0")}:${minutes
			.toString()
			.padStart(2, "0")}`;
	};

	const formattedTime = new Intl.DateTimeFormat(intlLocale, {
		timeZone: serverTime.timezone,
		timeStyle: "medium",
		hour12: false,
	}).format(time);

	return (
		<div className="inline-flex items-center rounded-full border p-1 text-xs whitespace-nowrap max-w-full overflow-hidden gap-1">
			<div className="inline-flex items-center px-1 gap-1">
				<span className="hidden sm:inline">{t("timeBadgeServerTime")}</span>
				<span className="font-medium tabular-nums">{formattedTime}</span>
			</div>
			<span className="hidden sm:inline text-primary/70 border border-primary/10 rounded-full bg-foreground/5 px-1.5 py-0.5">
				{serverTime.timezone} | {getUtcOffset(serverTime.timezone)}
			</span>
		</div>
	);
}
