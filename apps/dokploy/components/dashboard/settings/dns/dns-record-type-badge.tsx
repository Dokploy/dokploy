import { cn } from "@/lib/utils";

const recordTypeStyles: Record<string, string> = {
	A: "bg-blue-500/10 text-blue-700 ring-blue-500/25 dark:text-blue-300",
	AAAA: "bg-indigo-500/10 text-indigo-700 ring-indigo-500/25 dark:text-indigo-300",
	CNAME:
		"bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300",
	MX: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
	TXT: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
	NS: "bg-cyan-500/10 text-cyan-700 ring-cyan-500/25 dark:text-cyan-300",
	SRV: "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300",
	CAA: "bg-teal-500/10 text-teal-700 ring-teal-500/25 dark:text-teal-300",
	PTR: "bg-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-300",
	SOA: "bg-slate-500/10 text-slate-700 ring-slate-500/25 dark:text-slate-300",
};

interface Props {
	type: string;
	className?: string;
}

export const DnsRecordTypeBadge = ({ type, className }: Props) => (
	<span
		className={cn(
			"inline-flex h-6 min-w-16 shrink-0 items-center justify-center rounded-md px-2 font-mono text-[11px] font-semibold tracking-wide ring-1 ring-inset",
			recordTypeStyles[type.toUpperCase()] ??
				"bg-foreground/5 text-muted-foreground ring-foreground/15",
			className,
		)}
	>
		{type.toUpperCase()}
	</span>
);
