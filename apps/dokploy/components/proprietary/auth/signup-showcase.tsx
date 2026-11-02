"use client";

import {
	Activity,
	ArrowRight,
	Bot,
	Boxes,
	Cloud,
	Database,
	Layers,
	LayoutTemplate,
	Rocket,
	Shield,
	Terminal,
	Unlock,
	Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ShowcaseItem {
	icon: typeof Users;
	title: string;
	description: string;
}

const SLIDES: ShowcaseItem[][] = [
	[
		{
			icon: Users,
			title: "Team access",
			description:
				"Anyone in your team can deploy simply and securely in a safe, governed environment.",
		},
		{
			icon: Layers,
			title: "Open source",
			description:
				"Deploy for free with the open-source alternative to Netlify, Vercel, and Heroku.",
		},
		{
			icon: Bot,
			title: "AI sandbox",
			description:
				"Unleash the power of AI and test AI-generated code in a sandbox before deploying to a live URL.",
		},
		{
			icon: Shield,
			title: "Enterprise ready",
			description:
				"Scale when you're ready with granular RBAC, SSO, audit logs, rollback and multi-tenancy.",
		},
	],
	[
		{
			icon: Rocket,
			title: "Any stack",
			description:
				"Deploy any application using Nixpacks, Heroku Buildpacks, or your own Dockerfile.",
		},
		{
			icon: Boxes,
			title: "Docker Compose",
			description:
				"Deploy complex applications natively with full Docker Compose integration.",
		},
		{
			icon: Cloud,
			title: "Multi-server",
			description:
				"Effortlessly deploy your applications on remote servers, with zero configuration hassle.",
		},
		{
			icon: LayoutTemplate,
			title: "Ready templates",
			description:
				"Get started quickly with pre-configured templates for Supabase, Cal.com, PocketBase, and more.",
		},
	],
	[
		{
			icon: Database,
			title: "Managed databases",
			description:
				"Manage and back up MySQL, PostgreSQL, MongoDB, MariaDB, and Redis directly from Dokploy.",
		},
		{
			icon: Terminal,
			title: "API & CLI",
			description: "Full API and CLI access to fit any custom workflow.",
		},
		{
			icon: Activity,
			title: "Live monitoring",
			description:
				"Monitor CPU, memory, and network usage in real time across every deployment.",
		},
		{
			icon: Unlock,
			title: "No lock-in",
			description:
				"Modify, scale, and customize Dokploy however your project needs.",
		},
	],
];

const AUTO_ADVANCE_MS = 6000;

export const SignupShowcase = () => {
	const [active, setActive] = useState(0);
	const [paused, setPaused] = useState(false);
	const [reduceMotion, setReduceMotion] = useState(false);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduceMotion(query.matches);
		const listener = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
		query.addEventListener("change", listener);
		return () => query.removeEventListener("change", listener);
	}, []);

	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		if (paused || reduceMotion) {
			return;
		}
		timerRef.current = setInterval(() => {
			setActive((prev) => (prev + 1) % SLIDES.length);
		}, AUTO_ADVANCE_MS);
		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
			}
		};
	}, [paused, reduceMotion]);

	const goTo = (index: number) => {
		setActive(((index % SLIDES.length) + SLIDES.length) % SLIDES.length);
	};

	return (
		<div
			className="relative"
			onMouseEnter={() => setPaused(true)}
			onMouseLeave={() => setPaused(false)}
			onFocus={() => setPaused(true)}
			onBlur={() => setPaused(false)}
		>
			<div
				key={active}
				className={cn(
					"grid grid-cols-2 gap-4",
					!reduceMotion &&
						"animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out",
				)}
			>
				{SLIDES[active]?.map((item) => (
					<div
						key={item.title}
						className="group flex flex-col gap-3 rounded-lg border border-primary/10 bg-background/40 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-background/60"
					>
						<div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary/15">
							<item.icon className="size-4.5" strokeWidth={1.75} />
						</div>
						<div className="space-y-1">
							<p className="text-sm font-medium text-primary">{item.title}</p>
							<p className="text-sm text-muted-foreground leading-snug">
								{item.description}
							</p>
						</div>
					</div>
				))}
			</div>

			<div className="mt-6 flex items-center gap-2">
				{SLIDES.map((slide, index) => (
					<button
						key={slide.map((item) => item.title).join("-")}
						type="button"
						aria-label={`Show showcase slide ${index + 1}`}
						aria-current={index === active}
						onClick={() => goTo(index)}
						className={cn(
							"h-1.5 rounded-full transition-all duration-300",
							index === active
								? "w-6 bg-primary"
								: "w-1.5 bg-primary/20 hover:bg-primary/40",
						)}
					/>
				))}
			</div>

			<button
				type="button"
				aria-label="Next showcase slide"
				onClick={() => goTo(active + 1)}
				className="absolute top-1/2 right-0 z-30 flex size-9 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-primary/15 bg-background text-primary shadow-sm transition-all duration-300 hover:scale-105 hover:border-primary/30 hover:shadow-md"
			>
				<ArrowRight className="size-4" strokeWidth={1.75} />
			</button>
		</div>
	);
};
