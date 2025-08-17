import {
	BookText,
	CheckIcon,
	ChevronsUpDown,
	Globe,
	HelpCircle,
	LayoutGrid,
	List,
	Loader2,
	PuzzleIcon,
	SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GithubIcon } from "@/components/icons/data-tools-icons";
import { AlertBlock } from "@/components/shared/alert-block";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const TEMPLATE_BASE_URL_KEY = "dokploy_template_base_url";

interface Props {
	projectId: string;
	baseUrl?: string;
}

export const AddTemplate = ({ projectId, baseUrl }: Props) => {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [viewMode, setViewMode] = useState<"detailed" | "icon">("detailed");
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [customBaseUrl, setCustomBaseUrl] = useState<string | undefined>(() => {
		// Try to get from props first, then localStorage
		if (baseUrl) return baseUrl;
		if (typeof window !== "undefined") {
			return localStorage.getItem(TEMPLATE_BASE_URL_KEY) || undefined;
		}
		return undefined;
	});

	// Save to localStorage when customBaseUrl changes
	useEffect(() => {
		if (customBaseUrl) {
			localStorage.setItem(TEMPLATE_BASE_URL_KEY, customBaseUrl);
		} else {
			localStorage.removeItem(TEMPLATE_BASE_URL_KEY);
		}
	}, [customBaseUrl]);

	const {
		data,
		isLoading: isLoadingTemplates,
		error: errorTemplates,
		isError: isErrorTemplates,
	} = api.compose.templates.useQuery(
		{ baseUrl: customBaseUrl },
		{
			enabled: open,
		},
	);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: tags, isLoading: isLoadingTags } = api.compose.getTags.useQuery(
		{ baseUrl: customBaseUrl },
		{
			enabled: open,
		},
	);
	const utils = api.useUtils();

	const [serverId, setServerId] = useState<string | undefined>(undefined);
	const { mutateAsync, isLoading, error, isError } =
		api.compose.deployTemplate.useMutation();

	const templates =
		data?.filter((template) => {
			const matchesTags =
				selectedTags.length === 0 ||
				template.tags.some((tag) => selectedTags.includes(tag));
			const matchesQuery =
				query === "" ||
				template.name.toLowerCase().includes(query.toLowerCase()) ||
				template.description.toLowerCase().includes(query.toLowerCase());
			return matchesTags && matchesQuery;
		}) || [];

	const hasServers = servers && servers.length > 0;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<PuzzleIcon className="size-4 text-muted-foreground" />
					<span>Template</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[90vw] p-0">
				<DialogHeader className="sticky top-0 z-10 bg-background p-6 border-b">
					<div className="flex flex-col space-y-6">
						<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
							<div>
								<DialogTitle>Create from Template</DialogTitle>
								<DialogDescription>
									Create an open source application from a template
								</DialogDescription>
							</div>
							<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
								<Input
									placeholder="Search Template"
									onChange={(e) => setQuery(e.target.value)}
									className="w-full sm:w-[200px]"
									value={query}
								/>
								<Input
									placeholder="Base URL (optional)"
									onChange={(e) =>
										setCustomBaseUrl(e.target.value || undefined)
									}
									className="w-full sm:w-[300px]"
									value={customBaseUrl || ""}
								/>
								<Popover modal={true}>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											className={cn(
												"w-full sm:w-[200px] justify-between !bg-input",
											)}
										>
											{isLoadingTags
												? "Loading...."
												: selectedTags.length > 0
													? `Selected ${selectedTags.length} tags`
													: "Select tag"}

											<ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="p-0" align="start">
										<Command>
											<CommandInput
												placeholder="Search tag..."
												className="h-9"
											/>
											{isLoadingTags && (
												<span className="py-6 text-center text-sm">
													Loading Tags....
												</span>
											)}
											<CommandEmpty>No tags found.</CommandEmpty>
											<ScrollArea className="h-96">
												<CommandGroup>
													{tags?.map((tag) => (
														<CommandItem
															value={tag}
															key={tag}
															onSelect={() => {
																if (selectedTags.includes(tag)) {
																	setSelectedTags(
																		selectedTags.filter((t) => t !== tag),
																	);
																	return;
																}
																setSelectedTags([...selectedTags, tag]);
															}}
														>
															{tag}
															<CheckIcon
																className={cn(
																	"ml-auto h-4 w-4",
																	selectedTags.includes(tag)
																		? "opacity-100"
																		: "opacity-0",
																)}
															/>
														</CommandItem>
													))}
												</CommandGroup>
											</ScrollArea>
										</Command>
									</PopoverContent>
								</Popover>
								<Button
									size="icon"
									onClick={() =>
										setViewMode(viewMode === "detailed" ? "icon" : "detailed")
									}
									className="h-9 w-9"
								>
									{viewMode === "detailed" ? (
										<LayoutGrid className="size-4" />
									) : (
										<List className="size-4" />
									)}
								</Button>
							</div>
						</div>
						{selectedTags.length > 0 && (
							<div className="flex flex-wrap justify-end gap-2">
								{selectedTags.map((tag) => (
									<Badge
										key={tag}
										variant="secondary"
										className="cursor-pointer"
										onClick={() =>
											setSelectedTags(selectedTags.filter((t) => t !== tag))
										}
									>
										{tag} ×
									</Badge>
								))}
							</div>
						)}
					</div>
				</DialogHeader>

				<ScrollArea className="h-[calc(98vh-8rem)]">
					<div className="p-6">
						{isError && (
							<AlertBlock type="error" className="mb-4">
								{error?.message}
							</AlertBlock>
						)}

						{isErrorTemplates && (
							<AlertBlock type="error" className="mb-4">
								{errorTemplates?.message}
							</AlertBlock>
						)}

						{isLoadingTemplates ? (
							<div className="flex justify-center items-center w-full h-full flex-row gap-4">
								<Loader2 className="size-8 text-muted-foreground animate-spin min-h-[60vh]" />
								<div className="text-lg font-medium text-muted-foreground">
									Loading templates...
								</div>
							</div>
						) : templates.length === 0 ? (
							<div className="flex justify-center items-center w-full gap-2 min-h-[50vh]">
								<SearchIcon className="text-muted-foreground size-6" />
								<div className="text-xl font-medium text-muted-foreground">
									No templates found
								</div>
							</div>
						) : (
							<div
								className={cn(
									"grid gap-6",
									viewMode === "detailed"
										? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
										: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
								)}
							>
								{templates?.map((template, idx) => (
									<div
										key={`${template.id}-${template.version || "default"}-${idx}`}
										className={cn(
											"flex flex-col border rounded-lg overflow-hidden relative",
											viewMode === "icon" && "h-[200px]",
											viewMode === "detailed" && "h-[400px]",
										)}
									>
										<Badge className="absolute top-2 right-2" variant="blue">
											{template?.version}
										</Badge>
										<div
											className={cn(
												"flex-none p-6 pb-3 flex flex-col items-center gap-4 bg-muted/30",
												viewMode === "detailed" && "border-b",
											)}
										>
											<img
												src={`${customBaseUrl || "https://templates.dokploy.com/"}/blueprints/${template?.id}/${template?.logo}`}
												className={cn(
													"object-contain",
													viewMode === "detailed" ? "size-24" : "size-16",
												)}
												alt={template?.name}
											/>
											<div className="flex flex-col items-center gap-2">
												<span className="text-sm font-medium line-clamp-1">
													{template?.name}
												</span>
												{viewMode === "detailed" &&
													template?.tags?.length > 0 && (
														<div className="flex flex-wrap justify-center gap-1.5">
															{template?.tags?.map((tag) => (
																<Badge
																	key={tag}
																	variant="green"
																	className="text-[10px] px-2 py-0"
																>
																	{tag}
																</Badge>
															))}
														</div>
													)}
											</div>
										</div>

										{/* Template Content */}
										{viewMode === "detailed" && (
											<ScrollArea className="flex-1 p-6">
												<div className="text-sm text-muted-foreground">
													{template?.description}
												</div>
											</ScrollArea>
										)}

										{/* Create Button */}
										<div
											className={cn(
												"flex-none px-6 py-3 mt-auto",
												viewMode === "detailed"
													? "flex items-center justify-between bg-muted/30 border-t"
													: "flex justify-center",
											)}
										>
											{viewMode === "detailed" && (
												<div className="flex gap-2">
													{template?.links?.github && (
														<Link
															href={template?.links?.github}
															target="_blank"
															className="text-muted-foreground hover:text-foreground transition-colors"
														>
															<GithubIcon className="size-5" />
														</Link>
													)}
													{template?.links?.website && (
														<Link
															href={template?.links?.website}
															target="_blank"
															className="text-muted-foreground hover:text-foreground transition-colors"
														>
															<Globe className="size-5" />
														</Link>
													)}
													{template?.links?.docs && (
														<Link
															href={template?.links?.docs}
															target="_blank"
															className="text-muted-foreground hover:text-foreground transition-colors"
														>
															<BookText className="size-5" />
														</Link>
													)}
												</div>
											)}
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button
														variant="secondary"
														size="sm"
														className={cn(
															"w-auto",
															viewMode === "detailed" && "w-auto",
														)}
													>
														Create
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>
															Are you absolutely sure?
														</AlertDialogTitle>
														<AlertDialogDescription>
															This will create an application from the{" "}
															{template?.name} template and add it to your
															project.
														</AlertDialogDescription>

														{hasServers && (
															<div>
																<TooltipProvider delayDuration={0}>
																	<Tooltip>
																		<TooltipTrigger asChild>
																			<Label className="break-all w-fit flex flex-row gap-1 items-center pb-2 pt-3.5">
																				Select a Server{" "}
																				{!isCloud ? "(Optional)" : ""}
																				<HelpCircle className="size-4 text-muted-foreground" />
																			</Label>
																		</TooltipTrigger>
																		<TooltipContent
																			className="z-[999] w-[300px]"
																			align="start"
																			side="top"
																		>
																			<span>
																				If no server is selected, the
																				application will be deployed on the
																				server where the user is logged in.
																			</span>
																		</TooltipContent>
																	</Tooltip>
																</TooltipProvider>

																<Select
																	onValueChange={(e) => {
																		setServerId(e);
																	}}
																>
																	<SelectTrigger>
																		<SelectValue placeholder="Select a Server" />
																	</SelectTrigger>
																	<SelectContent>
																		<SelectGroup>
																			{servers?.map((server) => (
																				<SelectItem
																					key={server.serverId}
																					value={server.serverId}
																				>
																					<span className="flex items-center gap-2 justify-between w-full">
																						<span>{server.name}</span>
																						<span className="text-muted-foreground text-xs self-center">
																							{server.ipAddress}
																						</span>
																					</span>
																				</SelectItem>
																			))}
																			<SelectLabel>
																				Servers ({servers?.length})
																			</SelectLabel>
																		</SelectGroup>
																	</SelectContent>
																</Select>
															</div>
														)}
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Cancel</AlertDialogCancel>
														<AlertDialogAction
															disabled={isLoading}
															onClick={async () => {
																const promise = mutateAsync({
																	projectId,
																	serverId: serverId || undefined,
																	id: template.id,
																	baseUrl: customBaseUrl,
																});
																toast.promise(promise, {
																	loading: "Setting up...",
																	success: () => {
																		utils.project.one.invalidate({
																			projectId,
																		});
																		setOpen(false);
																		return `${template.name} template created successfully`;
																	},
																	error: () => {
																		return `An error occurred deploying ${template.name} template`;
																	},
																});
															}}
														>
															Confirm
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
};
