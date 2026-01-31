import {
	ArrowUp,
	Download,
	FileIcon,
	Folder,
	FolderPlus,
	Pencil,
	RefreshCcw,
	Search,
	Trash2,
	Upload,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

type ServiceType =
	| "application"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "compose";

interface Props {
	serviceId: string;
	serviceType: ServiceType;
	title?: string;
	description?: string;
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const formatBytes = (bytes: number) => {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const order = Math.floor(Math.log(bytes) / Math.log(1024));
	const value = bytes / 1024 ** order;
	return `${value.toFixed(value >= 10 || order === 0 ? 0 : 1)} ${units[order]}`;
};

const joinPath = (...parts: string[]) =>
	parts
		.filter((part) => part && part.length > 0)
		.join("/")
		.replace(/\\/g, "/");

const pathToBreadcrumbs = (pathValue: string) =>
	pathValue
		.replace(/^\/+/, "")
		.split("/")
		.filter(Boolean);

const readFileAsBase64 = (file: File) =>
	new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result === "string") {
				const base64 = result.split(",")[1] || "";
				resolve(base64);
			} else {
				reject(new Error("Invalid file data"));
			}
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});

const NameDialog = ({
	trigger,
	title,
	placeholder,
	defaultValue,
	onSubmit,
	disabled,
}: {
	trigger: React.ReactNode;
	title: string;
	placeholder?: string;
	defaultValue?: string;
	onSubmit: (value: string) => Promise<void>;
	disabled?: boolean;
}) => {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState(defaultValue ?? "");

	useEffect(() => {
		if (open) {
			setValue(defaultValue ?? "");
		}
	}, [open, defaultValue]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="file-manager-name">Name</Label>
					<Input
						id="file-manager-name"
						placeholder={placeholder}
						value={value}
						onChange={(event) => setValue(event.target.value)}
					/>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="secondary"
						onClick={() => setOpen(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={!value.trim() || disabled}
						onClick={async () => {
							await onSubmit(value.trim());
							setOpen(false);
						}}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export const ShowServiceFileManager = ({
	serviceId,
	serviceType,
	title = "File Manager",
	description = "Manage files available to this service. Only the files directory is exposed to containers via file mounts.",
}: Props) => {
	const utils = api.useUtils();
	const [currentPath, setCurrentPath] = useState("");
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [searchValue, setSearchValue] = useState("");
	const [includeHidden, setIncludeHidden] = useState(true);
	const [editorContent, setEditorContent] = useState("");
	const [originalContent, setOriginalContent] = useState("");
	const [overwriteUpload, setOverwriteUpload] = useState(false);
	const trimmedSearchValue = searchValue.trim();
	const hasSearch = trimmedSearchValue.length > 0;

	const listQuery = api.fileManager.list.useQuery(
		{
			serviceId,
			serviceType,
			path: currentPath || undefined,
			includeHidden,
		},
		{
			enabled: !hasSearch,
		},
	);

	const searchQuery = api.fileManager.search.useQuery(
		{
			serviceId,
			serviceType,
			query: trimmedSearchValue,
			path: currentPath || undefined,
			includeHidden,
		},
		{
			enabled: hasSearch,
		},
	);

	const entries = hasSearch ? searchQuery.data || [] : listQuery.data || [];
	const selectedEntry = useMemo(
		() => entries.find((entry) => entry.path === selectedPath) || null,
		[entries, selectedPath],
	);
	const editorLanguage = useMemo(() => {
		const ext = selectedEntry?.extension?.toLowerCase();
		if (!ext) return "properties";
		if (["yml", "yaml"].includes(ext)) return "yaml";
		if (["json"].includes(ext)) return "json";
		if (["sh", "bash", "zsh"].includes(ext)) return "shell";
		return "properties";
	}, [selectedEntry?.extension]);

	const readQuery = api.fileManager.read.useQuery(
		{
			serviceId,
			serviceType,
			path: selectedPath || "",
			encoding: "utf8",
		},
		{
			enabled: !!selectedPath && selectedEntry?.type === "file",
		},
	);

	const writeMutation = api.fileManager.write.useMutation();
	const mkdirMutation = api.fileManager.mkdir.useMutation();
	const deleteMutation = api.fileManager.delete.useMutation();
	const moveMutation = api.fileManager.move.useMutation();

	useEffect(() => {
		if (readQuery.data && selectedEntry?.type === "file") {
			setEditorContent(readQuery.data.content ?? "");
			setOriginalContent(readQuery.data.content ?? "");
		}
	}, [readQuery.data, selectedEntry?.type]);

	const isDirty = editorContent !== originalContent;

	const breadcrumbs = pathToBreadcrumbs(currentPath);

	const goToPath = (pathValue: string) => {
		setCurrentPath(pathValue);
		setSelectedPath(null);
	};

	const refresh = async () => {
		if (hasSearch) {
			await searchQuery.refetch();
		} else {
			await listQuery.refetch();
		}
	};
	const isLoading = hasSearch ? searchQuery.isLoading : listQuery.isLoading;
	const activeError = hasSearch ? searchQuery.error : listQuery.error;

	const handleUpload = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		for (const file of Array.from(files)) {
			if (file.size > MAX_UPLOAD_BYTES) {
				toast.error(`"${file.name}" exceeds 2 MB upload limit.`);
				continue;
			}
			try {
				const base64 = await readFileAsBase64(file);
				await writeMutation.mutateAsync({
					serviceId,
					serviceType,
					path: joinPath(currentPath, file.name),
					content: base64,
					encoding: "base64",
					overwrite: overwriteUpload,
				});
				toast.success(`Uploaded ${file.name}`);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Upload failed",
				);
			}
		}
		await refresh();
	};

	const handleDownload = async (pathValue: string, name: string) => {
		try {
			const data = await utils.fileManager.read.fetch({
				serviceId,
				serviceType,
				path: pathValue,
				encoding: "base64",
			});
			const base64 = data?.content || "";
			const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			const blob = new Blob([bytes]);
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = name;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Download failed",
			);
		}
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-col gap-2">
				<CardTitle className="text-xl flex items-center gap-2">
					<FileIcon className="size-5 text-muted-foreground" />
					{title}
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<AlertBlock type="warning">
					Editing files here updates the service files directory. Apply changes by
					redeploying your service if file mounts are used.
				</AlertBlock>
				{activeError && (
					<AlertBlock type="error">
						{activeError?.message || "Unable to load files."}
					</AlertBlock>
				)}
				<div className="flex flex-col gap-4">
					<div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								onClick={() => {
									if (!currentPath) return;
									const parent = breadcrumbs.slice(0, -1).join("/");
									goToPath(parent);
								}}
								disabled={!currentPath}
							>
								<ArrowUp className="size-4 mr-2" />
								Up
							</Button>
							<Button
								variant="outline"
								onClick={() => {
									setSearchValue("");
									setCurrentPath("");
								}}
							>
								Root
							</Button>
							<Button variant="ghost" onClick={refresh}>
								<RefreshCcw className="size-4 mr-2" />
								Refresh
							</Button>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<div className="flex items-center gap-2">
								<Label htmlFor="include-hidden">Show hidden</Label>
								<Switch
									id="include-hidden"
									checked={includeHidden}
									onCheckedChange={(checked) => setIncludeHidden(checked)}
								/>
							</div>
							<div className="flex items-center gap-2">
								<Label htmlFor="overwrite-upload">Overwrite</Label>
								<Switch
									id="overwrite-upload"
									checked={overwriteUpload}
									onCheckedChange={(checked) => setOverwriteUpload(checked)}
								/>
							</div>
							<div className="relative">
								<Search className="size-4 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
								<Input
									className="pl-8 w-56"
									placeholder="Search files"
									value={searchValue}
									onChange={(event) => setSearchValue(event.target.value)}
								/>
							</div>
							<NameDialog
								title="Create file"
								placeholder="example.txt"
								trigger={
									<Button variant="outline">
										<FileIcon className="size-4 mr-2" />
										New File
									</Button>
								}
								onSubmit={async (name) => {
									await writeMutation
										.mutateAsync({
											serviceId,
											serviceType,
											path: joinPath(currentPath, name),
											content: "",
											encoding: "utf8",
											overwrite: false,
										})
										.then(() => {
											toast.success("File created");
											refresh();
										})
										.catch((error) => {
											toast.error(
												error instanceof Error ? error.message : "Error",
											);
										});
								}}
							/>
							<NameDialog
								title="Create folder"
								placeholder="new-folder"
								trigger={
									<Button variant="outline">
										<FolderPlus className="size-4 mr-2" />
										New Folder
									</Button>
								}
								onSubmit={async (name) => {
									await mkdirMutation
										.mutateAsync({
											serviceId,
											serviceType,
											path: joinPath(currentPath, name),
										})
										.then(() => {
											toast.success("Folder created");
											refresh();
										})
										.catch((error) => {
											toast.error(
												error instanceof Error ? error.message : "Error",
											);
										});
								}}
							/>
							<label className="cursor-pointer">
								<Button variant="outline" asChild>
									<span>
										<Upload className="size-4 mr-2" />
										Upload
									</span>
								</Button>
								<input
									type="file"
									className="hidden"
									multiple
									onChange={(event) => {
										handleUpload(event.target.files);
										event.currentTarget.value = "";
									}}
								/>
							</label>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<span className="font-medium text-foreground">Path:</span>
						<button
							type="button"
							onClick={() => goToPath("")}
							className="hover:text-foreground"
						>
							/
						</button>
						{breadcrumbs.map((crumb, index) => {
							const pathValue = breadcrumbs.slice(0, index + 1).join("/");
							return (
								<button
									key={pathValue}
									type="button"
									onClick={() => goToPath(pathValue)}
									className="hover:text-foreground"
								>
									/{crumb}
								</button>
							);
						})}
					</div>

					<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-6">
						<div className="border rounded-lg">
							<ScrollArea className="max-h-[520px]">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead className="text-right">Size</TableHead>
											<TableHead className="text-right">Modified</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{isLoading ? (
											<TableRow>
												<TableCell colSpan={4} className="text-center">
													Loading...
												</TableCell>
											</TableRow>
										) : entries.length === 0 ? (
											<TableRow>
												<TableCell colSpan={4} className="text-center">
													No files found
												</TableCell>
											</TableRow>
										) : (
											entries.map((entry) => (
												<TableRow
													key={entry.path}
													className={cn(
														"cursor-pointer",
														selectedPath === entry.path && "bg-muted/40",
													)}
													onClick={() => {
														if (entry.type === "directory") {
															goToPath(entry.path);
														} else {
															setSelectedPath(entry.path);
														}
													}}
												>
													<TableCell className="flex items-center gap-2">
														{entry.type === "directory" ? (
															<Folder className="size-4 text-muted-foreground" />
														) : (
															<FileIcon className="size-4 text-muted-foreground" />
														)}
														<span className="truncate">{entry.name}</span>
													</TableCell>
													<TableCell className="text-right">
														{entry.type === "file" ? formatBytes(entry.size) : "—"}
													</TableCell>
													<TableCell className="text-right text-xs text-muted-foreground">
														{new Date(entry.modifiedAt).toLocaleString()}
													</TableCell>
													<TableCell className="text-right">
														<div className="flex justify-end gap-1">
															{entry.type === "file" && (
																<Button
																	variant="ghost"
																	size="icon"
																	onClick={(event) => {
																		event.stopPropagation();
																		handleDownload(entry.path, entry.name);
																	}}
																>
																<Download className="size-4" />
																</Button>
															)}
															<NameDialog
																title="Rename item"
																defaultValue={entry.name}
																trigger={
																	<Button
																		variant="ghost"
																		size="icon"
																		onClick={(event) => event.stopPropagation()}
																	>
																		<Pencil className="size-4" />
																	</Button>
																}
																onSubmit={async (name) => {
																	const parent = entry.path.split("/").slice(0, -1);
																	const target = joinPath(...parent, name);
																	await moveMutation
																		.mutateAsync({
																			serviceId,
																			serviceType,
																			from: entry.path,
																			to: target,
																		})
																		.then(() => {
																			toast.success("Item renamed");
																			if (selectedPath === entry.path) {
																				setSelectedPath(target);
																			}
																			refresh();
																		})
																		.catch((error) => {
																			toast.error(
																				error instanceof Error
																					? error.message
																					: "Error",
																			);
																		});
																}}
															/>
															<DialogAction
																title="Delete item"
																description={`Delete ${entry.name}?`}
																type="destructive"
																onClick={async () => {
																	await deleteMutation
																		.mutateAsync({
																			serviceId,
																			serviceType,
																			path: entry.path,
																			recursive: true,
																		})
																		.then(() => {
																			toast.success("Item deleted");
																			if (selectedPath === entry.path) {
																				setSelectedPath(null);
																			}
																			refresh();
																		})
																		.catch((error) => {
																			toast.error(
																				error instanceof Error
																					? error.message
																					: "Error",
																			);
																		});
																}}
															>
																<Button
																	variant="ghost"
																	size="icon"
																	className="text-red-500"
																	onClick={(event) => event.stopPropagation()}
																>
																	<Trash2 className="size-4" />
																</Button>
															</DialogAction>
														</div>
													</TableCell>
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</ScrollArea>
						</div>

						<div className="border rounded-lg p-4 space-y-4">
							{!selectedEntry || selectedEntry.type !== "file" ? (
								<div className="flex flex-col items-center justify-center h-full min-h-[320px] text-muted-foreground text-sm">
									Select a file to view or edit its contents.
								</div>
							) : readQuery.isLoading ? (
								<div className="flex flex-col items-center justify-center h-full min-h-[320px] text-muted-foreground text-sm">
									Loading file...
								</div>
							) : readQuery.data?.isBinary ? (
								<div className="flex flex-col gap-2 text-sm text-muted-foreground">
									<AlertBlock type="warning">
										This file appears to be binary. Download it to view.
									</AlertBlock>
									<Button
										variant="outline"
										onClick={() =>
											handleDownload(selectedEntry.path, selectedEntry.name)
										}
									>
										<Download className="size-4 mr-2" />
										Download
									</Button>
								</div>
							) : (
								<div className="space-y-3">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<p className="text-sm font-medium">{selectedEntry.name}</p>
											<p className="text-xs text-muted-foreground break-all">
												{selectedEntry.path}
											</p>
										</div>
										<Button
											onClick={async () => {
												await writeMutation
													.mutateAsync({
														serviceId,
														serviceType,
														path: selectedEntry.path,
														content: editorContent,
														encoding: "utf8",
														overwrite: true,
													})
													.then(() => {
														setOriginalContent(editorContent);
														toast.success("File saved");
														refresh();
													})
													.catch((error) => {
														toast.error(
															error instanceof Error
																? error.message
																: "Error",
														);
													});
											}}
											disabled={!isDirty || writeMutation.isLoading}
										>
											Save Changes
										</Button>
									</div>

									<CodeEditor
										language={editorLanguage}
										lineWrapping
										wrapperClassName="h-[320px] border rounded-md"
										value={editorContent}
										onChange={(value) => setEditorContent(value)}
									/>
								</div>
							)}
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};
