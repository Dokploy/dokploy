import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TerminalLine } from "./terminal-line";
import type { LogLine } from "./utils";

const VERTICAL_PADDING = 16;

interface Props {
	logs: LogLine[];
	className?: string;
	noTimestamp?: boolean;
	searchTerm?: string;
	children?: ReactNode;
}

export const VirtualLogList = ({
	logs,
	className,
	noTimestamp,
	searchTerm,
	children,
}: Props) => {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);

	const virtualizer = useVirtualizer({
		count: logs.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 20,
		overscan: 20,
		paddingStart: VERTICAL_PADDING,
		paddingEnd: VERTICAL_PADDING,
		// Without this, align "end" stops short of paddingEnd and the bottom check below fails.
		scrollPaddingEnd: VERTICAL_PADDING,
	});

	const handleScroll = () => {
		if (!scrollRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
		setAutoScroll(isAtBottom);
	};

	useEffect(() => {
		if (autoScroll && logs.length > 0) {
			virtualizer.scrollToIndex(logs.length - 1, { align: "end" });
		}
	}, [logs, autoScroll]);

	return (
		<div
			ref={scrollRef}
			onScroll={handleScroll}
			className={cn(
				"overflow-y-auto border px-4 rounded custom-logs-scrollbar",
				className,
			)}
		>
			{logs.length > 0 ? (
				<div
					className="relative w-full"
					style={{ height: virtualizer.getTotalSize() }}
				>
					{virtualizer.getVirtualItems().map((item) => (
						<div
							key={item.key}
							data-index={item.index}
							ref={virtualizer.measureElement}
							className="absolute left-0 top-0 w-full"
							style={{ transform: `translateY(${item.start}px)` }}
						>
							<TerminalLine
								log={logs[item.index]!}
								noTimestamp={noTimestamp}
								searchTerm={searchTerm}
							/>
						</div>
					))}
				</div>
			) : (
				children
			)}
		</div>
	);
};
