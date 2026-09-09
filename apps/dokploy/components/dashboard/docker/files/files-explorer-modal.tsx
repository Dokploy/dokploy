import {
	ChevronRight,
	Download,
	File,
	Folder,
	FolderOpen,
	Loader2,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";

type Props = {
	serverId?: string;
	children?: React.ReactNode;
	asDropdownItem?: boolean;
} & (
	| { containerId: string; volumeName?: undefined }
	| { volumeName: string; containerId?: undefined }
);

const joinPath = (base: string, name: string) =>
	base === "/" ? `/${name}` : `${base}/${name}`;

const decodeBase64 = (base64: string) => {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
};

export const FilesExplorerModal = ({
	containerId,
	volumeName,
	serverId,
	children,
	asDropdownItem = true,
}: Props) => {
	const [open, setOpen] = useState(false);
	const [path, setPath] = useState("/");
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [editorContent, setEditorContent] = useState("");

	const isVolume = !!volumeName;
	const utils = api.useUtils();

	const containerEntries = api.docker.listContainerFiles.useQuery(
		{ containerId: containerId ?? "", path, serverId },
		{ enabled: open && !isVolume, retry: false },
	);
	const volumeEntries = api.dockerVolume.listVolumeFiles.useQuery(
		{ volumeName: volumeName ?? "", path, serverId },
		{ enabled: open && isVolume, retry: false },
	);
	const {
		data: entries,
		isLoading: isLoadingEntries,
		error: entriesError,
		refetch: refetchEntries,
		isRefetching,
	} = isVolume ? volumeEntries : containerEntries;

	const containerFile = api.docker.readContainerFile.useQuery(
		{ containerId: containerId ?? "", path: selectedFile ?? "/", serverId },
		{ enabled: open && !isVolume && !!selectedFile, retry: false },
	);
	const volumeFile = api.dockerVolume.readVolumeFile.useQuery(
		{ volumeName: volumeName ?? "", path: selectedFile ?? "/", serverId },
		{ enabled: open && isVolume && !!selectedFile, retry: false },
	);
	const {
		data: file,
		isLoading: isLoadingFile,
		error: fileError,
		refetch: refetchFile,
	} = isVolume ? volumeFile : containerFile;

	const fileBytes = useMemo(
		() => (file ? decodeBase64(file.content) : null),
		[file],
	);
	const isBinary = useMemo(
		() => !!fileBytes?.some((byte) => byte === 0),
		[fileBytes],
	);

	useEffect(() => {
		if (fileBytes && !isBinary) {
			setEditorContent(new TextDecoder().decode(fileBytes));
		}
	}, [fileBytes, isBinary]);

	const writeContainerFile = api.docker.writeContainerFile.useMutation();
	const writeVolumeFile = api.dockerVolume.writeVolumeFile.useMutation();
	const deleteContainerFile = api.docker.deleteContainerFile.useMutation();
	const deleteVolumeFile = api.dockerVolume.deleteVolumeFile.useMutation();

	const isSaving = writeContainerFile.isPending || writeVolumeFile.isPending;
	const isDeleting =
		deleteContainerFile.isPending || deleteVolumeFile.isPending;

	const saveFile = async () => {
		if (!selectedFile) return;
		try {
			if (isVolume) {
				await writeVolumeFile.mutateAsync({
					volumeName,
					path: selectedFile,
					content: editorContent,
					serverId,
				});
			} else {
				await writeContainerFile.mutateAsync({
					containerId: containerId ?? "",
					path: selectedFile,
					content: editorContent,
					serverId,
				});
			}
			toast.success("File saved");
			refetchFile();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save file",
			);
		}
	};

	const deleteEntry = async (entryPath: string) => {
		try {
			if (isVolume) {
				await deleteVolumeFile.mutateAsync({
					volumeName,
					path: entryPath,
					serverId,
				});
				await utils.dockerVolume.listVolumeFiles.invalidate();
			} else {
				await deleteContainerFile.mutateAsync({
					containerId: containerId ?? "",
					path: entryPath,
					serverId,
				});
				await utils.docker.listContainerFiles.invalidate();
			}
			toast.success("Deleted");
			if (selectedFile === entryPath) {
				setSelectedFile(null);
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to delete");
		}
	};

	const breadcrumbs = path.split("/").filter(Boolean);

	const navigate = (nextPath: string) => {
		setPath(nextPath);
		setSelectedFile(null);
	};

	const handleOpenChange = (value: boolean) => {
		setOpen(value);
		if (!value) {
			setPath("/");
			setSelectedFile(null);
			setEditorContent("");
		}
	};

	const downloadFile = () => {
		if (!fileBytes || !selectedFile) return;
		const blob = new Blob([fileBytes]);
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = selectedFile.split("/").pop() ?? "file";
		anchor.click();
		URL.revokeObjectURL(url);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				{asDropdownItem ? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						{children}
					</DropdownMenuItem>
				) : (
					children
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<FolderOpen className="size-5" />
						{isVolume ? "Volume Files" : "Container Files"}
					</DialogTitle>
					<DialogDescription>
						{isVolume
							? `Browse and edit files inside the "${volumeName}" volume`
							: "Browse and edit files inside the container's filesystem"}
					</DialogDescription>
				</DialogHeader>

				<div className="flex items-center gap-1 text-sm font-mono flex-wrap">
					<button
						type="button"
						className="hover:underline text-muted-foreground"
						onClick={() => navigate("/")}
					>
						/
					</button>
					{breadcrumbs.map((segment, index) => (
						<span
							key={`/${breadcrumbs.slice(0, index + 1).join("/")}`}
							className="flex items-center gap-1"
						>
							<button
								type="button"
								className="hover:underline text-muted-foreground"
								onClick={() =>
									navigate(`/${breadcrumbs.slice(0, index + 1).join("/")}`)
								}
							>
								{segment}
							</button>
							{index < breadcrumbs.length - 1 && (
								<ChevronRight className="size-3 text-muted-foreground" />
							)}
						</span>
					))}
					<Button
						variant="ghost"
						size="icon"
						className="ml-auto size-7"
						onClick={() => refetchEntries()}
					>
						<RefreshCw
							className={`size-4 ${isRefetching ? "animate-spin" : ""}`}
						/>
					</Button>
				</div>

				<div className="flex gap-4 min-h-[55vh] max-h-[65vh]">
					<div className="w-72 shrink-0 border rounded-lg overflow-y-auto">
						{isLoadingEntries ? (
							<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground p-4">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : entriesError ? (
							<div className="p-3">
								<AlertBlock type="error">{entriesError.message}</AlertBlock>
							</div>
						) : (
							<div className="flex flex-col p-1">
								{path !== "/" && (
									<button
										type="button"
										className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted text-left"
										onClick={() =>
											navigate(`/${breadcrumbs.slice(0, -1).join("/")}` || "/")
										}
									>
										<Folder className="size-4 shrink-0 text-muted-foreground" />
										..
									</button>
								)}
								{entries?.length === 0 && (
									<span className="px-2 py-1.5 text-sm text-muted-foreground">
										Empty directory
									</span>
								)}
								{entries?.map((entry) => {
									const entryPath = joinPath(path, entry.name);
									return (
										<div
											key={entry.name}
											className={`group flex items-center rounded-md hover:bg-muted ${
												selectedFile === entryPath ? "bg-muted" : ""
											}`}
										>
											<button
												type="button"
												className="flex flex-1 items-center gap-2 px-2 py-1.5 text-sm text-left min-w-0"
												onClick={() =>
													entry.isDirectory
														? navigate(entryPath)
														: setSelectedFile(entryPath)
												}
											>
												{entry.isDirectory ? (
													<Folder className="size-4 shrink-0 text-muted-foreground" />
												) : (
													<File className="size-4 shrink-0 text-muted-foreground" />
												)}
												<span className="truncate">{entry.name}</span>
											</button>
											<DialogAction
												title={`Delete ${entry.name}?`}
												description={`This will permanently delete ${entryPath}${entry.isDirectory ? " and all its contents" : ""}.`}
												onClick={() => deleteEntry(entryPath)}
											>
												<Button
													variant="ghost"
													size="icon"
													className="size-7 opacity-0 group-hover:opacity-100 shrink-0"
													isLoading={isDeleting}
												>
													<Trash2 className="size-3.5 text-destructive" />
												</Button>
											</DialogAction>
										</div>
									);
								})}
							</div>
						)}
					</div>

					<div className="flex-1 min-w-0 flex flex-col gap-2">
						{!selectedFile ? (
							<div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
								Select a file to view or edit it
							</div>
						) : isLoadingFile ? (
							<div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground rounded-lg border">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : fileError ? (
							<AlertBlock type="error">{fileError.message}</AlertBlock>
						) : (
							<>
								<div className="flex items-center gap-2">
									<span className="text-sm font-mono truncate text-muted-foreground">
										{selectedFile}
									</span>
									<div className="ml-auto flex items-center gap-2">
										<Button variant="outline" size="sm" onClick={downloadFile}>
											<Download className="size-4" />
											Download
										</Button>
										<Button
											size="sm"
											isLoading={isSaving}
											disabled={isBinary || file?.truncated}
											onClick={saveFile}
										>
											Save
										</Button>
									</div>
								</div>
								{file?.truncated ? (
									<AlertBlock type="warning">
										This file is larger than 512KB. Showing a truncated preview;
										editing is disabled. Use Download to get the truncated
										content or the terminal for full access.
									</AlertBlock>
								) : isBinary ? (
									<div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
										Binary file — use Download instead
									</div>
								) : (
									<div className="flex-1 overflow-auto rounded-lg border">
										<CodeEditor
											lineWrapping
											value={editorContent}
											onChange={(value) => setEditorContent(value)}
											wrapperClassName="h-full font-mono"
										/>
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
