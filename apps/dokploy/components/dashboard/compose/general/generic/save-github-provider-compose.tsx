import { VALID_BRANCH_REGEX } from "@dokploy/server/utils/git-branch-validation";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { CheckIcon, ChevronsUpDown, HelpCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { GithubIcon } from "@/components/icons/data-tools-icons";
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
import { DEFAULT_GITHUB_URL } from "@/utils/github-utils";

const GithubProviderSchema = z.object({
	composePath: z.string().min(1),
	repository: z
		.object({
			repo: z.string().min(1, "compose.repoRequired"),
			owner: z.string().min(1, "compose.ownerRequired"),
		})
		.required(),
	branch: z
		.string()
		.min(1, "compose.branchRequired")
		.regex(VALID_BRANCH_REGEX, "compose.invalidBranchName"),
	githubId: z.string().min(1, "compose.githubProviderRequired"),
	watchPaths: z.array(z.string()).optional(),
	triggerType: z.enum(["push", "tag"]).default("push"),
	enableSubmodules: z.boolean().default(false),
});

type GithubProvider = z.infer<typeof GithubProviderSchema>;

interface Props {
	composeId: string;
}

export const SaveGithubProviderCompose = ({ composeId }: Props) => {
	const { t } = useTranslation();
	const { data: githubProviders } = api.github.githubProviders.useQuery();
	const { data, refetch } = api.compose.one.useQuery({ composeId });

	const { mutateAsync, isPending: isSavingGithubProvider } =
		api.compose.update.useMutation();

	const form = useForm({
		defaultValues: {
			composePath: "./docker-compose.yml",
			repository: {
				owner: "",
				repo: "",
			},
			githubId: "",
			branch: "",
			watchPaths: [],
			triggerType: "push",
			enableSubmodules: false,
		},
		resolver: zodResolver(GithubProviderSchema),
	});

	const repository = form.watch("repository");
	const githubId = form.watch("githubId");
	const triggerType = form.watch("triggerType");

	// Enterprise repositories do not live on github.com.
	const providerUrl =
		githubProviders?.find((provider) => provider.githubId === githubId)
			?.githubUrl ?? DEFAULT_GITHUB_URL;
	const { data: repositories, isPending: isLoadingRepositories } =
		api.github.getGithubRepositories.useQuery(
			{
				githubId,
			},
			{
				enabled: !!githubId,
			},
		);

	const {
		data: branches,
		fetchStatus,
		status,
	} = api.github.getGithubBranches.useQuery(
		{
			owner: repository?.owner,
			repo: repository?.repo,
			githubId,
		},
		{
			enabled: !!repository?.owner && !!repository?.repo && !!githubId,
		},
	);

	useEffect(() => {
		if (data) {
			form.reset({
				branch: data.branch || "",
				repository: {
					repo: data.repository || "",
					owner: data.owner || "",
				},
				composePath: data.composePath,
				githubId: data.githubId || "",
				watchPaths: data.watchPaths || [],
				triggerType: data.triggerType || "push",
				enableSubmodules: data.enableSubmodules ?? false,
			});
		}
	}, [form.reset, data]);

	const onSubmit = async (data: GithubProvider) => {
		await mutateAsync({
			branch: data.branch,
			repository: data.repository.repo,
			composeId,
			owner: data.repository.owner,
			composePath: data.composePath,
			githubId: data.githubId,
			sourceType: "github",
			watchPaths: data.watchPaths,
			enableSubmodules: data.enableSubmodules,
			triggerType: data.triggerType,
		})
			.then(async () => {
				toast.success(t("compose.githubProviderSaved"));
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
					<div className="grid md:grid-cols-2 gap-4">
						<FormField
							control={form.control}
							name="githubId"
							render={({ field }) => (
								<FormItem className="md:col-span-2 flex flex-col">
									<FormLabel>{t("compose.githubAccount")}</FormLabel>
									<Select
										onValueChange={(value) => {
											if (!value) {
												return;
											}
											field.onChange(value);
											form.setValue("repository", {
												owner: "",
												repo: "",
											});
											form.setValue("branch", "");
										}}
										value={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("compose.selectGithubAccount")}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{githubProviders?.map((githubProvider) => (
												<SelectItem
													key={githubProvider.githubId}
													value={githubProvider.githubId}
												>
													{githubProvider.gitProvider.name}
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
										{field.value.owner && field.value.repo && (
											<Link
												href={`${providerUrl}/${field.value.owner}/${field.value.repo}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<GithubIcon className="h-4 w-4" />
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
																	(repo) =>
																		repo.name === field.value.repo &&
																		repo.owner.login === field.value.owner,
																)?.name ?? field.value.repo)}

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
												{!githubId ? (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("compose.selectGithubAccountFirst")}
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
														{repositories?.map((repo) => (
															<CommandItem
																value={`${repo.owner.login}/${repo.name}`}
																key={repo.url}
																onSelect={() => {
																	form.setValue("repository", {
																		owner: repo.owner.login as string,
																		repo: repo.name,
																	});
																	form.setValue("branch", "");
																}}
															>
																<span className="flex min-w-0 items-center gap-2">
																	<span className="truncate">{repo.name}</span>
																	<span className="text-muted-foreground text-xs">
																		{repo.owner.login}
																	</span>
																</span>
																<CheckIcon
																	className={cn(
																		"ml-auto h-4 w-4",
																		repo.name === field.value.repo &&
																			repo.owner.login === field.value.owner
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
															? (branches?.find(
																	(branch) => branch.name === field.value,
																)?.name ?? field.value)
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
																key={branch.commit.sha}
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
							name="triggerType"
							render={({ field }) => (
								<FormItem className="md:col-span-2">
									<div className="flex items-center gap-2">
										<FormLabel>{t("compose.triggerType")}</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
												</TooltipTrigger>
												<TooltipContent>
													<p>
														{t("compose.triggerTypeTooltip")}
														selected branch or when a new tag is created.
													</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</div>
									<Select
										onValueChange={(value) => {
											if (!value) {
												return;
											}
											field.onChange(value);
										}}
										value={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("compose.selectTriggerType")}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="push">
												{t("compose.onPush")}
											</SelectItem>
											<SelectItem value="tag">{t("compose.onTag")}</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						{triggerType === "push" && (
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
														<p>
															{t("compose.watchPathsTooltip")}
															these paths change, a new deployment will be
															triggered.
														</p>
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
																const newPaths = [
																	...(field.value || []),
																	value,
																];
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
						)}
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
							isLoading={isSavingGithubProvider}
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
