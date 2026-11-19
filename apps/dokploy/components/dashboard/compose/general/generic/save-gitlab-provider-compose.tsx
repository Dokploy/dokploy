import { VALID_BRANCH_REGEX } from "@dokploy/server/utils/git-branch-validation";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { CheckIcon, ChevronsUpDown, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
			repo: z.string().min(1, "compose.repoRequired"),
			owner: z.string().min(1, "compose.ownerRequired"),
			id: z.number().nullable(),
			gitlabPathNamespace: z.string().min(1),
		})
		.required(),
	branch: z
		.string()
		.min(1, "compose.branchRequired")
		.regex(VALID_BRANCH_REGEX, "compose.invalidBranchName"),
	gitlabId: z.string().min(1, "compose.gitlabProviderRequired"),
	watchPaths: z.array(z.string()).optional(),
	enableSubmodules: z.boolean().default(false),
});

type GitlabProvider = z.infer<typeof GitlabProviderSchema>;

interface Props {
	composeId: string;
}

export const SaveGitlabProviderCompose = ({ composeId }: Props) => {
	const { t } = useTranslation();
	const { data: gitlabProviders } = api.gitlab.gitlabProviders.useQuery();
	const { data, refetch } = api.compose.one.useQuery({ composeId });

	const { mutateAsync, isPending: isSavingGitlabProvider } =
		api.compose.update.useMutation();

	const form = useForm({
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

	const gitlabUrl = useMemo(() => {
		const url = gitlabProviders?.find(
			(provider) => provider.gitlabId === gitlabId,
		)?.gitlabUrl;

		const gitlabUrl = url?.replace(/\/$/, "");

		return gitlabUrl || "https://gitlab.com";
	}, [gitlabId, gitlabProviders]);

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
			watchPaths: data.watchPaths,
			enableSubmodules: data.enableSubmodules,
		})
			.then(async () => {
				toast.success(t("compose.gitlabProviderSaved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("compose.providerSaveError"));
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
									<FormLabel>{t("compose.gitlabAccount")}</FormLabel>
									<Select
										onValueChange={(value) => {
											if (!value) {
												return;
											}
											field.onChange(value);
											form.setValue("repository", {
												owner: "",
												repo: "",
												gitlabPathNamespace: "",
												id: null,
											});
											form.setValue("branch", "");
										}}
										value={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("compose.selectGitlabAccount")}
												/>
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
										<FormLabel>{t("compose.repository")}</FormLabel>
										{field.value.gitlabPathNamespace && (
											<Link
												href={`${gitlabUrl}/${field.value.gitlabPathNamespace}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<GitlabIcon className="h-4 w-4" />
												<span>{t("compose.viewRepository")}</span>
											</Link>
										)}
									</div>
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													className={cn(
														"w-full justify-between",
														!field.value && "text-muted-foreground",
													)}
												>
													{!field.value.owner
														? t("compose.selectRepository")
														: isLoadingRepositories
															? t("compose.loading")
															: (repositories?.find(
																	(repo) => repo.name === field.value.repo,
																)?.name ?? t("compose.selectRepository"))}

													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent
											className="w-[var(--radix-popover-trigger-width)] p-0"
											align="start"
										>
											<Command>
												<CommandInput
													placeholder={t("compose.searchRepository")}
													className="h-9"
												/>
												{!gitlabId ? (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("compose.selectGitlabAccountFirst")}
													</span>
												) : isLoadingRepositories ? (
													<span className="py-6 text-center text-sm">
														{t("compose.loadingRepositories")}
													</span>
												) : null}
												<CommandEmpty>
													{t("compose.noRepositories")}
												</CommandEmpty>
												<ScrollArea className="h-96">
													<CommandGroup>
														{repositories && repositories.length === 0 && (
															<CommandEmpty>
																{t("compose.noRepositories")}
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
																	<span className="flex min-w-0 items-center gap-2">
																		<span className="truncate">
																			{repo.name}
																		</span>
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
											{t("compose.repositoryRequired")}
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
									<FormLabel>{t("compose.branch")}</FormLabel>
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													className={cn(
														" w-full justify-between",
														!field.value && "text-muted-foreground",
													)}
												>
													{status === "pending" && fetchStatus === "fetching"
														? t("compose.loading")
														: field.value
															? branches?.find(
																	(branch) => branch.name === field.value,
																)?.name
															: t("compose.selectBranch")}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent
											className="w-[var(--radix-popover-trigger-width)] p-0"
											align="start"
										>
											<Command>
												<CommandInput
													placeholder={t("compose.searchBranch")}
													className="h-9"
												/>
												{status === "pending" && fetchStatus === "fetching" && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("compose.loadingBranches")}
													</span>
												)}
												{!repository?.owner && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("compose.selectRepositoryFirst")}
													</span>
												)}
												<ScrollArea className="h-96">
													<CommandEmpty>
														{t("compose.noBranchFound")}
													</CommandEmpty>

													<CommandGroup>
														{branches?.map((branch) => (
															<CommandItem
																value={branch.name}
																key={branch.commit.id}
																onSelect={() => {
																	form.setValue("branch", branch.name);
																}}
															>
																<span className="truncate">{branch.name}</span>
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
									<FormLabel>{t("compose.composePath")}</FormLabel>
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
										<FormLabel>{t("compose.watchPaths")}</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger type="button">
													<div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
														?
													</div>
												</TooltipTrigger>
												<TooltipContent>
													<p>{t("compose.watchPathsTooltip")}</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</div>
									<div className="flex flex-wrap gap-2 mb-2">
										{field.value?.map((path, index) => (
											<Badge key={index} variant="secondary">
												{path}
												<button
													type="button"
													aria-label={t("compose.removeWatchPath")}
													className="inline-flex items-center focus-visible:ring-2"
													onClick={() => {
														const newPaths = [...(field.value || [])];
														newPaths.splice(index, 1);
														form.setValue("watchPaths", newPaths);
													}}
												>
													<X className="ml-1 size-3 cursor-pointer" />
												</button>
											</Badge>
										))}
									</div>
									<FormControl>
										<div className="flex gap-2">
											<Input
												placeholder={t("compose.watchPathPlaceholder")}
												data-watch-path-input=""
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
														"input[data-watch-path-input]",
													) as HTMLInputElement;
													const value = input.value.trim();
													if (value) {
														const newPaths = [...(field.value || []), value];
														form.setValue("watchPaths", newPaths);
														input.value = "";
													}
												}}
											>
												{t("compose.add")}{" "}
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
								<FormItem className="flex flex-row items-center space-x-2 space-y-0">
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<FormLabel>{t("compose.enableSubmodules")}</FormLabel>
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
							{t("compose.save")}{" "}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
