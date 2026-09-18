import { DatabaseBackup, Download, FolderOpen, Loader2 } from "lucide-react";
import { useState } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { formatBytes } from "./restore-backup";

interface Props {
	backupId: string;
}

export const ShowBackupFiles = ({ backupId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [startingDownload, setStartingDownload] = useState<string | null>(null);

	const {
		data: files,
		isLoading,
		isError,
		error,
	} = api.backup.listBackupFilesByBackupId.useQuery(
		{ backupId },
		{ enabled: isOpen },
	);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<DialogTrigger asChild>
							<Button variant="ghost" size="icon" className="size-8">
								<FolderOpen className="size-4" />
							</Button>
						</DialogTrigger>
					</TooltipTrigger>
					<TooltipContent>Backup Files</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Backup Files</DialogTitle>
					<DialogDescription>
						Files stored in the destination for this backup.
					</DialogDescription>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error.message}</AlertBlock>}

				{isLoading && (
					<div className="flex items-center justify-center py-16">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				)}

				{!isLoading && !isError && files?.length === 0 && (
					<div className="flex flex-col items-center justify-center gap-3 py-16">
						<DatabaseBackup className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No backup files found yet
						</span>
					</div>
				)}

				{!isError && !!files?.length && (
					<ScrollArea className="max-h-[60vh]">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>File</TableHead>
									<TableHead>Date</TableHead>
									<TableHead>Size</TableHead>
									<TableHead className="w-16" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{files.map((file) => (
									<TableRow key={file.Name}>
										<TableCell className="font-medium break-all">
											{file.Name}
										</TableCell>
										<TableCell className="whitespace-nowrap text-sm text-muted-foreground">
											{file.ModTime
												? new Date(file.ModTime).toLocaleString()
												: "—"}
										</TableCell>
										<TableCell className="whitespace-nowrap text-sm text-muted-foreground">
											{formatBytes(file.Size)}
										</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="icon"
												className="size-8"
												asChild
											>
												{/* NextTopLoader starts on any anchor click and only stops on a route change */}
												<a
													href={`/api/backups/download?backupId=${encodeURIComponent(backupId)}&file=${encodeURIComponent(file.Name)}`}
													download
													onClick={(e) => {
														e.stopPropagation();
														setStartingDownload(file.Name);
														// the browser owns the transfer, so this only acknowledges the click
														setTimeout(
															() =>
																setStartingDownload((current) =>
																	current === file.Name ? null : current,
																),
															2500,
														);
													}}
												>
													{startingDownload === file.Name ? (
														<Loader2 className="size-4 animate-spin" />
													) : (
														<Download className="size-4" />
													)}
												</a>
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</ScrollArea>
				)}
			</DialogContent>
		</Dialog>
	);
};
