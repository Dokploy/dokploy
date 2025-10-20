import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, ChevronsUpDown, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { GitlabIcon } from "@/components/icons/data-tools-icons";
import { AlertBlock } from "@/components/shared/alert-block";
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
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const GitlabProviderSchema = z.object({
	composePath: z.string().min(1),
	repository: z
		.object({
			repo: z.string().min(1, "Repo is required"),
			owner: z.string().min(1, "Owner is required"),
			id: z.number().nullable(),
			gitlabPathNamespace: z.string().min(1),
		})
		.required(),
	branch: z.string().min(1, "Branch is required"),
	gitlabId: z.string().min(1, "Gitlab Provider is required"),
	watchPaths: z.array(z.string()).optional(),
	enableSubmodules: z.boolean().default(false),
});

type GitlabProvider = z.infer<typeof GitlabProviderSchema>;

interface Props {
	composeId: string;
}

export const SaveGitlabProviderCompose = ({ composeId }: Props) => {
	const { data: gitlabProviders } = api.gitlab.gitlabProviders.useQuery();
	const { data, refetch } = api.compose.one.useQuery({ composeId });

	const { mutateAsync, isLoading: isSavingGitlabProvider } =
		api.compose.update.useMutation();

	const form = useForm<GitlabProvider>({
		defaultValues: {
			composePath: "./docker-compose.yml",
			repository: {
				owner: "",
				repo: "",
				gitlabPathNamespace: "",
				id: null,
			},
			gitlabId: "",
			branch: "",
			watchPaths: [],
			enableSubmodules: false,
		},
		resolver: zodResolver(GitlabProviderSchema),
	});

	const repository = form.watch("repository");
	const gitlabId = form.watch("gitlabId");

	const {
		data: repositories,
		isLoading: isLoadingRepositories,
		error,
	} = api.gitlab.getGitlabRepositories.useQuery(
		{
			gitlabId,
		},
		{
			enabled: !!gitlabId,
		},
	);

	const {
		data: branches,
		fetchStatus,
		status,
	} = api.gitlab.getGitlabBranches.useQuery(
		{
			owner: repository?.owner,
			repo: repository?.repo,
			id: repository?.id || 0,
			gitlabId: gitlabId,
		},
		{
			enabled: !!repository?.owner && !!repository?.repo && !!gitlabId,
		},
	);

	useEffect(() => {
		if (data) {
			form.reset({
				branch: data.gitlabBranch || "",
				repository: {
					repo: data.gitlabRepository || "",
					owner: data.gitlabOwner || "",
					id: data.gitlabProjectId,
					gitlabPathNamespace: data.gitlabPathNamespace || "",
				},
				composePath: data.composePath,
				gitlabId: data.gitlabId || "",
				watchPaths: data.watchPaths || [],
				enableSubmodules: data.enableSubmodules ?? false,
			});
		}
	}, [form.reset, data?.composeId, form]);

	const onSubmit = async (data: GitlabProvider) => {
		await mutateAsync({
			gitlabBranch: data.branch,
			gitlabRepository: data.repository.repo,
			gitlabOwner: data.repository.owner,
			composePath: data.composePath,
			gitlabId: data.gitlabId,
			composeId,
			gitlabProjectId: data.repository.id,
			gitlabPathNamespace: data.repository.gitlabPathNamespace,
			sourceType: "gitlab",
			composeStatus: "idle",
			watchPaths: data.watchPaths,
			enableSubmodules: data.enableSubmodules,
		})
			.then(async () => {
				toast.success("Service Provided Saved");
				await refetch();
			})
			.catch(() => {
				toast.error("Error saving the Gitlab provider");
			});
	};

	return (
		<div>
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="grid w-full gap-4 py-3"
				>
					{error && <AlertBlock type="error">{error?.message}</AlertBlock>}
					<div className="grid md:grid-cols-2 gap-4">
						<FormField
							control={form.control}
							name="gitlabId"
							render={({ field }) => (
								<FormItem className="md:col-span-2 flex flex-col">
									<FormLabel>Gitlab Account</FormLabel>
									<Select
										onValueChange={(value) => {
											field.onChange(value);
											form.setValue("repository", {
												owner: "",
												repo: "",
												gitlabPathNamespace: "",
												id: null,
											});
											form.setValue("branch", "");
										}}
										defaultValue={field.value}
										value={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a Gitlab Account" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{gitlabProviders?.map((gitlabProvider) => (
												<SelectItem
													key={gitlabProvider.gitlabId}
													value={gitlabProvider.gitlabId}
												>
													{gitlabProvider.gitProvider.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="repository"
							render={({ field }) => (
								<FormItem className="md:col-span-2 flex flex-col">
									<div className="flex items-center justify-between">
										<FormLabel>Repository</FormLabel>
										{field.value.owner && field.value.repo && (
											<Link
												href={`https://gitlab.com/${field.value.owner}/${field.value.repo}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<GitlabIcon className="h-4 w-4" />
												<span>View Repository</span>
											</Link>
										)}
									</div>
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													className={cn(
														"w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													{isLoadingRepositories
														? "Loading...."
														: field.value.owner
															? repositories?.find(
																	(repo) => repo.name === field.value.repo,
																)?.name
															: "Select repository"}

													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder="Search repository..."
													className="h-9"
												/>
												{isLoadingRepositories && (
													<span className="py-6 text-center text-sm">
														Loading Repositories....
													</span>
												)}
												<CommandEmpty>No repositories found.</CommandEmpty>
												<ScrollArea className="h-96">
													<CommandGroup>
														{repositories && repositories.length === 0 && (
															<CommandEmpty>
																No repositories found.
															</CommandEmpty>
														)}
														{repositories?.map((repo) => {
															return (
																<CommandItem
																	value={repo.url}
																	key={repo.url}
																	onSelect={() => {
																		form.setValue("repository", {
																			owner: repo.owner.username as string,
																			repo: repo.name,
																			id: repo.id,
																			gitlabPathNamespace: repo.url,
																		});
																		form.setValue("branch", "");
																	}}
																>
																	<span className="flex items-center gap-2">
																		<span>{repo.name}</span>
																		<span className="text-muted-foreground text-xs">
																			{repo.owner.username}
																		</span>
																	</span>
																	<CheckIcon
																		className={cn(
																			"ml-auto h-4 w-4",
																			repo.url ===
																				field.value.gitlabPathNamespace
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
									{form.formState.errors.repository && (
										<p className={cn("text-sm font-medium text-destructive")}>
											Repository is required
										</p>
									)}
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="branch"
							render={({ field }) => (
								<FormItem className="block w-full">
									<FormLabel>Branch</FormLabel>
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													className={cn(
														" w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													{status === "loading" && fetchStatus === "fetching"
														? "Loading...."
														: field.value
															? branches?.find(
																	(branch) => branch.name === field.value,
																)?.name
															: "Select branch"}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder="Search branch..."
													className="h-9"
												/>
												{status === "loading" && fetchStatus === "fetching" && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														Loading Branches....
													</span>
												)}
												{!repository?.owner && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														Select a repository
													</span>
												)}
												<ScrollArea className="h-96">
													<CommandEmpty>No branch found.</CommandEmpty>

													<CommandGroup>
														{branches?.map((branch) => (
															<CommandItem
																value={branch.name}
																key={branch.commit.id}
																onSelect={() => {
																	form.setValue("branch", branch.name);
																}}
															>
																{branch.name}
																<CheckIcon
																	className={cn(
																		"ml-auto h-4 w-4",
																		branch.name === field.value
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

										<FormMessage />
									</Popover>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="composePath"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Compose Path</FormLabel>
									<FormControl>
										<Input placeholder="docker-compose.yml" {...field} />
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="watchPaths"
							render={({ field }) => (
								<FormItem className="md:col-span-2">
									<div className="flex items-center gap-2">
										<FormLabel>Watch Paths</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger>
													<div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
														?
													</div>
												</TooltipTrigger>
												<TooltipContent>
													<p>
														Add paths to watch for changes. When files in these
														paths change, a new deployment will be triggered.
													</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</div>
									<div className="flex flex-wrap gap-2 mb-2">
										{field.value?.map((path, index) => (
											<Badge key={index} variant="secondary">
												{path}
												<X
													className="ml-1 size-3 cursor-pointer"
													onClick={() => {
														const newPaths = [...(field.value || [])];
														newPaths.splice(index, 1);
														form.setValue("watchPaths", newPaths);
													}}
												/>
											</Badge>
										))}
									</div>
									<FormControl>
										<div className="flex gap-2">
											<Input
												placeholder="Enter a path to watch (e.g., src/**, dist/*.js)"
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														e.preventDefault();
														const input = e.currentTarget;
														const value = input.value.trim();
														if (value) {
															const newPaths = [...(field.value || []), value];
															form.setValue("watchPaths", newPaths);
															input.value = "";
														}
													}
												}}
											/>
											<Button
												type="button"
												variant="secondary"
												onClick={() => {
													const input = document.querySelector(
														'input[placeholder="Enter a path to watch (e.g., src/**, dist/*.js)"]',
													) as HTMLInputElement;
													const value = input.value.trim();
													if (value) {
														const newPaths = [...(field.value || []), value];
														form.setValue("watchPaths", newPaths);
														input.value = "";
													}
												}}
											>
												Add
											</Button>
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="enableSubmodules"
							render={({ field }) => (
								<FormItem className="flex items-center space-x-2">
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<FormLabel className="!mt-0">Enable Submodules</FormLabel>
								</FormItem>
							)}
						/>
					</div>
					<div className="flex w-full justify-end">
						<Button
							isLoading={isSavingGitlabProvider}
							type="submit"
							className="w-fit"
						>
							Save
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
