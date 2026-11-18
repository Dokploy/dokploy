import { VALID_BRANCH_REGEX } from "@dokploy/server/utils/git-branch-validation";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { CheckIcon, ChevronsUpDown, HelpCircle, Plus, X } from "lucide-react";
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
	buildPath: z
		.string()
		.min(1, "application.github.pathRequired")
		.default("/"),
	repository: z
		.object({
			repo: z.string().min(1, "application.github.repoRequired"),
			owner: z.string().min(1, "application.github.ownerRequired"),
		})
		.required(),
	branch: z
		.string()
		.min(1, "application.github.branchRequired")
		.regex(VALID_BRANCH_REGEX, "application.github.invalidBranchName"),
	githubId: z.string().min(1, "application.github.providerRequired"),
	watchPaths: z.array(z.string()).optional(),
	triggerType: z.enum(["push", "tag"]).default("push"),
	enableSubmodules: z.boolean().default(false),
});

type GithubProvider = z.infer<typeof GithubProviderSchema>;

interface Props {
	applicationId: string;
}

export const SaveGithubProvider = ({ applicationId }: Props) => {
	const { t } = useTranslation();
	const { data: githubProviders } = api.github.githubProviders.useQuery();
	const { data, refetch } = api.application.one.useQuery({ applicationId });

	const { mutateAsync, isPending: isSavingGithubProvider } =
		api.application.saveGithubProvider.useMutation();

	const form = useForm({
		defaultValues: {
			buildPath: "/",
			repository: {
				owner: "",
				repo: "",
			},
			githubId: "",
			branch: "",
			triggerType: "push",
			enableSubmodules: false,
		},
		resolver: zodResolver(GithubProviderSchema),
	});

	const repository = form.watch("repository");
	const githubId = form.watch("githubId");

	// Enterprise repositories do not live on github.com.
	const providerUrl =
		githubProviders?.find((provider) => provider.githubId === githubId)
			?.githubUrl ?? DEFAULT_GITHUB_URL;
	const triggerType = form.watch("triggerType");

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
				buildPath: data.buildPath || "/",
				githubId: data.githubId || "",
				watchPaths: data.watchPaths || [],
				triggerType: data.triggerType || "push",
				enableSubmodules: data.enableSubmodules ?? false,
			});
		}
	}, [form.reset, data?.applicationId, form]);

	const onSubmit = async (data: GithubProvider) => {
		await mutateAsync({
			branch: data.branch,
			repository: data.repository.repo,
			applicationId,
			owner: data.repository.owner,
			buildPath: data.buildPath,
			githubId: data.githubId,
			watchPaths: data.watchPaths || [],
			triggerType: data.triggerType,
			enableSubmodules: data.enableSubmodules,
		})
			.then(async () => {
				toast.success(t("application.github.saved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.github.saveError"));
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
									<FormLabel>
										{t("application.github.account")}
									</FormLabel>
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
										defaultValue={field.value}
										value={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("application.github.selectAccount")}
												>
													{
														githubProviders?.find(
															(githubProvider) =>
																githubProvider.githubId === field.value,
														)?.gitProvider.name
													}
												</SelectValue>
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
										<FormLabel>
											{t("application.github.repository")}
										</FormLabel>
										{field.value.owner && field.value.repo && (
											<Link
												href={`${providerUrl}/${field.value.owner}/${field.value.repo}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<GithubIcon className="h-4 w-4" />
												<span>
													{t("application.github.viewRepository")}
												</span>
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
														? t("application.github.selectRepository")
														: isLoadingRepositories
															? t("application.github.loading")
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
													placeholder={t("application.github.searchRepository")}
													className="h-9"
												/>
												{!githubId ? (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("application.github.selectAccountFirst")}
													</span>
												) : isLoadingRepositories ? (
													<span className="py-6 text-center text-sm">
														{t("application.github.loadingRepositories")}
													</span>
												) : null}
												<CommandEmpty>
													{t("application.github.noRepositories")}
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
												{t("application.github.repoRequired")}
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
									<FormLabel>{t("application.github.branch")}</FormLabel>
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
														? t("application.github.loading")
														: field.value
															? (branches?.find(
																	(branch) => branch.name === field.value,
																)?.name ?? field.value)
															: t("application.github.selectBranch")}
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
													placeholder={t("application.github.searchBranch")}
													className="h-9"
												/>
													{status === "pending" && fetchStatus === "fetching" && (
														<span className="py-6 text-center text-sm text-muted-foreground">
															{t("application.github.loadingBranches")}
														</span>
													)}
													{!repository?.owner && (
														<span className="py-6 text-center text-sm text-muted-foreground">
															{t("application.github.selectRepositoryFirst")}
														</span>
													)}
													<ScrollArea className="h-96">
														<CommandEmpty>
															{t("application.github.noBranches")}
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
							name="buildPath"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("application.github.buildPath")}</FormLabel>
									<FormControl>
										<Input placeholder="/" {...field} />
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
									<div className="flex items-center gap-2 ">
										<FormLabel>
											{t("application.github.triggerType")}
										</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
												</TooltipTrigger>
												<TooltipContent>
													<p>
														{t("application.github.triggerTypeTooltip")}
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
													placeholder={t("application.github.selectTriggerType")}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="push">
												{t("application.github.onPush")}
											</SelectItem>
											<SelectItem value="tag">
												{t("application.github.onTag")}
											</SelectItem>
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
											<FormLabel>
												{t("application.github.watchPaths")}
											</FormLabel>
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
													</TooltipTrigger>
													<TooltipContent>
														<p>
															{t("application.github.watchPathsTooltip")}
														</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
										<div className="flex flex-wrap gap-2 mb-2">
											{field.value?.map((path, index) => (
												<Badge
													key={`${path}-${index}`}
													variant="secondary"
													className="flex items-center gap-1"
												>
													{path}
													<button
														type="button"
														aria-label={t("application.github.removeWatchPath")}
														className="inline-flex items-center focus-visible:ring-2"
														onClick={() => {
															const newPaths = [...(field.value || [])];
															newPaths.splice(index, 1);
															field.onChange(newPaths);
														}}
													>
														<X className="size-3 cursor-pointer hover:text-destructive" />
													</button>
												</Badge>
											))}
										</div>
										<div className="flex gap-2">
											<FormControl>
												<Input
													placeholder={t("application.github.watchPathPlaceholder")}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															e.preventDefault();
															const input = e.currentTarget;
															const path = input.value.trim();
															if (path) {
																field.onChange([...(field.value || []), path]);
																input.value = "";
															}
														}
													}}
												/>
											</FormControl>
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => {
													const input = document.querySelector(
														'input[placeholder*="Enter a path"]',
													) as HTMLInputElement;
													const path = input.value.trim();
													if (path) {
														field.onChange([...(field.value || []), path]);
														input.value = "";
													}
												}}
											>
												<Plus className="size-4" />
											</Button>
										</div>
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
									<FormLabel>
										{t("application.github.enableSubmodules")}
									</FormLabel>
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
								{t("application.github.save")}
							</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
