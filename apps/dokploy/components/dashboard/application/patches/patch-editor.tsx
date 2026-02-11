import { ArrowLeft, ChevronRight, File, Folder, Loader2, Save } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/utils/api";
import type { RouterOutputs } from "@/utils/api";

interface Props {
	applicationId?: string;
	composeId?: string;
	repoPath: string;
	onClose: () => void;
}

type DirectoryEntry = {
	name: string;
	path: string;
	type: "file" | "directory";
	children?: DirectoryEntry[];
};

export const PatchEditor = ({
	applicationId,
	composeId,
	repoPath,
	onClose,
}: Props) => {
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [fileContent, setFileContent] = useState<string>("");
	const [originalContent, setOriginalContent] = useState<string>("");
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
	const [isSaving, setIsSaving] = useState(false);

	// Fetch directory tree
	const { data: directories, isLoading: isDirLoading } =
		api.patch.readRepoDirectories.useQuery(
			{ applicationId, composeId, repoPath },
			{ enabled: !!repoPath },
		);

	// Save mutation
	const saveAsPatch = api.patch.saveFileAsPatch.useMutation({
		onSuccess: (result) => {
			setIsSaving(false);
			if (result.deleted) {
				toast.success("No changes - patch removed");
			} else {
				toast.success("Patch saved");
			}
			setOriginalContent(fileContent);
		},
		onError: () => {
			setIsSaving(false);
			toast.error("Failed to save patch");
		},
	});

	// Read file content when selected
	const { data: fileData, isFetching: isFileLoading } =
		api.patch.readRepoFile.useQuery(
			{
				applicationId,
				composeId,
				repoPath,
				filePath: selectedFile || "",
			},
			{
				enabled: !!selectedFile,
				onSuccess: (data) => {
					setFileContent(data.content);
					setOriginalContent(data.content);
					if (data.patchError) {
						toast.error(data.patchErrorMessage || "Failed to apply patch");
					}
				},
			},
		);

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
		setIsSaving(true);
		saveAsPatch.mutate({
			applicationId,
			composeId,
			repoPath,
			filePath: selectedFile,
			content: fileContent,
		});
	};

	const hasChanges = fileContent !== originalContent;

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
								<button
									onClick={() => toggleFolder(entry.path)}
									className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/50 rounded-md transition-colors`}
									style={{ paddingLeft: `${depth * 12 + 8}px` }}
								>
									<ChevronRight
										className={`h-4 w-4 transition-transform ${
											isExpanded ? "rotate-90" : ""
										}`}
									/>
									<Folder className="h-4 w-4 text-blue-500" />
									<span className="truncate">{entry.name}</span>
								</button>
								{isExpanded && entry.children && (
									<div>{renderTree(entry.children, depth + 1)}</div>
								)}
							</div>
						);
					}

					return (
						<button
							key={entry.path}
							onClick={() => handleFileSelect(entry.path)}
							className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/50 rounded-md transition-colors ${
								isSelected ? "bg-muted" : ""
							}`}
							style={{ paddingLeft: `${depth * 12 + 28}px` }}
						>
							<File className="h-4 w-4 text-muted-foreground" />
							<span className="truncate">{entry.name}</span>
						</button>
					);
				});
		},
		[expandedFolders, selectedFile],
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
					<Button onClick={handleSave} disabled={isSaving || !hasChanges}>
						{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						<Save className="mr-2 h-4 w-4" />
						Save Patch
					</Button>
				)}
			</CardHeader>
			<CardContent className="p-0">
				<div className="grid grid-cols-[250px_1fr] border-t h-[600px]">
					{/* File Tree */}
					<div className="border-r h-full overflow-hidden">
						<ScrollArea className="h-full">
							<div className="p-2">
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
					{/* Editor */}
					<div className="h-full overflow-hidden relative">
						{isFileLoading ? (
							<div className="flex items-center justify-center h-full">
								<Loader2 className="h-6 w-6 animate-spin" />
							</div>
						) : selectedFile ? (
							<CodeEditor
								value={fileContent}
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
