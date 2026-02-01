import {
	Archive,
	ArrowUp,
	Download,
	FileIcon,
	Folder,
	FolderPlus,
	Pencil,
	RefreshCcw,
	Search,
	ShieldAlert,
	Trash2,
	Upload,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { CodeEditor } from "@/components/shared/code-editor";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
type FileManagerScope = "mounts" | "container";
type ExtractConflictPolicy = "fail" | "skip" | "overwrite";

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

const isArchiveFile = (name: string) => {
	const lower = name.toLowerCase();
	return (
		lower.endsWith(".zip") ||
		lower.endsWith(".tar") ||
		lower.endsWith(".tar.gz") ||
		lower.endsWith(".tgz") ||
		lower.endsWith(".tar.bz2") ||
		lower.endsWith(".tbz") ||
		lower.endsWith(".tbz2") ||
		lower.endsWith(".tar.xz") ||
		lower.endsWith(".txz")
	);
};

const stripArchiveExtension = (name: string) => {
	const lower = name.toLowerCase();
	if (lower.endsWith(".tar.gz")) return name.slice(0, -7);
	if (lower.endsWith(".tgz")) return name.slice(0, -4);
	if (lower.endsWith(".tar.bz2")) return name.slice(0, -8);
	if (lower.endsWith(".tbz2")) return name.slice(0, -5);
	if (lower.endsWith(".tbz")) return name.slice(0, -4);
	if (lower.endsWith(".tar.xz")) return name.slice(0, -7);
	if (lower.endsWith(".txz")) return name.slice(0, -4);
	if (lower.endsWith(".tar")) return name.slice(0, -4);
	if (lower.endsWith(".zip")) return name.slice(0, -4);
	return name;
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
	const [scope, setScope] = useState<FileManagerScope>("mounts");
	const [currentPath, setCurrentPath] = useState("");
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [searchValue, setSearchValue] = useState("");
	const [includeHidden, setIncludeHidden] = useState(true);
	const [editorContent, setEditorContent] = useState("");
	const [originalContent, setOriginalContent] = useState("");
	const [overwriteUpload, setOverwriteUpload] = useState(false);
	const [containerWriteEnabled, setContainerWriteEnabled] = useState(false);
	const [writeConfirmOpen, setWriteConfirmOpen] = useState(false);
	const [writeConfirmValue, setWriteConfirmValue] = useState("");
	const [composeServiceName, setComposeServiceName] = useState<string>("");
	const [extractOpen, setExtractOpen] = useState(false);
	const [extractTarget, setExtractTarget] = useState<{
		path: string;
		name: string;
	} | null>(null);
	const [extractDestination, setExtractDestination] = useState("");
	const [extractConflict, setExtractConflict] =
		useState<ExtractConflictPolicy>("fail");
	const trimmedSearchValue = searchValue.trim();
	const hasSearch = trimmedSearchValue.length > 0;
	const isComposeService = serviceType === "compose";
	const isContainerSupported = true;
	const isContainerMode = scope === "container";
	const containerServiceName = isComposeService ? composeServiceName : undefined;
	const containerModeReady =
		isContainerMode && isContainerSupported && (!isComposeService || !!composeServiceName);
	const mountTarget = { serviceId, serviceType };
	const containerTarget = {
		serviceId,
		serviceType,
		serviceName: containerServiceName,
	};
	const activeTarget = isContainerMode ? containerTarget : mountTarget;

	useEffect(() => {
		if (!isContainerSupported && isContainerMode) {
			setScope("mounts");
		}
	}, [isContainerSupported, isContainerMode]);

	useEffect(() => {
		setCurrentPath("");
		setSelectedPath(null);
		setSearchValue("");
		setEditorContent("");
		setOriginalContent("");
	}, [scope]);

	useEffect(() => {
		if (!isContainerMode) {
			setContainerWriteEnabled(false);
			setWriteConfirmOpen(false);
			setWriteConfirmValue("");
		}
	}, [isContainerMode]);

	useEffect(() => {
		if (isContainerMode) {
			setContainerWriteEnabled(false);
		}
	}, [containerServiceName, isContainerMode]);

	useEffect(() => {
		if (!isComposeService) {
			setComposeServiceName("");
		}
	}, [isComposeService, serviceId]);

	const composeServicesQuery = api.compose.loadServices.useQuery(
		{
			composeId: serviceId,
			type: "cache",
		},
		{
			enabled: isContainerMode && isComposeService,
		},
	);

	useEffect(() => {
		if (
			isComposeService &&
			isContainerMode &&
			composeServicesQuery.data &&
			composeServicesQuery.data.length > 0 &&
			!composeServiceName
		) {
			setComposeServiceName(composeServicesQuery.data[0] || "");
		}
	}, [
		isComposeService,
		isContainerMode,
		composeServicesQuery.data,
		composeServiceName,
	]);

	const mountListQuery = api.fileManager.list.useQuery(
		{
			serviceId,
			serviceType,
			path: currentPath || undefined,
			includeHidden,
		},
		{
			enabled: !hasSearch && !isContainerMode,
		},
	);

	const containerListQuery = api.containerFileManager.list.useQuery(
		{
			serviceId,
			serviceType,
			serviceName: containerServiceName,
			path: currentPath || undefined,
			includeHidden,
		},
		{
			enabled: !hasSearch && containerModeReady,
		},
	);

	const mountSearchQuery = api.fileManager.search.useQuery(
		{
			serviceId,
			serviceType,
			query: trimmedSearchValue,
			path: currentPath || undefined,
			includeHidden,
		},
		{
			enabled: hasSearch && !isContainerMode,
		},
	);

	const containerSearchQuery = api.containerFileManager.search.useQuery(
		{
			serviceId,
			serviceType,
			serviceName: containerServiceName,
			query: trimmedSearchValue,
			path: currentPath || undefined,
			includeHidden,
		},
		{
			enabled: hasSearch && containerModeReady,
		},
	);

	const listQuery = isContainerMode ? containerListQuery : mountListQuery;
	const searchQuery = isContainerMode ? containerSearchQuery : mountSearchQuery;

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

	const mountReadQuery = api.fileManager.read.useQuery(
		{
			serviceId,
			serviceType,
			path: selectedPath || "",
			encoding: "utf8",
		},
		{
			enabled: !!selectedPath && selectedEntry?.type === "file" && !isContainerMode,
		},
	);

	const containerReadQuery = api.containerFileManager.read.useQuery(
		{
			serviceId,
			serviceType,
			serviceName: containerServiceName,
			path: selectedPath || "",
			encoding: "utf8",
		},
		{
			enabled:
				!!selectedPath &&
				selectedEntry?.type === "file" &&
				containerModeReady,
		},
	);

	const readQuery = isContainerMode ? containerReadQuery : mountReadQuery;

	const containerStatusQuery = api.containerFileManager.status.useQuery(
		{
			serviceId,
			serviceType,
			serviceName: containerServiceName,
		},
		{
			enabled: containerModeReady,
		},
	);
	const snapshotMutation = api.containerFileManager.snapshot.useMutation();

	const mountWriteMutation = api.fileManager.write.useMutation();
	const containerWriteMutation = api.containerFileManager.write.useMutation();
	const writeMutation = isContainerMode
		? containerWriteMutation
		: mountWriteMutation;
	const mountMkdirMutation = api.fileManager.mkdir.useMutation();
	const containerMkdirMutation = api.containerFileManager.mkdir.useMutation();
	const mkdirMutation = isContainerMode
		? containerMkdirMutation
		: mountMkdirMutation;
	const mountDeleteMutation = api.fileManager.delete.useMutation();
	const containerDeleteMutation = api.containerFileManager.delete.useMutation();
	const deleteMutation = isContainerMode
		? containerDeleteMutation
		: mountDeleteMutation;
	const mountMoveMutation = api.fileManager.move.useMutation();
	const containerMoveMutation = api.containerFileManager.move.useMutation();
	const moveMutation = isContainerMode
		? containerMoveMutation
		: mountMoveMutation;
	const extractMutation = api.fileManager.extract.useMutation();

	useEffect(() => {
		if (readQuery.data && selectedEntry?.type === "file") {
			setEditorContent(readQuery.data.content ?? "");
			setOriginalContent(readQuery.data.content ?? "");
		}
	}, [readQuery.data, selectedEntry?.type]);

	const isDirty = editorContent !== originalContent;
	const writesDisabled = isContainerMode && !containerWriteEnabled;
	const scopeDescription = isContainerMode
		? "Browse and edit the live filesystem inside the running container. Changes can be lost on redeploy or reschedule."
		: description;
	const writeConfirmPhrase = useMemo(() => {
		const name =
			containerStatusQuery.data?.containerName ||
			(containerServiceName ? `service:${containerServiceName}` : "container");
		return `EDITAR ${name.toUpperCase()}`;
	}, [containerStatusQuery.data?.containerName, containerServiceName]);

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
		if (writesDisabled) {
			toast.error("Enable write operations to upload files.");
			return;
		}
		if (!files || files.length === 0) return;
		for (const file of Array.from(files)) {
			if (file.size > MAX_UPLOAD_BYTES) {
				toast.error(`"${file.name}" exceeds 2 MB upload limit.`);
				continue;
			}
			try {
				const base64 = await readFileAsBase64(file);
				await writeMutation.mutateAsync({
					...activeTarget,
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
			const data = isContainerMode
				? await utils.containerFileManager.read.fetch({
						serviceId,
						serviceType,
						serviceName: containerServiceName,
						path: pathValue,
						encoding: "base64",
					})
				: await utils.fileManager.read.fetch({
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

	const handleSnapshot = async () => {
		try {
			if (!containerModeReady) {
				toast.error("Container is not ready. Select a service first.");
				return;
			}
			const data = await snapshotMutation.mutateAsync({
				...containerTarget,
				path: currentPath || undefined,
			});
			const base64 = data?.content || "";
			const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			const blob = new Blob([bytes], { type: "application/gzip" });
			const fileName = data?.fileName || "snapshot.tar.gz";
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = fileName;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			toast.success("Snapshot exported");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Snapshot failed",
			);
		}
	};

	const handleExtract = async () => {
		if (!extractTarget) return;
		if (writesDisabled) {
			toast.error("Enable write operations to extract archives.");
			return;
		}
		if (isContainerMode) {
			toast.error("Archive extraction is only available for mounted files.");
			return;
		}
		try {
			const destination = extractDestination.trim();
			const result = await extractMutation.mutateAsync({
				serviceId,
				serviceType,
				path: extractTarget.path,
				destinationPath: destination.length > 0 ? destination : undefined,
				onConflict: extractConflict,
			});
			const skippedInfo =
				result.skippedEntries > 0
					? ` (${result.skippedEntries} skipped)`
					: "";
			toast.success(
				`Extracted ${result.extractedEntries} items to /${result.destinationPath}${skippedInfo}`,
			);
			setExtractOpen(false);
			setExtractTarget(null);
			setExtractDestination("");
			await refresh();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Extraction failed",
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
				<CardDescription>{scopeDescription}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<Dialog
					open={extractOpen}
					onOpenChange={(open) => {
						setExtractOpen(open);
						if (!open) {
							setExtractTarget(null);
							setExtractDestination("");
							setExtractConflict("fail");
						}
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Extract archive</DialogTitle>
						</DialogHeader>
						<div className="space-y-3 text-sm text-muted-foreground">
							<div className="space-y-1">
								<Label>Archive</Label>
								<p className="text-xs text-foreground break-all">
									{extractTarget?.name || "Select an archive"}
								</p>
							</div>
							<div className="space-y-1">
								<Label htmlFor="extract-destination">Destination path</Label>
								<Input
									id="extract-destination"
									placeholder="folder-name"
									value={extractDestination}
									onChange={(event) =>
										setExtractDestination(event.target.value)
									}
								/>
								<p className="text-xs">
									Relative to the mounted files root. Leave blank to use the
									default archive name.
								</p>
							</div>
							<div className="space-y-1">
								<Label>On conflict</Label>
								<Select
									value={extractConflict}
									onValueChange={(value) =>
										setExtractConflict(value as ExtractConflictPolicy)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select policy" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="fail">Fail if exists</SelectItem>
										<SelectItem value="skip">Skip existing</SelectItem>
										<SelectItem value="overwrite">Overwrite existing</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="secondary"
								onClick={() => setExtractOpen(false)}
							>
								Cancel
							</Button>
							<Button
								type="button"
								onClick={handleExtract}
								disabled={!extractTarget || extractMutation.isLoading}
							>
								Extract
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
				<div className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center gap-3">
						<Label className="text-sm text-muted-foreground">Scope</Label>
						<Tabs
							value={scope}
							onValueChange={(value) => setScope(value as FileManagerScope)}
							className="w-fit"
						>
							<TabsList>
								<TabsTrigger value="mounts">Mounted files</TabsTrigger>
								<TabsTrigger value="container" disabled={!isContainerSupported}>
									Container filesystem
								</TabsTrigger>
							</TabsList>
						</Tabs>
						{isContainerMode && isComposeService && (
							<div className="flex flex-wrap items-center gap-2">
								<Label className="text-xs text-muted-foreground">
									Compose service
								</Label>
								<Select
									value={composeServiceName}
									onValueChange={(value) => setComposeServiceName(value)}
								>
									<SelectTrigger className="w-52">
										<SelectValue placeholder="Select a service" />
									</SelectTrigger>
									<SelectContent>
										{composeServicesQuery.data?.map((service) => (
											<SelectItem key={service} value={service}>
												{service}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{composeServicesQuery.isLoading && (
									<span className="text-xs text-muted-foreground">
										Loading services...
									</span>
								)}
								{composeServicesQuery.error && (
									<span className="text-xs text-red-500">
										{composeServicesQuery.error.message}
									</span>
								)}
							</div>
						)}
					</div>
					{isContainerMode ? (
						<AlertBlock type="warning">
							You are viewing the live container filesystem. Changes may be lost on
							redeploy, scale, crash recovery, or node rescheduling.
						</AlertBlock>
					) : (
						<AlertBlock type="warning">
							Editing files here updates the service files directory. Apply changes
							by redeploying your service if file mounts are used.
						</AlertBlock>
					)}
				</div>
				{activeError && (
					<AlertBlock type="error">
						{activeError?.message || "Unable to load files."}
					</AlertBlock>
				)}
				{isContainerMode && (
					<Card className="border-dashed">
						<CardHeader className="space-y-1">
							<CardTitle className="text-base flex items-center gap-2">
								<ShieldAlert className="size-4 text-muted-foreground" />
								Container Filesystem Control Panel
								<Badge variant="blue">Runtime FS v1</Badge>
							</CardTitle>
							<CardDescription>
								Advanced access to the running container. Use for emergency fixes
								and diagnostics only.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex flex-wrap items-center gap-2 text-xs">
								<Badge variant="outline">
									Container:{" "}
									{containerStatusQuery.data?.containerName || "unknown"}
								</Badge>
								<Badge variant="secondary">
									Image:{" "}
									{containerStatusQuery.data?.containerImage || "unknown"}
								</Badge>
								<Badge variant="secondary">
									State: {containerStatusQuery.data?.containerState || "unknown"}
								</Badge>
								<Badge variant="secondary">
									Status: {containerStatusQuery.data?.containerStatus || "unknown"}
								</Badge>
								{containerWriteEnabled && (
									<Badge variant="destructive">Write enabled</Badge>
								)}
							</div>
							{containerStatusQuery.isLoading && (
								<span className="text-xs text-muted-foreground">
									Loading container details...
								</span>
							)}
							{containerStatusQuery.error && (
								<AlertBlock type="error">
									{containerStatusQuery.error.message}
								</AlertBlock>
							)}
							{isComposeService && !composeServiceName && (
								<AlertBlock type="warning">
									Select a compose service to access its container filesystem.
								</AlertBlock>
							)}
							<AlertBlock type="warning">
								Edits here change the container’s writable layer only. They do NOT
								update your git repo or build source. Redeploying will erase these
								changes.
							</AlertBlock>
							<div className="flex flex-wrap items-center gap-3">
								<DialogAction
									title="Export container snapshot"
									description={`Create a compressed archive of ${
										currentPath ? `/${currentPath}` : "/"
									}. Snapshots are limited to 8 MB.`}
									type="default"
									onClick={handleSnapshot}
								>
									<Button variant="outline" disabled={!containerModeReady}>
										Export snapshot
									</Button>
								</DialogAction>
								<span className="text-xs text-muted-foreground">
									Exports the current path as <code>.tar.gz</code> for audit or
									rollback reference.
								</span>
							</div>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="flex items-center gap-2">
									<Switch
										id="enable-container-writes"
										checked={containerWriteEnabled}
										disabled={!containerModeReady}
										onCheckedChange={(checked) => {
											if (!checked) {
												setContainerWriteEnabled(false);
												return;
											}
											setWriteConfirmOpen(true);
										}}
									/>
									<Label htmlFor="enable-container-writes">
										Enable write operations (dangerous)
									</Label>
								</div>
								{writesDisabled && (
									<span className="text-xs text-muted-foreground">
										Write actions are disabled until you explicitly enable them.
									</span>
								)}
							</div>
							<Dialog
								open={writeConfirmOpen}
								onOpenChange={(open) => {
									setWriteConfirmOpen(open);
									if (!open) {
										setWriteConfirmValue("");
									}
								}}
							>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Confirm container write access</DialogTitle>
									</DialogHeader>
									<div className="space-y-3 text-sm text-muted-foreground">
										<p>
											This enables direct writes to the running container. These
											changes are ephemeral and will be lost on redeploy or
											reschedule.
										</p>
										<p className="text-foreground">
											Type <strong>{writeConfirmPhrase}</strong> to continue.
										</p>
										<Input
											value={writeConfirmValue}
											onChange={(event) =>
												setWriteConfirmValue(event.target.value)
											}
											placeholder={writeConfirmPhrase}
										/>
									</div>
									<DialogFooter>
										<Button
											type="button"
											variant="secondary"
											onClick={() => setWriteConfirmOpen(false)}
										>
											Cancel
										</Button>
										<Button
											type="button"
											disabled={
												writeConfirmValue.trim().toUpperCase() !==
												writeConfirmPhrase
											}
											onClick={() => {
												setContainerWriteEnabled(true);
												setWriteConfirmOpen(false);
												setWriteConfirmValue("");
												toast.success("Container writes enabled for this session.");
											}}
										>
											Enable writes
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
							<Accordion type="single" collapsible className="w-full">
								<AccordionItem value="how-it-works">
									<AccordionTrigger>How it works</AccordionTrigger>
									<AccordionContent>
										<ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
											<li>
												This browser talks to the server, which uses{" "}
												<code className="text-xs">docker exec</code> to read and
												write files inside the running container.
											</li>
											<li>
												Changes persist only for the current container. Any
												redeploy or reschedule will replace the container and
												remove these edits.
											</li>
											<li>
												If your service has multiple replicas, edits are applied
												to a single running task only.
											</li>
										</ul>
									</AccordionContent>
								</AccordionItem>
								<AccordionItem value="recommended-workflow">
									<AccordionTrigger>Recommended workflow</AccordionTrigger>
									<AccordionContent>
										<ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
											<li>
												Use container edits only for short-lived hotfixes or
												emergency inspection.
											</li>
											<li>
												For persistent config, move files into mounts/volumes
												and redeploy.
											</li>
											<li>
												If you edit code, copy the change back to your repo and
												redeploy so the build is reproducible.
											</li>
										</ul>
									</AccordionContent>
								</AccordionItem>
								<AccordionItem value="prerequisites">
									<AccordionTrigger>Container prerequisites</AccordionTrigger>
									<AccordionContent>
										<ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
											<li>
												The container must have{" "}
												<code className="text-xs">/bin/sh</code> and{" "}
												<code className="text-xs">base64</code> available.
											</li>
											<li>
												For full metadata (size/mtime),{" "}
												<code className="text-xs">stat</code> should be present.
											</li>
											<li>
												If a command is missing, install{" "}
												<code className="text-xs">busybox</code> or{" "}
												<code className="text-xs">coreutils</code> in the image.
											</li>
										</ul>
									</AccordionContent>
								</AccordionItem>
								<AccordionItem value="safety">
									<AccordionTrigger>Safety checklist</AccordionTrigger>
									<AccordionContent>
										<ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
											<li>
												Avoid editing system paths like{" "}
												<code className="text-xs">/usr</code>,{" "}
												<code className="text-xs">/bin</code>, or{" "}
												<code className="text-xs">/lib</code>.
											</li>
											<li>
												Never store secrets here. Use environment variables or
												secret mounts instead.
											</li>
											<li>
												After finishing, disable write operations to reduce
												risk.
											</li>
										</ul>
									</AccordionContent>
								</AccordionItem>
							</Accordion>
						</CardContent>
					</Card>
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
									<Button variant="outline" disabled={writesDisabled}>
										<FileIcon className="size-4 mr-2" />
										New File
									</Button>
								}
								disabled={writesDisabled}
								onSubmit={async (name) => {
									if (writesDisabled) return;
									await writeMutation
										.mutateAsync({
											...activeTarget,
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
									<Button variant="outline" disabled={writesDisabled}>
										<FolderPlus className="size-4 mr-2" />
										New Folder
									</Button>
								}
								disabled={writesDisabled}
								onSubmit={async (name) => {
									if (writesDisabled) return;
									await mkdirMutation
										.mutateAsync({
											...activeTarget,
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
							<label
								className={cn("cursor-pointer", writesDisabled && "opacity-60")}
								onClick={(event) => {
									if (writesDisabled) {
										event.preventDefault();
									}
								}}
							>
								<Button variant="outline" asChild disabled={writesDisabled}>
									<span>
										<Upload className="size-4 mr-2" />
										Upload
									</span>
								</Button>
								<input
									type="file"
									className="hidden"
									multiple
									disabled={writesDisabled}
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
															{entry.type === "file" &&
																!isContainerMode &&
																isArchiveFile(entry.name) && (
																	<Button
																		variant="ghost"
																		size="icon"
																		disabled={writesDisabled}
																		onClick={(event) => {
																			event.stopPropagation();
																			if (writesDisabled) return;
																			const baseName =
																				stripArchiveExtension(entry.name) ||
																				"archive";
																			setExtractTarget({
																				path: entry.path,
																				name: entry.name,
																			});
																			setExtractDestination(
																				joinPath(currentPath, baseName),
																			);
																			setExtractConflict("fail");
																			setExtractOpen(true);
																		}}
																	>
																		<Archive className="size-4" />
																	</Button>
																)}
															<NameDialog
																title="Rename item"
																defaultValue={entry.name}
																trigger={
																	<Button
																		variant="ghost"
																		size="icon"
																		disabled={writesDisabled}
																		onClick={(event) => event.stopPropagation()}
																	>
																		<Pencil className="size-4" />
																	</Button>
																}
																disabled={writesDisabled}
																onSubmit={async (name) => {
																	if (writesDisabled) return;
																	const parent = entry.path.split("/").slice(0, -1);
																	const target = joinPath(...parent, name);
																	await moveMutation
																		.mutateAsync({
																			...activeTarget,
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
																	if (writesDisabled) return;
																	await deleteMutation
																		.mutateAsync({
																			...activeTarget,
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
																	disabled={writesDisabled}
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
												if (writesDisabled) return;
												await writeMutation
													.mutateAsync({
														...activeTarget,
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
											disabled={writesDisabled || !isDirty || writeMutation.isLoading}
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
