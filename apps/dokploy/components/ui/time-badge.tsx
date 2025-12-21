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
				return new Date(prevTime.getTime() + 1000);
			});
		}, 1000);

		return () => clearInterval(timer);
	}, []);

	if (!time || !serverTime?.timezone) {
		return null;
	}

	const formattedTime = new Intl.DateTimeFormat("en-US", {
		timeZone: serverTime.timezone,
		timeStyle: "medium",
		hour12: false,
	}).format(time);

	return (
		<div className="inline-flex items-center rounded-full border p-1 text-xs whitespace-nowrap max-w-full overflow-hidden gap-1">
			<div className="inline-flex items-center px-1 gap-1">
				<span className="hidden sm:inline">Server Time:</span>
				<span className="font-medium tabular-nums">{formattedTime}</span>
			</div>
			<span className="hidden sm:inline text-primary/70 border rounded-full bg-foreground/5 px-1.5 py-0.5">
				{serverTime.timezone} | {serverTime.offset}
			</span>
		</div>
	);
}
