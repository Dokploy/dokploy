import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipPortal,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FancyAnsi } from "fancy-ansi";
import { escapeRegExp } from "lodash";
import React from "react";
import { type LogLine, getLogType } from "./utils";

interface LogLineProps {
	log: LogLine;
	noTimestamp?: boolean;
	searchTerm?: string;
}

const fancyAnsi = new FancyAnsi();

export function TerminalLine({ log, noTimestamp, searchTerm }: LogLineProps) {
	const { timestamp, message, rawTimestamp } = log;
	const { type, variant, color } = getLogType(message);

	const formattedTime = timestamp
		? timestamp.toLocaleString([], {
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				year: "2-digit",
				second: "2-digit",
			})
		: "--- No time found ---";

	const highlightMessage = (text: string, term: string) => {
		if (!term) {
			return (
				<span
					className="transition-colors"
					dangerouslySetInnerHTML={{
						__html: fancyAnsi.toHtml(text),
					}}
				/>
			);
		}

		const htmlContent = fancyAnsi.toHtml(text);
		const modifiedContent = htmlContent.replace(
			/<span([^>]*)>([^<]*)<\/span>/g,
			(match, attrs, content) => {
				const searchRegex = new RegExp(`(${escapeRegExp(term)})`, "gi");
				if (!content.match(searchRegex)) return match;

				const segments = content.split(searchRegex);
				const wrappedSegments = segments
					.map((segment: string) =>
						segment.toLowerCase() === term.toLowerCase()
							? `<span${attrs} class="bg-yellow-200/50 dark:bg-yellow-900/50">${segment}</span>`
							: segment,
					)
					.join("");

				return `<span${attrs}>${wrappedSegments}</span>`;
			},
		);

		return (
			<span
				className="transition-colors"
				dangerouslySetInnerHTML={{ __html: modifiedContent }}
			/>
		);
	};

	const tooltip = (color: string, timestamp: string | null) => {
		const square = (
			<div className={cn("h-full w-2 flex-shrink-0 rounded-[3px]", color)} />
		);
		return timestamp ? (
			<TooltipProvider delayDuration={0} disableHoverableContent>
				<Tooltip>
					<TooltipTrigger asChild>{square}</TooltipTrigger>
					<TooltipPortal>
						<TooltipContent
							sideOffset={5}
							className="z-[99999] border-border bg-popover"
						>
							<p className="text max-w-md break-all text-muted-foreground text-xs">
								<pre>{timestamp}</pre>
							</p>
						</TooltipContent>
					</TooltipPortal>
				</Tooltip>
			</TooltipProvider>
		) : (
			square
		);
	};

	return (
		<div
			className={cn(
				"group flex flex-row gap-3 py-2 font-mono text-xs sm:py-0.5",
				type === "error"
					? "bg-red-500/10 hover:bg-red-500/15"
					: type === "warning"
						? "bg-yellow-500/10 hover:bg-yellow-500/15"
						: type === "debug"
							? "bg-orange-500/10 hover:bg-orange-500/15"
							: "hover:bg-gray-200/50 dark:hover:bg-gray-800/50",
			)}
		>
			{" "}
			<div className="flex items-start gap-x-2">
				{/* Icon to expand the log item maybe implement a colapsible later */}
				{/* <Square className="size-4 text-muted-foreground opacity-0 group-hover/logitem:opacity-100 transition-opacity" /> */}
				{tooltip(color, rawTimestamp)}
				{!noTimestamp && (
					<span className="w-full flex-shrink-0 select-none pl-2 text-muted-foreground sm:w-40">
						{formattedTime}
					</span>
				)}

				<Badge
					variant={variant}
					className="w-14 justify-center px-1 py-0 text-[10px]"
				>
					{type}
				</Badge>
			</div>
			<span className="whitespace-pre-wrap break-all font-mono text-foreground dark:text-gray-200">
				{highlightMessage(message, searchTerm || "")}
			</span>
		</div>
	);
}
