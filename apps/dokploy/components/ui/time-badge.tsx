"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "next-i18next";
import { api } from "@/utils/api";

export function TimeBadge() {
	const { t, i18n } = useTranslation("common");
	const locale = i18n.language || "en";

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

	const getUtcOffset = (timeZone: string) => {
		const date = new Date();
		const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
		const tzDate = new Date(date.toLocaleString("en-US", { timeZone }));
		const offset = (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
		const sign = offset >= 0 ? "+" : "-";
		const hours = Math.floor(Math.abs(offset));
		const minutes = (Math.abs(offset) * 60) % 60;
		return `UTC${sign}${hours.toString().padStart(2, "0")}:${minutes
			.toString()
			.padStart(2, "0")}`;
	};

	const formattedTime = new Intl.DateTimeFormat(locale, {
		timeZone: serverTime.timezone,
		timeStyle: "medium",
		hour12: false,
	}).format(time);

	return (
		<div className="inline-flex items-center rounded-full border p-1 text-xs whitespace-nowrap max-w-full overflow-hidden gap-1">
			<div className="inline-flex items-center px-1 gap-1">
				<span className="hidden sm:inline">{t("time.serverTimeLabel")}</span>
				<span className="font-medium tabular-nums">{formattedTime}</span>
			</div>
			<span className="hidden sm:inline text-primary/70 border rounded-full bg-foreground/5 px-1.5 py-0.5">
				{serverTime.timezone} | {getUtcOffset(serverTime.timezone)}
			</span>
		</div>
	);
}
