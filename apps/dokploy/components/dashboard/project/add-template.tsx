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
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import {
	CheckIcon,
	ChevronsUpDown,
	Code,
	Github,
	Globe,
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
	const { data: tags, isLoading: isLoadingTags } =
		api.compose.getTags.useQuery();
	const utils = api.useUtils();
	const { mutateAsync, isLoading, error, isError } =
		api.compose.deployTemplate.useMutation();

	const templates =
		data?.filter((template) => {
			const matchesTags =
				selectedTags.length === 0 ||
				template.tags.some((tag) => selectedTags.includes(tag));
			const matchesQuery =
				query === "" ||
				template.name.toLowerCase().includes(query.toLowerCase());
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
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-7xl p-0">
				<div className="sticky top-0 z-10 flex flex-col gap-4 bg-background p-6 border-b">
					<DialogHeader>
						<DialogTitle>Create Template</DialogTitle>
						<DialogDescription>
							Deploy a open source template to your project
						</DialogDescription>
					</DialogHeader>
					{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
					<div className="flex flex-col md:flex-row gap-2">
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
									role="combobox"
									className={cn(
										"md:max-w-[15rem] w-full justify-between !bg-input",
										// !field.value && "text-muted-foreground",
									)}
								>
									{isLoadingTags
										? "Loading...."
										: selectedTags.length > 0
											? `Selected ${selectedTags.length} tags`
											: "Select tag"}

									<ChevronsUpDown className="ml-2 h-4 w-4  opacity-50" />
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
				<div className="p-6 w-full">
					{templates.length === 0 ? (
						<div className="flex justify-center items-center w-full gap-2 min-h-[50vh]">
							<SearchIcon className="text-muted-foreground size-6" />
							<div className="text-xl font-medium text-muted-foreground">
								No templates found
							</div>
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 w-full gap-4">
							{templates?.map((template, index) => (
								<div key={`template-${index}`}>
									<div
										key={template.id}
										className="flex flex-col gap-4 border p-6 rounded-lg h-full"
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
												<div className="flex flex-col gap-2 justify-center items-center">
													<div className="flex flex-col gap-2 items-center justify-center">
														<div className="flex flex-row gap-2 flex-wrap">
															<span className="text-sm font-medium">
																{template.name}
															</span>
															<Badge>{template.version}</Badge>
														</div>

														<div className="flex flex-row gap-0">
															<Link
																href={template.links.github}
																target="_blank"
																className={
																	"text-sm text-muted-foreground p-3 rounded-full hover:bg-border items-center flex transition-colors"
																}
															>
																<Github className="size-4 text-muted-foreground" />
															</Link>
															{template.links.website && (
																<Link
																	href={template.links.website}
																	target="_blank"
																	className={
																		"text-sm text-muted-foreground p-3 rounded-full hover:bg-border items-center flex transition-colors"
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
																		"text-sm text-muted-foreground p-3 rounded-full hover:bg-border items-center flex transition-colors"
																	}
																>
																	<Globe className="size-4 text-muted-foreground" />
																</Link>
															)}
															<Link
																href={`https://github.com/dokploy/dokploy/tree/canary/templates/${template.id}`}
																target="_blank"
																className={
																	"text-sm text-muted-foreground p-3 rounded-full hover:bg-border items-center flex transition-colors"
																}
															>
																<Code className="size-4 text-muted-foreground" />
															</Link>
														</div>
														<div className="flex flex-row gap-2 flex-wrap justify-center">
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
																Deploy
															</Button>
														</AlertDialogTrigger>
														<AlertDialogContent>
															<AlertDialogHeader>
																<AlertDialogTitle>
																	Are you absolutely sure?
																</AlertDialogTitle>
																<AlertDialogDescription>
																	This will deploy {template.name} template to
																	your project.
																</AlertDialogDescription>
															</AlertDialogHeader>
															<AlertDialogFooter>
																<AlertDialogCancel>Cancel</AlertDialogCancel>
																<AlertDialogAction
																	onClick={async () => {
																		await mutateAsync({
																			projectId,
																			id: template.id,
																		})
																			.then(async () => {
																				toast.success(
																					`${template.name} template created succesfully`,
																				);

																				utils.project.one.invalidate({
																					projectId,
																				});
																				setOpen(false);
																			})
																			.catch(() => {
																				toast.error(
																					`Error to delete ${template.name} template`,
																				);
																			});
																	}}
																>
																	Confirm
																</AlertDialogAction>
															</AlertDialogFooter>
														</AlertDialogContent>
													</AlertDialog>
												</div>

												<p className="text-sm text-muted-foreground">
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
