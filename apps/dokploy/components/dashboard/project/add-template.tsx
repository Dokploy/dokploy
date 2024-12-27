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
import { ScrollArea } from "@radix-ui/react-scroll-area";
import {
	BookText,
	CheckIcon,
	ChevronsUpDown,
	Code,
	Github,
	Globe,
	HelpCircle,
	PuzzleIcon,
	SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
interface Props {
	projectId: string;
}

export const AddTemplate = ({ projectId }: Props) => {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const { data } = api.compose.templates.useQuery();
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: tags, isLoading: isLoadingTags } =
		api.compose.getTags.useQuery();
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
			<DialogContent className="max-h-screen overflow-y-auto p-0 sm:max-w-7xl">
				<div className="sticky top-0 z-10 flex flex-col gap-4 border-b bg-background p-6">
					<DialogHeader>
						<DialogTitle>Create from Template</DialogTitle>
						<DialogDescription>
							Create an open source application from a template
						</DialogDescription>
					</DialogHeader>
					{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
					<div className="flex flex-col gap-2 md:flex-row">
						<Input
							placeholder="Search Template"
							onChange={(e) => setQuery(e.target.value)}
							className="w-full"
							value={query}
						/>
						<Popover modal={true}>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									className={cn(
										"!bg-input w-full justify-between md:max-w-[15rem]",
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
									<CommandInput placeholder="Search tag..." className="h-9" />
									{isLoadingTags && (
										<span className="py-6 text-center text-sm">
											Loading Tags....
										</span>
									)}
									<CommandEmpty>No tags found.</CommandEmpty>
									<ScrollArea className="h-96 overflow-y-auto">
										<CommandGroup>
											{tags?.map((tag) => {
												return (
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
												);
											})}
										</CommandGroup>
									</ScrollArea>
								</Command>
							</PopoverContent>
						</Popover>
					</div>
				</div>
				<div className="w-full p-6">
					{templates.length === 0 ? (
						<div className="flex min-h-[50vh] w-full items-center justify-center gap-2">
							<SearchIcon className="size-6 text-muted-foreground" />
							<div className="font-medium text-muted-foreground text-xl">
								No templates found
							</div>
						</div>
					) : (
						<div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
							{templates?.map((template, index) => (
								<div key={`template-${index}`}>
									<div
										key={template.id}
										className="flex h-full flex-col gap-4 rounded-lg border p-6"
									>
										<div className="flex flex-col gap-4">
											<div className="flex flex-col items-center gap-2">
												<img
													src={`/templates/${template.logo}`}
													className="size-28 object-contain"
													alt=""
												/>
											</div>

											<div className="flex flex-col gap-2">
												<div className="flex flex-col items-center justify-center gap-2">
													<div className="flex flex-col items-center justify-center gap-2">
														<div className="flex flex-row flex-wrap gap-2">
															<span className="font-medium text-sm">
																{template.name}
															</span>
															<Badge>{template.version}</Badge>
														</div>

														<div className="flex flex-row gap-0">
															<Link
																href={template.links.github}
																target="_blank"
																className={
																	"flex items-center rounded-full p-3 text-muted-foreground text-sm transition-colors hover:bg-border"
																}
															>
																<Github className="size-4 text-muted-foreground" />
															</Link>
															{template.links.website && (
																<Link
																	href={template.links.website}
																	target="_blank"
																	className={
																		"flex items-center rounded-full p-3 text-muted-foreground text-sm transition-colors hover:bg-border"
																	}
																>
																	<Globe className="size-4 text-muted-foreground" />
																</Link>
															)}
															{template.links.docs && (
																<Link
																	href={template.links.docs}
																	target="_blank"
																	className={
																		"flex items-center rounded-full p-3 text-muted-foreground text-sm transition-colors hover:bg-border"
																	}
																>
																	<BookText className="size-4 text-muted-foreground" />
																</Link>
															)}
															<Link
																href={`https://github.com/Dokploy/dokploy/tree/canary/apps/dokploy/templates/${template.id}`}
																target="_blank"
																className={
																	"flex items-center rounded-full p-3 text-muted-foreground text-sm transition-colors hover:bg-border"
																}
															>
																<Code className="size-4 text-muted-foreground" />
															</Link>
														</div>
														<div className="flex flex-row flex-wrap justify-center gap-2">
															{template.tags.map((tag) => (
																<Badge variant="secondary" key={tag}>
																	{tag}
																</Badge>
															))}
														</div>
													</div>

													<AlertDialog>
														<AlertDialogTrigger asChild>
															<Button onSelect={(e) => e.preventDefault()}>
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
																	{template.name} template and add it to your
																	project.
																</AlertDialogDescription>

																<div>
																	<TooltipProvider delayDuration={0}>
																		<Tooltip>
																			<TooltipTrigger asChild>
																				<Label className="flex w-fit flex-row items-center gap-1 break-all pt-3.5 pb-2">
																					Select a Server (Optional)
																					<HelpCircle className="size-4 text-muted-foreground" />
																				</Label>
																			</TooltipTrigger>
																			<TooltipContent
																				className="z-[999] w-[300px]"
																				align="start"
																				side="top"
																			>
																				<span>
																					If not server is selected, the
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
																						{server.name}
																					</SelectItem>
																				))}
																				<SelectLabel>
																					Servers ({servers?.length})
																				</SelectLabel>
																			</SelectGroup>
																		</SelectContent>
																	</Select>
																</div>
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
																		});
																		toast.promise(promise, {
																			loading: "Setting up...",
																			success: (data) => {
																				utils.project.one.invalidate({
																					projectId,
																				});
																				setOpen(false);
																				return `${template.name} template created succesfully`;
																			},
																			error: (err) => {
																				return `Ocurred an error deploying ${template.name} template`;
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

												<p className="line-clamp-3 text-muted-foreground text-sm">
													{template.description}
												</p>
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
