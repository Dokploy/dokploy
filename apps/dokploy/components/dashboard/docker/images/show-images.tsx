"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type PaginationState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowUpDown, Eye, Layers, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { DialogAction } from "@/components/shared/dialog-action";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type ImageBase =
	inferRouterOutputs<AppRouter>["dockerImage"]["getImages"][number];
type ImageRow = ImageBase & { key: string };

interface Props {
	serverId?: string;
}

const SIZE_UNITS: Record<string, number> = {
	b: 1,
	kb: 1e3,
	mb: 1e6,
	gb: 1e9,
	tb: 1e12,
};

const parseSize = (size?: string) => {
	if (!size) return -1;
	const match = /^([\d.]+)\s*([a-zA-Z]+)$/.exec(size.trim());
	if (!match?.[1] || !match[2]) return -1;
	return Number(match[1]) * (SIZE_UNITS[match[2].toLowerCase()] ?? 1);
};

const getReference = (image: ImageBase) =>
	image.Repository !== "<none>" && image.Tag !== "<none>"
		? `${image.Repository}:${image.Tag}`
		: image.ID;

const FORCE_HINT_REGEX =
	/must be forced|image is being used|referenced in multiple repositories/i;

const SortableHeader = ({
	column,
	title,
}: {
	column: {
		getIsSorted: () => false | "asc" | "desc";
		toggleSorting: (asc: boolean) => void;
	};
	title: string;
}) => (
	<Button
		variant="ghost"
		className="-ml-3 h-8"
		onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
	>
		{title}
		<ArrowUpDown className="ml-2 size-4" />
	</Button>
);

const ShowImageConfig = ({
	imageRef,
	serverId,
}: {
	imageRef: string;
	serverId?: string;
}) => {
	const [open, setOpen] = useState(false);
	const { t } = useTranslation();
	const { data, isLoading, error } = api.dockerImage.getImageConfig.useQuery(
		{ imageRef, serverId },
		{ enabled: open },
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t("docker.images.viewConfig")}
				>
					<Eye className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="w-full md:w-[70vw] min-w-[70vw]">
				<DialogHeader>
					<DialogTitle>{t("docker.images.configTitle")}</DialogTitle>
					<DialogDescription>
						{t("docker.images.configDescription", { imageRef })}
					</DialogDescription>
				</DialogHeader>
				{error ? (
					<AlertBlock type="error">{error.message}</AlertBlock>
				) : isLoading ? (
					<div className="flex flex-row gap-2 items-center justify-center py-10 text-sm text-muted-foreground">
						<span>{t("docker.common.loading")}</span>
						<Loader2 className="animate-spin size-4" />
					</div>
				) : (
					<div className="text-wrap rounded-lg border p-4 overflow-y-auto text-sm bg-card max-h-[80vh]">
						<code>
							<pre className="whitespace-pre-wrap wrap-break-word">
								<CodeEditor
									language="json"
									lineWrapping
									lineNumbers={false}
									readOnly
									value={JSON.stringify(data, null, 2)}
								/>
							</pre>
						</code>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};

export const ShowImages = ({ serverId }: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "Repository", desc: false },
	]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [forcePrompt, setForcePrompt] = useState<{
		image: ImageRow;
		message: string;
	} | null>(null);

	const { data: images, isLoading } = api.dockerImage.getImages.useQuery({
		serverId,
	});
	const { mutateAsync: removeImage } =
		api.dockerImage.removeImage.useMutation();

	const rows = useMemo<ImageRow[]>(
		() =>
			(images ?? []).map((image) => ({
				...image,
				key: `${image.ID}-${image.Repository}-${image.Tag}`,
			})),
		[images],
	);

	const filteredData = useMemo(() => {
		if (!globalFilter.trim()) {
			return rows;
		}
		const query = globalFilter.toLowerCase();
		return rows.filter(
			(image) =>
				image.Repository.toLowerCase().includes(query) ||
				image.Tag.toLowerCase().includes(query) ||
				image.ID.toLowerCase().includes(query),
		);
	}, [rows, globalFilter]);

	const handleDelete = async (image: ImageRow, force = false) => {
		try {
			await removeImage({
				repository: image.Repository,
				tag: image.Tag,
				id: image.ID,
				force,
				serverId,
			});
			toast.success(t("docker.images.deleted"));
			setForcePrompt(null);
			await utils.dockerImage.getImages.invalidate();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			if (!force && FORCE_HINT_REGEX.test(message)) {
				setForcePrompt({ image, message });
			} else {
				toast.error(t("docker.images.deleteError"), {
					description: message,
				});
			}
		}
	};

	const columns = useMemo<ColumnDef<ImageRow>[]>(
		() => [
			{
				accessorKey: "Repository",
				header: ({ column }) => (
					<SortableHeader
						column={column}
						title={t("docker.images.repository")}
					/>
				),
				cell: ({ row }) => (
					<div
						className="max-w-[280px] truncate font-medium"
						title={row.original.Repository}
					>
						{row.original.Repository}
					</div>
				),
			},
			{
				accessorKey: "Tag",
				header: ({ column }) => (
					<SortableHeader column={column} title={t("docker.images.tag")} />
				),
				cell: ({ row }) => <Badge variant="outline">{row.original.Tag}</Badge>,
			},
			{
				accessorKey: "ID",
				header: ({ column }) => (
					<SortableHeader column={column} title={t("docker.images.imageId")} />
				),
				cell: ({ row }) => (
					<span className="font-mono text-xs text-muted-foreground">
						{row.original.ID}
					</span>
				),
			},
			{
				id: "Size",
				accessorFn: (image) => parseSize(image.Size),
				header: ({ column }) => (
					<SortableHeader column={column} title={t("docker.images.size")} />
				),
				cell: ({ row }) => (
					<span className="text-muted-foreground">{row.original.Size}</span>
				),
			},
			{
				id: "Created",
				accessorFn: (image) => new Date(image.CreatedAt).getTime() || 0,
				header: ({ column }) => (
					<SortableHeader column={column} title={t("docker.images.created")} />
				),
				cell: ({ row }) => (
					<span className="text-muted-foreground whitespace-nowrap">
						{row.original.CreatedSince}
					</span>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				header: () => (
					<div className="text-right">{t("docker.common.actions")}</div>
				),
				cell: ({ row }) => (
					<div className="flex items-center justify-end gap-3">
						<ShowImageConfig
							imageRef={getReference(row.original)}
							serverId={serverId}
						/>
						<DialogAction
							title={t("docker.images.deleteTitle")}
							description={t("docker.images.deleteDescription", {
								name: getReference(row.original),
							})}
							onClick={() => handleDelete(row.original)}
						>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={t("docker.images.deleteTitle")}
							>
								<Trash2 className="size-4 text-destructive" />
							</Button>
						</DialogAction>
					</div>
				),
			},
		],
		[serverId, t],
	);

	const table = useReactTable({
		data: filteredData,
		columns,
		getRowId: (row) => row.key,
		state: {
			sorting,
			pagination,
		},
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Layers className="size-6 text-muted-foreground self-center" />
							{t("docker.images.title")}
						</CardTitle>
						<CardDescription>{t("docker.images.description")}</CardDescription>
					</CardHeader>

					<CardContent className="space-y-4 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[45vh]">
								<span>{t("docker.common.loading")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : !images?.length ? (
							<div className="flex min-h-[45vh] w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
								<div className="rounded-full bg-muted p-4">
									<Layers className="size-10 text-muted-foreground" />
								</div>
								<div className="space-y-1 text-center">
									<p className="text-sm font-medium">
										{t("docker.images.noImages")}
									</p>
									<p className="max-w-sm text-sm text-muted-foreground">
										{t("docker.images.noImagesHint")}
									</p>
								</div>
							</div>
						) : (
							<>
								<div className="flex flex-wrap items-center gap-2">
									<Input
										placeholder={t("docker.images.searchPlaceholder")}
										value={globalFilter}
										onChange={(e) => setGlobalFilter(e.target.value)}
										className="max-w-xs"
									/>
								</div>
								<div className="rounded-md border overflow-x-auto">
									<Table>
										<TableHeader>
											{table.getHeaderGroups().map((headerGroup) => (
												<TableRow key={headerGroup.id}>
													{headerGroup.headers.map((header) => (
														<TableHead key={header.id}>
															{header.isPlaceholder
																? null
																: flexRender(
																		header.column.columnDef.header,
																		header.getContext(),
																	)}
														</TableHead>
													))}
												</TableRow>
											))}
										</TableHeader>
										<TableBody>
											{table.getRowModel().rows?.length ? (
												table.getRowModel().rows.map((row) => (
													<TableRow key={row.id}>
														{row.getVisibleCells().map((cell) => (
															<TableCell key={cell.id}>
																{flexRender(
																	cell.column.columnDef.cell,
																	cell.getContext(),
																)}
															</TableCell>
														))}
													</TableRow>
												))
											) : (
												<TableRow>
													<TableCell
														colSpan={columns.length}
														className="h-24 text-center text-muted-foreground"
													>
														{t("docker.images.noMatch")}
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
								{table.getPageCount() > 1 && (
									<div className="flex items-center justify-end gap-4">
										<span className="text-sm text-muted-foreground">
											{t("docker.common.pageOf", {
												current: table.getState().pagination.pageIndex + 1,
												total: table.getPageCount(),
											})}
										</span>
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => table.previousPage()}
												disabled={!table.getCanPreviousPage()}
											>
												{t("docker.common.previous")}
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => table.nextPage()}
												disabled={!table.getCanNextPage()}
											>
												{t("docker.common.next")}
											</Button>
										</div>
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
			<AlertDialog
				open={!!forcePrompt}
				onOpenChange={(open) => !open && setForcePrompt(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("docker.images.inUseTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{forcePrompt?.message} {t("docker.images.inUseDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setForcePrompt(null)}>
							{t("docker.common.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() =>
								forcePrompt && handleDelete(forcePrompt.image, true)
							}
						>
							{t("docker.images.forceDelete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
};
