import {
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import {
	CheckCircle2,
	ChevronDown,
	ExternalLink,
	GlobeIcon,
	InfoIcon,
	LayoutGrid,
	LayoutList,
	Loader2,
	PenBoxIcon,
	RefreshCw,
	Server,
	Trash2,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
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
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { api } from "@/utils/api";
import { createColumns, type Domain } from "./columns";
import { DnsHelperModal } from "./dns-helper-modal";
import { AddDomain } from "./handle-domain";

export type ValidationState = {
	isLoading: boolean;
	isValid?: boolean;
	error?: string;
	resolvedIp?: string;
	message?: string;
	cdnProvider?: string;
};

export type ValidationStates = Record<string, ValidationState>;

interface Props {
	id: string;
	type: "application" | "compose";
}

export const ShowDomains = ({ id, type }: Props) => {
	const { data: application } =
		type === "application"
			? api.application.one.useQuery(
					{
						applicationId: id,
					},
					{
						enabled: !!id,
					},
				)
			: api.compose.one.useQuery(
					{
						composeId: id,
					},
					{
						enabled: !!id,
					},
				);
	const [validationStates, setValidationStates] = useState<ValidationStates>(
		{},
	);
	const [isGridView, setIsGridView] = useLocalStorage("domain-view-mode", true);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
	const { data: ip } = api.settings.getIp.useQuery();

	const {
		data,
		refetch,
		isLoading: isLoadingDomains,
	} = type === "application"
		? api.domain.byApplicationId.useQuery(
				{
					applicationId: id,
				},
				{
					enabled: !!id,
				},
			)
		: api.domain.byComposeId.useQuery(
				{
					composeId: id,
				},
				{
					enabled: !!id,
				},
			);

	const { mutateAsync: validateDomain } =
		api.domain.validateDomain.useMutation();
	const { mutateAsync: deleteDomain, isLoading: isRemoving } =
		api.domain.delete.useMutation();

	const handleValidateDomain = async (host: string) => {
		setValidationStates((prev) => ({
			...prev,
			[host]: { isLoading: true },
		}));

		try {
			const result = await validateDomain({
				domain: host,
				serverIp:
					application?.server?.ipAddress?.toString() || ip?.toString() || "",
			});

			setValidationStates((prev) => ({
				...prev,
				[host]: {
					isLoading: false,
					isValid: result.isValid,
					error: result.error,
					resolvedIp: result.resolvedIp,
					cdnProvider: result.cdnProvider,
					message: result.error && result.isValid ? result.error : undefined,
				},
			}));
		} catch (err) {
			const error = err as Error;
			setValidationStates((prev) => ({
				...prev,
				[host]: {
					isLoading: false,
					isValid: false,
					error: error.message || "Failed to validate domain",
				},
			}));
		}
	};

	const handleDeleteDomain = async (domainId: string) => {
		await deleteDomain({ domainId })
			.then(() => {
				refetch();
				toast.success("Domain deleted successfully");
			})
			.catch(() => {
				toast.error("Error deleting domain");
			});
	};

	const serverIp = application?.server?.ipAddress?.toString() || ip?.toString();

	const columns = createColumns({
		id,
		type,
		validationStates,
		handleValidateDomain,
		handleDeleteDomain,
		isRemoving,
		serverIp,
	});

	const tableData: Domain[] =
		data?.map((item) => ({
			domainId: item.domainId,
			host: item.host,
			https: item.https,
			port: item.port,
			path: item.path,
			serviceName: item.serviceName,
			certificateType: item.certificateType,
			domainType: item.domainType,
			createdAt: item.createdAt,
		})) ?? [];

	const table = useReactTable({
		data: tableData,
		columns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		state: {
			sorting,
			columnFilters,
			columnVisibility,
		},
	});

	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-center flex-wrap gap-4 justify-between">
					<div className="flex flex-col gap-1">
						<CardTitle className="text-xl">Domains</CardTitle>
						<CardDescription>
							Domains are used to access to the application
						</CardDescription>
					</div>

					<div className="flex flex-row gap-2 flex-wrap">
						{data && data?.length > 0 && (
							<>
								<Button
									variant="outline"
									size="icon"
									onClick={() => setIsGridView(!isGridView)}
									title={
										isGridView ? "Switch to table view" : "Switch to grid view"
									}
								>
									{isGridView ? (
										<LayoutList className="size-4" />
									) : (
										<LayoutGrid className="size-4" />
									)}
								</Button>
								<AddDomain id={id} type={type}>
									<Button>
										<GlobeIcon className="size-4" /> Add Domain
									</Button>
								</AddDomain>
							</>
						)}
					</div>
				</CardHeader>
				<CardContent className="flex w-full flex-row gap-4">
					{isLoadingDomains ? (
						<div className="flex w-full flex-row gap-4 min-h-[40vh] justify-center items-center">
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								Loading domains...
							</span>
						</div>
					) : data?.length === 0 ? (
						<div className="flex w-full flex-col items-center justify-center gap-3 min-h-[40vh]">
							<GlobeIcon className="size-8 text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To access the application it is required to set at least 1
								domain
							</span>
							<div className="flex flex-row gap-4 flex-wrap">
								<AddDomain id={id} type={type}>
									<Button>
										<GlobeIcon className="size-4" /> Add Domain
									</Button>
								</AddDomain>
							</div>
						</div>
					) : isGridView ? (
						<div className="grid grid-cols-1 gap-4 xl:grid-cols-2 w-full min-h-[40vh] ">
							{data?.map((item) => {
								const validationState = validationStates[item.host];
								return (
									<Card
										key={item.domainId}
										className="relative overflow-hidden w-full border transition-all hover:shadow-md bg-transparent h-fit"
									>
										<CardContent className="p-6">
											<div className="flex flex-col gap-4">
												{/* Service & Domain Info */}
												<div className="flex items-center justify-between flex-wrap gap-y-2">
													{item.serviceName && (
														<Badge variant="outline" className="w-fit">
															<Server className="size-3 mr-1" />
															{item.serviceName}
														</Badge>
													)}
													<div className="flex gap-2 flex-wrap">
														{!item.host.includes("traefik.me") && (
															<DnsHelperModal
																domain={{
																	host: item.host,
																	https: item.https,
																	path: item.path || undefined,
																}}
																serverIp={serverIp}
															/>
														)}
														<AddDomain
															id={id}
															type={type}
															domainId={item.domainId}
														>
															<Button
																variant="ghost"
																size="icon"
																className="group hover:bg-blue-500/10"
															>
																<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
															</Button>
														</AddDomain>
														<DialogAction
															title="Delete Domain"
															description="Are you sure you want to delete this domain?"
															type="destructive"
															onClick={() => handleDeleteDomain(item.domainId)}
														>
															<Button
																variant="ghost"
																size="icon"
																className="group hover:bg-red-500/10"
																isLoading={isRemoving}
															>
																<Trash2 className="size-4 text-primary group-hover:text-red-500" />
															</Button>
														</DialogAction>
													</div>
												</div>
												<div className="w-full break-all">
													<Link
														className="flex items-center gap-2 text-base font-medium hover:underline"
														target="_blank"
														href={`${item.https ? "https" : "http"}://${item.host}${item.path}`}
													>
														{item.host}
														<ExternalLink className="size-4 min-w-4" />
													</Link>
												</div>

												{/* Domain Details */}
												<div className="flex flex-wrap gap-3">
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge variant="secondary">
																	<InfoIcon className="size-3 mr-1" />
																	Path: {item.path || "/"}
																</Badge>
															</TooltipTrigger>
															<TooltipContent>
																<p>URL path for this service</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge variant="secondary">
																	<InfoIcon className="size-3 mr-1" />
																	Port: {item.port}
																</Badge>
															</TooltipTrigger>
															<TooltipContent>
																<p>Container port exposed</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge
																	variant={item.https ? "outline" : "secondary"}
																>
																	{item.https ? "HTTPS" : "HTTP"}
																</Badge>
															</TooltipTrigger>
															<TooltipContent>
																<p>
																	{item.https
																		? "Secure HTTPS connection"
																		: "Standard HTTP connection"}
																</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													{item.certificateType && (
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Badge variant="outline">
																		Cert: {item.certificateType}
																	</Badge>
																</TooltipTrigger>
																<TooltipContent>
																	<p>SSL Certificate Provider</p>
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													)}

													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge
																	variant="outline"
																	className={
																		validationState?.isValid
																			? "bg-green-500/10 text-green-500 cursor-pointer"
																			: validationState?.error
																				? "bg-red-500/10 text-red-500 cursor-pointer"
																				: "bg-yellow-500/10 text-yellow-500 cursor-pointer"
																	}
																	onClick={() =>
																		handleValidateDomain(item.host)
																	}
																>
																	{validationState?.isLoading ? (
																		<>
																			<Loader2 className="size-3 mr-1 animate-spin" />
																			Checking DNS...
																		</>
																	) : validationState?.isValid ? (
																		<>
																			<CheckCircle2 className="size-3 mr-1" />
																			{validationState.message &&
																			validationState.cdnProvider
																				? `Behind ${validationState.cdnProvider}`
																				: "DNS Valid"}
																		</>
																	) : validationState?.error ? (
																		<>
																			<XCircle className="size-3 mr-1" />
																			{validationState.error}
																		</>
																	) : (
																		<>
																			<RefreshCw className="size-3 mr-1" />
																			Validate DNS
																		</>
																	)}
																</Badge>
															</TooltipTrigger>
															<TooltipContent className="max-w-xs">
																{validationState?.error ? (
																	<div className="flex flex-col gap-1">
																		<p className="font-medium text-red-500">
																			Error:
																		</p>
																		<p>{validationState.error}</p>
																	</div>
																) : (
																	"Click to validate DNS configuration"
																)}
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												</div>
											</div>
										</CardContent>
									</Card>
								);
							})}
						</div>
					) : (
						<div className="flex flex-col gap-4 w-full overflow-auto">
							<div className="flex items-center gap-2 max-sm:flex-wrap">
								<Input
									placeholder="Filter by host..."
									value={
										(table.getColumn("host")?.getFilterValue() as string) ?? ""
									}
									onChange={(event) =>
										table.getColumn("host")?.setFilterValue(event.target.value)
									}
									className="md:max-w-sm"
								/>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											className="sm:ml-auto max-sm:w-full"
										>
											Columns <ChevronDown className="ml-2 h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										{table
											.getAllColumns()
											.filter((column) => column.getCanHide())
											.map((column) => {
												return (
													<DropdownMenuCheckboxItem
														key={column.id}
														className="capitalize"
														checked={column.getIsVisible()}
														onCheckedChange={(value) =>
															column.toggleVisibility(!!value)
														}
													>
														{column.id}
													</DropdownMenuCheckboxItem>
												);
											})}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										{table.getHeaderGroups().map((headerGroup) => (
											<TableRow key={headerGroup.id}>
												{headerGroup.headers.map((header) => {
													return (
														<TableHead key={header.id}>
															{header.isPlaceholder
																? null
																: flexRender(
																		header.column.columnDef.header,
																		header.getContext(),
																	)}
														</TableHead>
													);
												})}
											</TableRow>
										))}
									</TableHeader>
									<TableBody>
										{table?.getRowModel()?.rows?.length ? (
											table.getRowModel().rows.map((row) => (
												<TableRow
													key={row.id}
													data-state={row.getIsSelected() && "selected"}
												>
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
													className="h-24 text-center"
												>
													No results.
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</div>
							{data && data.length > 0 && (
								<div className="flex items-center justify-end space-x-2 py-4">
									<div className="space-x-2 flex flex-wrap">
										<Button
											variant="outline"
											size="sm"
											onClick={() => table.previousPage()}
											disabled={!table.getCanPreviousPage()}
										>
											Previous
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => table.nextPage()}
											disabled={!table.getCanNextPage()}
										>
											Next
										</Button>
									</div>
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
