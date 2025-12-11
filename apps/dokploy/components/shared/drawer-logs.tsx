import { Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useRef, useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { TerminalLine } from "../dashboard/docker/logs/terminal-line";
import type { LogLine } from "../dashboard/docker/logs/utils";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	filteredLogs: LogLine[];
}

export const DrawerLogs = ({ isOpen, onClose, filteredLogs }: Props) => {
	const { t } = useTranslation("common");
	const scrollRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);
	const scrollToBottom = () => {
		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	};

	const handleScroll = () => {
		if (!scrollRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
		setAutoScroll(isAtBottom);
	};

	useEffect(() => {
		scrollToBottom();

		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [filteredLogs, autoScroll]);
	return (
		<Sheet
			open={!!isOpen}
			onOpenChange={() => {
				onClose();
			}}
		>
			<SheetContent className="sm:max-w-[740px] flex flex-col">
				<SheetHeader>
					<SheetTitle>{t("logs.modal.title")}</SheetTitle>
					<SheetDescription>
						{t("logs.modal.description", {
							containerId: t("logs.defaultAppName"),
						})}
					</SheetDescription>
				</SheetHeader>
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="h-[720px] overflow-y-auto space-y-0 border p-4 bg-[#fafafa] dark:bg-[#050506] rounded custom-logs-scrollbar"
				>
					{" "}
					{filteredLogs.length > 0 ? (
						filteredLogs.map((log: LogLine, index: number) => (
							<TerminalLine key={index} log={log} noTimestamp />
						))
					) : (
						<div className="flex justify-center items-center h-full text-muted-foreground">
							<Loader2 className="h-6 w-6 animate-spin" />
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
};
