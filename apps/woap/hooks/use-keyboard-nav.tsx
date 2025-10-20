"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const PAGES = [
	"compose",
	"application",
	"postgres",
	"redis",
	"mysql",
	"mariadb",
	"mongodb",
] as const;
type Page = (typeof PAGES)[number];

type Shortcuts = Record<string, string>;
type ShortcutsDictionary = Record<Page, Shortcuts>;

const COMPOSE_SHORTCUTS: Shortcuts = {
	g: "general",
	e: "environment",
	u: "domains",
	d: "deployments",
	b: "backups",
	s: "schedules",
	v: "volumeBackups",
	l: "logs",
	m: "monitoring",
	a: "advanced",
};

const APPLICATION_SHORTCUTS: Shortcuts = {
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

const POSTGRES_SHORTCUTS: Shortcuts = {
	g: "general",
	e: "environment",
	l: "logs",
	m: "monitoring",
	b: "backups",
	a: "advanced",
};

const REDIS_SHORTCUTS: Shortcuts = {
	g: "general",
	e: "environment",
	l: "logs",
	m: "monitoring",
	a: "advanced",
};

const SHORTCUTS: ShortcutsDictionary = {
	application: APPLICATION_SHORTCUTS,
	compose: COMPOSE_SHORTCUTS,
	postgres: POSTGRES_SHORTCUTS,
	redis: REDIS_SHORTCUTS,
	mysql: POSTGRES_SHORTCUTS,
	mariadb: POSTGRES_SHORTCUTS,
	mongodb: POSTGRES_SHORTCUTS,
};

/**
 * Use this to register keyboard shortcuts for different pages. Each shortcut
 * must be prefixed with `g` (like GitHub).
 *
 * @example
 * - `g g` "General",
 * - `g e` "Environment",
 * - `g u` "Domains",
 */
export function UseKeyboardNav({ forPage }: { forPage: Page }) {
	const [isModPressed, setModPressed] = useState(false);
	const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

	const sp = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const shortcuts = SHORTCUTS[forPage];

	const updateSearchParam = useCallback(
		(name: string, value: string) => {
			const params = new URLSearchParams(sp.toString());
			params.set(name, value);

			return params.toString();
		},
		[sp],
	);

	useEffect(() => {
		const handleKeyDown = ({ key, target }: KeyboardEvent) => {
			const active = target as HTMLElement | null;

			if (active) {
				const tag = active.tagName;
				if (
					active.isContentEditable ||
					tag === "INPUT" ||
					tag === "TEXTAREA" ||
					tag === "SELECT" ||
					active.getAttribute("role") === "textbox"
				)
					return;
			}

			if (isModPressed) {
				if (timer) clearTimeout(timer);
				setModPressed(false);

				if (key in shortcuts) {
					const tab = shortcuts[key]!;
					router.push(`${pathname}?${updateSearchParam("tab", tab)}`);
				}
			} else if (key === "g") {
				setModPressed(true);
				setTimer(setTimeout(() => setModPressed(false), 1500));
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isModPressed, timer, updateSearchParam, router, pathname]);

	return null;
}
