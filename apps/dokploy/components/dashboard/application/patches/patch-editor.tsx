import {
	ArrowLeft,
	ChevronRight,
	File,
	Folder,
	Loader2,
	Save,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/utils/api";
import { CreateFileDialog } from "./create-file-dialog";

interface Props {
	id: string;
	type: "application" | "compose";
	repoPath: string;
	onClose: () => void;
}

type DirectoryEntry = {
	name: string;
	path: string;
	type: "file" | "directory";
	children?: DirectoryEntry[];
};

export const PatchEditor = ({ id, type, repoPath, onClose }: Props) => {
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [fileContent, setFileContent] = useState<string>("");
	const [createFolderPath, setCreateFolderPath] = useState<string | null>(null);
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set(),
	);

	const utils = api.useUtils();
	const { data: directories, isLoading: isDirLoading } =
		api.patch.readRepoDirectories.useQuery(
			{ id: id, type, repoPath },
			{ enabled: !!repoPath },
		);

	const { data: patches } = api.patch.byEntityId.useQuery(
		{ id, type },
		{ enabled: !!id },
	);

	const { mutateAsync: saveAsPatch, isLoading: isSavingPatch } =
		api.patch.saveFileAsPatch.useMutation();

	const { mutateAsync: markForDeletion, isLoading: isMarkingDeletion } =
		api.patch.markFileForDeletion.useMutation();

	const updatePatch = api.patch.update.useMutation();

	const { data: fileData, isFetching: isFileLoading } =
		api.patch.readRepoFile.useQuery(
			{
				id,
				type,
				filePath: selectedFile || "",
			},
			{
				enabled: !!selectedFile,
			},
		);

	useEffect(() => {
		if (fileData !== undefined) {
			setFileContent(fileData);
		}
	}, [fileData]);

	const handleFileSelect = (filePath: string) => {
		setSelectedFile(filePath);
	};

	const toggleFolder = (path: string) => {
		setExpandedFolders((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	};

	const handleSave = () => {
		if (!selectedFile) return;
		saveAsPatch({
			id,
			type,
			filePath: selectedFile,
			content: fileContent,
			patchType: "update",
		})
			.then(() => {
				toast.success("Patch saved");
				utils.patch.byEntityId.invalidate({ id, type });
			})
			.catch(() => {
				toast.error("Failed to save patch");
			});
	};

	const handleMarkForDeletion = () => {
		if (!selectedFile) return;
		markForDeletion({ id, type, filePath: selectedFile })
			.then(() => {
				toast.success("File marked for deletion");
				utils.patch.byEntityId.invalidate({ id, type });
			})
			.catch(() => {
				toast.error("Failed to mark file for deletion");
			});
	};

	const handleCreateFile = useCallback(
		(folderPath: string, filename: string, content: string) => {
			const filePath = folderPath ? `${folderPath}/${filename}` : filename;
			saveAsPatch({
				id,
				type,
				filePath,
				content,
				patchType: "create",
			})
				.then(() => {
					toast.success("File created");
					utils.patch.byEntityId.invalidate({ id, type });
				})
				.catch(() => {
					toast.error("Failed to create file");
				});
		},
		[id, type, saveAsPatch, utils],
	);

	const selectedFilePatch = patches?.find(
		(p) => p.filePath === selectedFile && p.type === "delete",
	);

	const handleUnmarkDeletion = () => {
		if (!selectedFilePatch) return;
		updatePatch
			.mutateAsync({
				patchId: selectedFilePatch.patchId,
				type: "update",
				content: fileData || "",
			})
			.then(() => {
				toast.success("Deletion unmarked");
				utils.patch.byEntityId.invalidate({ id, type });
			})
			.catch(() => {
				toast.error("Failed to unmark deletion");
			});
	};

	const hasChanges = fileData !== undefined && fileContent !== fileData;

	const renderTree = useCallback(
		(entries: DirectoryEntry[], depth = 0) => {
			return entries
				.sort((a, b) => {
					// Directories first, then alphabetically
					if (a.type !== b.type) {
						return a.type === "directory" ? -1 : 1;
					}
					return a.name.localeCompare(b.name);
				})
				.map((entry) => {
					const isExpanded = expandedFolders.has(entry.path);
					const isSelected = selectedFile === entry.path;

					if (entry.type === "directory") {
						return (
							<div key={entry.path}>
								<div className="group flex items-center">
									<button
										type="button"
										onClick={() => toggleFolder(entry.path)}
										className={
											"flex-1 flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/50 rounded-md transition-colors text-left min-w-0"
										}
										style={{ paddingLeft: `${depth * 12 + 8}px` }}
									>
										<ChevronRight
											className={`h-4 w-4 shrink-0 transition-transform ${
												isExpanded ? "rotate-90" : ""
											}`}
										/>
										<Folder className="h-4 w-4 shrink-0 text-blue-500" />
										<span className="truncate">{entry.name}</span>
									</button>
									<CreateFileDialog
										folderPath={entry.path}
										onCreate={(filename, content) =>
											handleCreateFile(entry.path, filename, content)
										}
										onOpenChange={(open) =>
											setCreateFolderPath(open ? entry.path : null)
										}
									/>
								</div>
								{isExpanded && entry.children && (
									<div>{renderTree(entry.children, depth + 1)}</div>
								)}
							</div>
						);
					}

					const isMarkedForDeletion = patches?.some(
						(p) => p.filePath === entry.path && p.type === "delete",
					);

					return (
						<button
							type="button"
							key={entry.path}
							onClick={() => handleFileSelect(entry.path)}
							className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/50 rounded-md transition-colors ${
								isSelected ? "bg-muted" : ""
							} ${isMarkedForDeletion ? "text-destructive" : ""}`}
							style={{ paddingLeft: `${depth * 12 + 28}px` }}
						>
							<File className="h-4 w-4 shrink-0 text-muted-foreground" />
							<span className="truncate">{entry.name}</span>
							{isMarkedForDeletion && (
								<Trash2 className="h-3 w-3 shrink-0 text-destructive ml-auto" />
							)}
						</button>
					);
				});
		},
		[expandedFolders, selectedFile, patches, handleCreateFile],
	);

	return (
		<Card className="bg-background overflow-hidden">
			<CardHeader className="flex flex-row items-center justify-between pb-4">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" onClick={onClose}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<CardTitle>Edit File</CardTitle>
						<CardDescription>
							{selectedFile
								? `Editing: ${selectedFile}`
								: "Select a file from the tree to edit"}
						</CardDescription>
					</div>
				</div>
				{selectedFile && (
					<div className="flex items-center gap-2">
						{selectedFilePatch ? (
							<Button
								variant="outline"
								size="sm"
								onClick={handleUnmarkDeletion}
								disabled={updatePatch.isPending}
							>
								{updatePatch.isPending && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								Unmark deletion
							</Button>
						) : (
							<>
								<Button
									variant="outline"
									size="sm"
									onClick={handleMarkForDeletion}
									disabled={isMarkingDeletion}
								>
									{isMarkingDeletion && (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									)}
									<Trash2 className="mr-2 h-4 w-4" />
									Mark for deletion
								</Button>
								<Button
									onClick={handleSave}
									disabled={isSavingPatch || !hasChanges}
								>
									{isSavingPatch && (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									)}
									<Save className="mr-2 h-4 w-4" />
									Save Patch
								</Button>
							</>
						)}
					</div>
				)}
			</CardHeader>
			<CardContent className="p-0">
				<div className="grid grid-cols-[250px_1fr] border-t h-[600px]">
					<div className="border-r h-full overflow-hidden">
						<ScrollArea className="h-full">
							<div className="p-2 space-y-1">
								<div className="group flex items-center gap-2 px-2 py-1.5 mb-1">
									<CreateFileDialog
										folderPath=""
										alwaysVisible
										onCreate={(filename, content) =>
											handleCreateFile("", filename, content)
										}
										onOpenChange={(open) =>
											setCreateFolderPath(open ? "" : null)
										}
									/>
									<span className="text-xs text-muted-foreground">
										New file in root
									</span>
								</div>
								{isDirLoading ? (
									<div className="flex items-center justify-center py-8">
										<Loader2 className="h-6 w-6 animate-spin" />
									</div>
								) : directories ? (
									renderTree(directories)
								) : (
									<div className="text-sm text-muted-foreground p-4">
										No files found
									</div>
								)}
							</div>
						</ScrollArea>
					</div>
					<div className="h-full overflow-hidden relative">
						{isFileLoading ? (
							<div className="flex items-center justify-center h-full">
								<Loader2 className="h-6 w-6 animate-spin" />
							</div>
						) : selectedFile ? (
							<CodeEditor
								value={fileData || ""}
								onChange={(value) => setFileContent(value || "")}
								className="h-full w-full"
								wrapperClassName="h-full"
								lineWrapping
							/>
						) : (
							<div className="flex items-center justify-center h-full text-muted-foreground">
								Select a file to edit
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
};
