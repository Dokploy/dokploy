import { Loader2 } from "lucide-react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import type { LogLine } from "../dashboard/docker/logs/utils";
import { VirtualLogList } from "../dashboard/docker/logs/virtual-log-list";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	filteredLogs: LogLine[];
}

export const DrawerLogs = ({ isOpen, onClose, filteredLogs }: Props) => {
	return (
		<Sheet
			open={!!isOpen}
			onOpenChange={() => {
				onClose();
			}}
		>
			<SheetContent className="z-[60] w-full sm:max-w-[740px]! flex flex-col">
				<SheetHeader>
					<SheetTitle>Deployment Logs</SheetTitle>
					<SheetDescription>Details of the request log entry.</SheetDescription>
				</SheetHeader>
				<VirtualLogList
					logs={filteredLogs}
					noTimestamp
					className="h-[720px] bg-[#fafafa] dark:bg-[#050506]"
				>
					<div className="flex justify-center items-center h-full text-muted-foreground">
						<Loader2 className="h-6 w-6 animate-spin" />
					</div>
				</VirtualLogList>
			</SheetContent>
		</Sheet>
	);
};
