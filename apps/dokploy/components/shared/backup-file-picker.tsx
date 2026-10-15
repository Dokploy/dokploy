import { CheckIcon, ChevronsUpDown, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import { FormControl } from "@/components/ui/form";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/utils/api";

type Page = RouterOutputs["backup"]["listBackupFilesPage"];

const formatBytes = (bytes: number) => {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

interface Props {
	destinationId: string;
	serverId?: string | null;
	enabled: boolean;
	value: string;
	onChange: (path: string) => void;
}

export const BackupFilePicker = ({
	destinationId,
	serverId,
	enabled,
	value,
	onChange,
}: Props) => {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [refresh, setRefresh] = useState(0);
	const [listing, setListing] = useState<Page & { search: string }>({
		items: [],
		nextCursor: null,
		search: "",
	});
	const [loading, setLoading] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [refreshRequired, setRefreshRequired] = useState(false);
	const request = useRef(0);
	const canFetch = enabled && !!destinationId;

	const changeSearch = (next: string) => {
		request.current++;
		onChange("");
		setSearch(next);
	};

	useEffect(() => {
		const version = ++request.current;
		setListing({ items: [], nextCursor: null, search });
		setError(null);
		setRefreshRequired(false);
		setLoadingMore(false);
		setLoading(canFetch);
		if (!canFetch) return;
		const timer = setTimeout(async () => {
			try {
				const page = await utils.backup.listBackupFilesPage.fetch(
					{ destinationId, serverId: serverId || "", search },
					{ staleTime: 0 },
				);
				if (version === request.current) setListing({ ...page, search });
			} catch (cause) {
				if (version === request.current)
					setError(
						cause instanceof Error
							? cause.message
							: "Unable to load backup files.",
					);
			} finally {
				if (version === request.current) setLoading(false);
			}
		}, 350);
		return () => {
			clearTimeout(timer);
			request.current++;
		};
	}, [destinationId, serverId, search, refresh, canFetch, utils]);

	const loadMore = async () => {
		if (
			!listing.nextCursor ||
			loadingMore ||
			loading ||
			listing.search !== search
		)
			return;
		const version = ++request.current;
		setLoadingMore(true);
		setError(null);
		try {
			const page = await utils.backup.listBackupFilesPage.fetch(
				{
					destinationId,
					serverId: serverId || "",
					search,
					cursor: listing.nextCursor,
				},
				{ staleTime: 0 },
			);
			if (version === request.current) {
				setListing((previous) => ({
					...page,
					search,
					items: [...previous.items, ...page.items],
				}));
			}
		} catch (cause) {
			if (version === request.current) {
				const code = (cause as { data?: { code?: string } })?.data?.code;
				if (
					code === "CONFLICT" ||
					code === "BAD_REQUEST" ||
					code === "UNAUTHORIZED" ||
					code === "FORBIDDEN"
				) {
					setRefreshRequired(true);
					setListing({ items: [], nextCursor: null, search });
					onChange("");
				}
				setError(
					cause instanceof Error
						? cause.message
						: "Unable to load more backup files.",
				);
			}
		} finally {
			if (version === request.current) setLoadingMore(false);
		}
	};

	const restart = () => {
		request.current++;
		onChange("");
		setRefresh((version) => version + 1);
	};
	const pending = loading || listing.search !== search;
	return (
		<Popover modal open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<FormControl>
					<Button
						type="button"
						aria-label="Backup file"
						variant="outline"
						disabled={!canFetch}
						className={cn(
							"w-full justify-between",
							!value && "text-muted-foreground",
						)}
					>
						<span className="truncate text-left flex-1 w-52">
							{value || "Search and select a backup file"}
						</span>
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</FormControl>
			</PopoverTrigger>
			<PopoverContent
				className="w-96 max-w-[calc(100vw-2rem)] p-0"
				align="start"
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search backup files..."
						value={search}
						onValueChange={changeSearch}
						className="h-9"
					/>
					<div className="flex items-center justify-between gap-2 p-2">
						<span className="text-xs text-muted-foreground">
							Newest timestamped backups first
						</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={restart}
							disabled={pending || loadingMore}
						>
							<RefreshCw className="mr-1 size-3" />
							Refresh
						</Button>
					</div>
					{pending ? (
						<p role="status" className="p-4 text-sm">
							Loading backup files...
						</p>
					) : (
						<>
							{error && (
								<p role="alert" className="p-3 text-sm text-destructive">
									{error}
								</p>
							)}
							{listing.items.length > 0 && (
								<ScrollArea className="h-64">
									<CommandGroup>
										{listing.items.map((file) => (
											<CommandItem
												key={file.Path}
												value={file.Path}
												onSelect={() => {
													if (file.IsDir) changeSearch(`${file.Path}/`);
													else {
														onChange(file.Path);
														setOpen(false);
													}
												}}
											>
												<div className="min-w-0 flex-1">
													<div className="break-all font-medium">
														{file.Path}
													</div>
													<div className="text-xs text-muted-foreground">
														{file.IsDir
															? "Directory"
															: `Size: ${formatBytes(file.Size)}`}
														{file.Hashes?.MD5 && (
															<span className="ml-2">
																MD5: {file.Hashes.MD5}
															</span>
														)}
													</div>
												</div>
												<CheckIcon
													className={cn(
														"ml-2 h-4 w-4 shrink-0",
														file.Path === value ? "opacity-100" : "opacity-0",
													)}
												/>
											</CommandItem>
										))}
									</CommandGroup>
								</ScrollArea>
							)}
							{!error && listing.items.length === 0 && (
								<p role="status" className="p-4 text-sm">
									No backup files found.
								</p>
							)}
							{!error && listing.items.length > 0 && !listing.nextCursor && (
								<p
									role="status"
									className="p-2 text-center text-sm text-muted-foreground"
								>
									End of results
								</p>
							)}
							{!refreshRequired && (listing.nextCursor || error) && (
								<Button
									type="button"
									variant="ghost"
									className="w-full"
									disabled={loadingMore}
									onClick={listing.nextCursor ? loadMore : restart}
								>
									{loadingMore
										? "Loading more..."
										: error
											? "Retry"
											: "Load more"}
								</Button>
							)}
						</>
					)}
					<p className="border-t p-2 text-xs text-muted-foreground">
						Other filenames follow in descending name order; modification time
						is unknown.
					</p>
				</Command>
			</PopoverContent>
		</Popover>
	);
};
