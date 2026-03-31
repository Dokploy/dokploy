"use client";

import { useEffect, useState } from "react";
import { api } from "@/utils/api";

export function TimeBadge() {
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

	const formattedTime = new Intl.DateTimeFormat("en-US", {
		timeZone: serverTime.timezone,
		timeStyle: "medium",
		hour12: false,
	}).format(time);

	return (
		<div className="inline-flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
			<span className="font-medium tabular-nums">{formattedTime}</span>
			<span className="hidden sm:inline text-muted-foreground/60">
				{serverTime.timezone}
			</span>
		</div>
	);
}
