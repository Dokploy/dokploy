"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const SHORTCUTS = {
	g: "general",
	e: "environment",
	u: "domains",
	p: "preview-deployments",
	s: "schedules",
	v: "volume-backups",
	d: "deployments",
	l: "logs",
	m: "monitoring",
	a: "advanced",
};

/**
 * Use this to register keyboard shortcuts for the application page. Each
 * shortcut must be prefixed with `g` (like GitHub).
 *
 * - `g g` "General",
 * - `g e` "Environment",
 * - `g u` "Domains",
 * - `g p` "Preview Deployments",
 * - `g s` "Schedules",
 * - `g v` "Volume Backups",
 * - `g d` "Deployments",
 * - `g l` "Logs",
 * - `g m` "Monitoring",
 * - `g a` "Advanced"
 */
export function UseKeyboardNavForApplications() {
	const [isModPressed, setModPressed] = useState(false);
	const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

	const sp = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const updateSearchParam = useCallback(
		(name: string, value: string) => {
			const params = new URLSearchParams(sp.toString());
			params.set(name, value);

			return params.toString();
		},
		[sp],
	);

	useEffect(() => {
		const handleKeyDown = ({ key }: KeyboardEvent) => {
			if (isModPressed) {
				if (timer) clearTimeout(timer);
				setModPressed(false);

				if (key in SHORTCUTS) {
					const tab = SHORTCUTS[key as keyof typeof SHORTCUTS];
					router.push(
						`${pathname}?${updateSearchParam("tab", tab.toLowerCase())}`,
					);
				}
			} else {
				if (key === "g") {
					setModPressed(true);
					setTimer(setTimeout(() => setModPressed(false), 5000));
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isModPressed, timer, updateSearchParam, router, pathname]);

	return null;
}
