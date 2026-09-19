import {
	ArrowUp,
	Container,
	Download,
	File,
	FileWarning,
	Folder,
	FolderOpen,
	HardDrive,
	Loader2,
	MousePointerClick,
	RefreshCw,
	Upload,
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

const ROOT_PATH = "/";

export type ServiceFilesystemType =
	| "application"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "compose";

interface Props {
	serviceType: ServiceFilesystemType;
	serviceId: string;
}

const formatBytes = (size?: number) => {
	if (typeof size !== "number" || !Number.isFinite(size)) {
		return "Unknown size";
	}

	if (size === 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB", "TB"];
	const unitIndex = Math.min(
		Math.floor(Math.log(size) / Math.log(1024)),
		units.length - 1,
	);
	const unit = units[unitIndex] ?? "B";
	const value = size / 1024 ** unitIndex;

	return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${unit}`;
};

const formatModifiedAt = (value?: string | Date) => {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
};

const getPathSegments = (path: string) => {
	const segments = path.split("/").filter(Boolean);
	let currentPath = "";

	return [
		{ label: "/", path: ROOT_PATH },
		...segments.map((segment) => {
			currentPath += `/${segment}`;
			return { label: segment, path: currentPath };
		}),
	];
};

const getParentPath = (path: string) => {
	if (path === ROOT_PATH) {
		return ROOT_PATH;
	}

	const parent = path.split("/").filter(Boolean).slice(0, -1).join("/");
	return parent ? `/${parent}` : ROOT_PATH;
};

export const ShowContainerFileSystem = ({ serviceType, serviceId }: Props) => {
	const [containerId, setContainerId] = useState<string>();
	const [path, setPath] = useState(ROOT_PATH);
	const [selectedFilePath, setSelectedFilePath] = useState<string>();
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { data: permissions } = api.user.getPermissions.useQuery();

	const containersQuery = api.filesystem.containers.useQuery(
		{ serviceType, serviceId },
		{
			refetchInterval: 15_000,
			retry: 1,
		},
	);
	const containers = containersQuery.data?.containers ?? [];
	const expectedRunningCount = containersQuery.data?.expectedRunningCount;
	const containersRef = useRef(containers);
	containersRef.current = containers;

	useEffect(() => {
		setContainerId((currentContainerId) => {
			if (
				currentContainerId &&
				containers.some(
					(container) => container.containerId === currentContainerId,
				)
			) {
				return currentContainerId;
			}

			return containers[0]?.containerId;
		});
	}, [containers]);

	useEffect(() => {
		const workingDir = containersRef.current.find(
			(container) => container.containerId === containerId,
		)?.workingDir;
		setPath(workingDir || ROOT_PATH);
		setSelectedFilePath(undefined);
	}, [containerId]);

	const directoryQuery = api.filesystem.list.useQuery(
		{
			serviceType,
			serviceId,
			containerId: containerId ?? "",
			path,
		},
		{
			enabled: Boolean(containerId),
			retry: 1,
		},
	);

	const fileQuery = api.filesystem.readFile.useQuery(
		{
			serviceType,
			serviceId,
			containerId: containerId ?? "",
			path: selectedFilePath ?? ROOT_PATH,
		},
		{
			enabled: Boolean(containerId && selectedFilePath),
			retry: 1,
		},
	);

	const entries = directoryQuery.data?.entries ?? [];
	const truncated = directoryQuery.data?.truncated ?? false;
	const sortedEntries = useMemo(
		() =>
			[...entries].sort((first, second) => {
				const typeOrder =
					Number(second.type === "directory") -
					Number(first.type === "directory");
				return typeOrder || first.name.localeCompare(second.name);
			}),
		[entries],
	);
	const selectedEntry = entries.find(
		(entry) => entry.path === selectedFilePath,
	);
	const pathSegments = getPathSegments(path);
	const modifiedAt = formatModifiedAt(selectedEntry?.modifiedAt);
	const downloadHref =
		containerId && selectedFilePath
			? `/api/filesystem/download?${new URLSearchParams({
					serviceType,
					serviceId,
					containerId,
					path: selectedFilePath,
				}).toString()}`
			: undefined;

	const selectContainer = (nextContainerId: string) => {
		setContainerId(nextContainerId);
	};

	const openDirectory = (nextPath: string) => {
		setPath(nextPath);
		setSelectedFilePath(undefined);
	};

	const refresh = async () => {
		await Promise.all([
			containersQuery.refetch(),
			directoryQuery.refetch(),
			fileQuery.refetch(),
		]);
	};

	const isRefreshing =
		containersQuery.isRefetching ||
		directoryQuery.isRefetching ||
		fileQuery.isRefetching;

	const triggerUpload = () => fileInputRef.current?.click();

	const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || !containerId) return;

		setIsUploading(true);
		try {
			const params = new URLSearchParams({
				serviceType,
				serviceId,
				containerId,
				path,
				fileName: file.name,
			});
			const response = await fetch(`/api/filesystem/upload?${params.toString()}`, {
				method: "POST",
				body: file,
			});
			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(data.message || "Failed to upload the file.");
			}

			toast.success(`Uploaded ${file.name}`);
			await directoryQuery.refetch();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to upload the file.",
			);
		} finally {
			setIsUploading(false);
		}
	};

	return (
		<Card className="h-full bg-sidebar p-2.5 rounded-xl">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader>
					<CardTitle className="text-xl flex flex-row gap-2 items-center">
						<HardDrive className="size-6 text-muted-foreground" />
						Files System
					</CardTitle>
					<CardDescription>
						Browse files from a running container for this service. The
						selected container can be replaced by a deployment.
					</CardDescription>
					<AlertBlock type="warning">
						Files outside persistent mounts are usually ephemeral and can
						disappear after a restart or deployment.
					</AlertBlock>
				</CardHeader>
				<CardContent className="space-y-4 py-8 border-t">
					{containersQuery.isError ? (
						<AlertBlock type="error">
							{containersQuery.error.message ||
								"Unable to load running containers for this service."}
						</AlertBlock>
					) : containersQuery.isPending ? (
						<LoadingState label="Loading running containers" />
					) : containers.length === 0 ? (
						<EmptyContainerState expectedRunningCount={expectedRunningCount} />
					) : (
						<>
							{typeof expectedRunningCount === "number" &&
								expectedRunningCount > containers.length && (
									<AlertBlock type="warning">
										Showing {containers.length} of {expectedRunningCount} running
										containers. The rest are replicas on other cluster nodes that
										this Dokploy server has no direct connection to.
									</AlertBlock>
								)}
							<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
								<div className="flex min-w-0 flex-1 flex-col gap-1.5">
									<span className="text-sm font-medium">Running container</span>
									<Select value={containerId} onValueChange={selectContainer}>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select a running container" />
										</SelectTrigger>
										<SelectContent>
											{containers.map((container) => (
												<SelectItem
													key={container.containerId}
													value={container.containerId}
												>
													<span className="flex min-w-0 items-center gap-2">
														<Container className="size-4 shrink-0" />
														<span className="truncate">{container.name}</span>
														<Badge
															variant={
																container.state === "running"
																	? "green"
																	: "secondary"
															}
															className="capitalize"
														>
															{container.state}
														</Badge>
													</span>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<Button
									variant="outline"
									size="icon"
									className="shrink-0 sm:mt-6"
									onClick={() => void refresh()}
									disabled={isRefreshing}
								>
									<RefreshCw
										className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
									/>
									<span className="sr-only">Refresh file system</span>
								</Button>
							</div>

							<div className="grid min-h-[32rem] gap-4 lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.4fr)]">
								<section className="flex min-h-0 flex-col overflow-hidden rounded-lg border">
									<div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-2">
										<Button
											variant="ghost"
											size="icon-xs"
											onClick={() => openDirectory(getParentPath(path))}
											disabled={path === ROOT_PATH || directoryQuery.isPending}
										>
											<ArrowUp className="size-3.5" />
											<span className="sr-only">Go to parent directory</span>
										</Button>
										<div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
											{pathSegments.map((segment, index) => (
												<Button
													key={segment.path}
													variant="ghost"
													size="xs"
													className="font-mono"
													onClick={() => openDirectory(segment.path)}
												>
													{index > 0 && (
														<span className="text-muted-foreground">/</span>
													)}
													{segment.label}
												</Button>
											))}
										</div>
										{permissions?.containerFilesystem.write && (
											<>
												<input
													ref={fileInputRef}
													type="file"
													className="hidden"
													onChange={(event) => void handleFileSelected(event)}
												/>
												<Button
													variant="ghost"
													size="icon-xs"
													className="shrink-0"
													onClick={triggerUpload}
													disabled={isUploading || directoryQuery.isPending}
												>
													{isUploading ? (
														<Loader2 className="size-3.5 animate-spin" />
													) : (
														<Upload className="size-3.5" />
													)}
													<span className="sr-only">
														Upload a file to this directory
													</span>
												</Button>
											</>
										)}
									</div>
									{truncated && (
										<AlertBlock type="warning" className="mx-2 mt-2">
											This directory is too large to browse in full. Showing a
											partial listing — open a subdirectory directly for more.
										</AlertBlock>
									)}
									<DirectoryList
										entries={sortedEntries}
										isLoading={directoryQuery.isPending}
										error={directoryQuery.error?.message}
										selectedFilePath={selectedFilePath}
										onOpenDirectory={openDirectory}
										onSelectFile={setSelectedFilePath}
									/>
								</section>

								<FilePreview
									fileName={selectedEntry?.name}
									filePath={selectedFilePath}
									fileSize={selectedEntry?.size}
									fileMode={selectedEntry?.mode}
									modifiedAt={modifiedAt}
									downloadHref={downloadHref}
									isLoading={fileQuery.isPending}
									error={fileQuery.error?.message}
									file={fileQuery.data}
								/>
							</div>
						</>
					)}
				</CardContent>
			</div>
		</Card>
	);
};

const LoadingState = ({ label }: { label: string }) => (
	<div className="flex h-[32rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
		<Loader2 className="size-8 animate-spin text-muted-foreground" />
		<span className="text-sm text-muted-foreground">{label}...</span>
	</div>
);

const EmptyContainerState = ({
	expectedRunningCount,
}: {
	expectedRunningCount?: number;
}) => (
	<div className="flex h-[32rem] flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-4 text-center">
		<div className="flex size-14 items-center justify-center rounded-full bg-muted">
			<Container className="size-7 text-muted-foreground" />
		</div>
		<div className="flex max-w-md flex-col gap-1">
			<span className="text-base font-medium">
				{expectedRunningCount
					? "No containers reachable from this server"
					: "No running containers found"}
			</span>
			<span className="text-sm text-muted-foreground">
				{expectedRunningCount
					? `${expectedRunningCount} container${expectedRunningCount === 1 ? "" : "s"} appear to be running, but on cluster nodes this Dokploy server has no direct connection to.`
					: "Deploy or start this service, then refresh to browse its file system."}
			</span>
		</div>
	</div>
);

interface DirectoryListProps {
	entries: Array<{
		name: string;
		path: string;
		type: string;
		size?: number;
	}>;
	isLoading: boolean;
	error?: string;
	selectedFilePath?: string;
	onOpenDirectory: (path: string) => void;
	onSelectFile: (path: string) => void;
}

const DirectoryList = ({
	entries,
	isLoading,
	error,
	selectedFilePath,
	onOpenDirectory,
	onSelectFile,
}: DirectoryListProps) => {
	if (isLoading) {
		return <LoadingState label="Loading directory" />;
	}

	if (error) {
		return (
			<div className="p-3">
				<AlertBlock type="error">{error}</AlertBlock>
			</div>
		);
	}

	if (entries.length === 0) {
		return (
			<div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-4 text-center">
				<FolderOpen className="size-8 text-muted-foreground" />
				<div className="flex flex-col gap-1">
					<span className="font-medium">This directory is empty</span>
					<span className="text-sm text-muted-foreground">
						There are no files or folders at this location.
					</span>
				</div>
			</div>
		);
	}

	return (
		<ScrollArea className="h-[28rem] lg:h-full">
			<div className="p-1.5">
				{entries.map((entry) => {
					const isDirectory = entry.type === "directory";
					const isSymlink = entry.type === "symlink";
					const isRegularFile = entry.type === "file";
					const isOpenable = isDirectory || isRegularFile;
					const isSelected = entry.path === selectedFilePath;
					const Icon = isDirectory ? Folder : File;

					return (
						<Button
							key={entry.path}
							variant={isSelected ? "secondary" : "ghost"}
							className="h-auto w-full justify-start gap-2 px-2 py-2 text-left"
							disabled={!isOpenable}
							title={
								isSymlink
									? "Symlinks cannot be opened from the file browser"
									: !isOpenable
										? "Only regular files can be opened from the file browser"
										: undefined
							}
							onClick={() =>
								isDirectory
									? onOpenDirectory(entry.path)
									: onSelectFile(entry.path)
							}
						>
							<Icon
								className={
									isDirectory
										? "size-4 shrink-0 text-amber-500"
										: "size-4 shrink-0 text-muted-foreground"
								}
							/>
							<span className="min-w-0 flex-1 truncate">{entry.name}</span>
							{!isDirectory && (
								<span className="shrink-0 text-xs font-normal text-muted-foreground">
									{formatBytes(entry.size)}
								</span>
							)}
						</Button>
					);
				})}
			</div>
		</ScrollArea>
	);
};

interface FilePreviewProps {
	fileName?: string;
	filePath?: string;
	fileSize?: number;
	fileMode?: string;
	modifiedAt: string | null;
	downloadHref?: string;
	isLoading: boolean;
	error?: string;
	file?: {
		kind: "text" | "binary" | "too_large";
		content?: string;
		size: number;
		encoding?: string;
	};
}

const FilePreview = ({
	fileName,
	filePath,
	fileSize,
	fileMode,
	modifiedAt,
	downloadHref,
	isLoading,
	error,
	file,
}: FilePreviewProps) => {
	if (!filePath) {
		return (
			<section className="flex min-h-[20rem] flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-4 text-center">
				<div className="flex size-14 items-center justify-center rounded-full bg-muted">
					<MousePointerClick className="size-7 text-muted-foreground" />
				</div>
				<div className="flex flex-col gap-1">
					<span className="text-base font-medium">
						Select a file to preview
					</span>
					<span className="text-sm text-muted-foreground">
						Choose a file from the directory list to view its contents.
					</span>
				</div>
			</section>
		);
	}

	return (
		<section className="flex min-h-0 flex-col overflow-hidden rounded-lg border">
			<div className="border-b bg-muted/30 p-3">
				<div className="flex min-w-0 items-center gap-2">
					<File className="size-4 shrink-0 text-muted-foreground" />
					<span
						className="min-w-0 flex-1 truncate font-medium"
						title={filePath}
					>
						{fileName ?? filePath}
					</span>
					{downloadHref && (
						<Button asChild variant="outline" size="xs">
							<a href={downloadHref} download>
								<Download className="size-3.5" />
								Download
							</a>
						</Button>
					)}
				</div>
				<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
					<span>{formatBytes(fileSize ?? file?.size)}</span>
					{fileMode && <span>Mode {fileMode}</span>}
					{modifiedAt && <span>Modified {modifiedAt}</span>}
					{file?.encoding && <span>{file.encoding}</span>}
				</div>
			</div>
			{isLoading ? (
				<LoadingState label="Loading file" />
			) : error ? (
				<div className="p-3">
					<AlertBlock type="error">{error}</AlertBlock>
				</div>
			) : file?.kind === "text" ? (
				<ScrollArea className="h-[28rem] lg:h-full">
					<pre className="min-h-full whitespace-pre p-4 font-mono text-xs leading-5">
						{file.content ?? ""}
					</pre>
				</ScrollArea>
			) : file?.kind === "binary" ? (
				<UnavailablePreview
					title="This is a binary file"
					description="Binary files cannot be previewed in the file browser."
				/>
			) : file?.kind === "too_large" ? (
				<UnavailablePreview
					title="This file is too large to preview"
					description="Use a smaller file or inspect it from the container terminal."
				/>
			) : (
				<UnavailablePreview
					title="File preview is unavailable"
					description="Refresh and try again, or select another file."
				/>
			)}
		</section>
	);
};

const UnavailablePreview = ({
	title,
	description,
}: {
	title: string;
	description: string;
}) => (
	<div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
		<FileWarning className="size-8 text-muted-foreground" />
		<div className="flex max-w-sm flex-col gap-1">
			<span className="font-medium">{title}</span>
			<span className="text-sm text-muted-foreground">{description}</span>
		</div>
	</div>
);
