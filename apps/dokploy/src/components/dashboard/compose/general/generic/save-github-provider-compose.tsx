import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { CheckIcon, ChevronsUpDown, HelpCircle, Plus, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
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

const createGithubComposeProviderSchema = (
	t: ReturnType<typeof useTranslations<"applicationGeneralForms">>,
) =>
	z.object({
		composePath: z.string().min(1, t("shared.pathRequired")),
		repository: z
			.object({
				repo: z.string().min(1, t("shared.repoRequired")),
				owner: z.string().min(1, t("shared.ownerRequired")),
			})
			.required(),
		branch: z.string().min(1, t("shared.branchRequired")),
		githubId: z.string().min(1, t("github.validation.githubProviderRequired")),
		watchPaths: z.array(z.string()).optional(),
		triggerType: z.enum(["push", "tag"]).default("push"),
		enableSubmodules: z.boolean().default(false),
	});

type GithubComposeProvider = z.infer<
	ReturnType<typeof createGithubComposeProviderSchema>
>;

interface Props {
	composeId: string;
}

export const SaveGithubProviderCompose = ({ composeId }: Props) => {
	const t = useTranslations("applicationGeneralForms");
	const tCommon = useTranslations("common");
	const githubComposeProviderSchema = useMemo(
		() => createGithubComposeProviderSchema(t),
		[t],
	);
	const githubWatchPathInputRef = useRef<HTMLInputElement>(null);

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
			watchPaths: [] as string[],
			triggerType: "push" as const,
			enableSubmodules: false,
		},
		resolver: zodResolver(githubComposeProviderSchema),
	});

	const repository = form.watch("repository");
	const githubId = form.watch("githubId");
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
				composePath: data.composePath,
				githubId: data.githubId || "",
				watchPaths: data.watchPaths || [],
				triggerType: data.triggerType || "push",
				enableSubmodules: data.enableSubmodules ?? false,
			});
		}
	}, [form.reset, data?.composeId, form, data]);

	const onSubmit = async (formData: GithubComposeProvider) => {
		await mutateAsync({
			branch: formData.branch,
			repository: formData.repository.repo,
			composeId,
			owner: formData.repository.owner,
			composePath: formData.composePath,
			githubId: formData.githubId,
			sourceType: "github",
			composeStatus: "idle",
			watchPaths: formData.watchPaths,
			enableSubmodules: formData.enableSubmodules,
			triggerType: formData.triggerType,
		})
			.then(async () => {
				toast.success(t("shared.providerSaved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("github.toastError"));
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
									<FormLabel>{t("github.githubAccount")}</FormLabel>
									<Select
										onValueChange={(value) => {
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
													placeholder={t("github.selectGithubAccount")}
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
										<FormLabel>{t("shared.repository")}</FormLabel>
										{field.value.owner && field.value.repo && (
											<Link
												href={`https://github.com/${field.value.owner}/${field.value.repo}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<GithubIcon className="h-4 w-4" />
												<span>{t("shared.viewRepository")}</span>
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
													{!field.value.owner
														? t("shared.selectRepository")
														: isLoadingRepositories
															? t("shared.loadingShort")
															: (repositories?.find(
																	(repo) => repo.name === field.value.repo,
																)?.name ?? t("shared.selectRepository"))}

													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t("shared.searchRepository")}
													className="h-9"
												/>
												{!githubId ? (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("shared.selectGithubAccountFirst")}
													</span>
												) : isLoadingRepositories ? (
													<span className="py-6 text-center text-sm">
														{t("shared.loadingRepos")}
													</span>
												) : null}
												<CommandEmpty>
													{t("shared.noRepositoriesFound")}
												</CommandEmpty>
												<ScrollArea className="h-96">
													<CommandGroup>
														{repositories?.map((repo) => (
															<CommandItem
																value={repo.name}
																key={repo.url}
																onSelect={() => {
																	form.setValue("repository", {
																		owner: repo.owner.login as string,
																		repo: repo.name,
																	});
																	form.setValue("branch", "");
																}}
															>
																<span className="flex items-center gap-2">
																	<span>{repo.name}</span>
																	<span className="text-muted-foreground text-xs">
																		{repo.owner.login}
																	</span>
																</span>
																<CheckIcon
																	className={cn(
																		"ml-auto h-4 w-4",
																		repo.name === field.value.repo
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
											{t("shared.repositoryRequired")}
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
									<FormLabel>{t("shared.branch")}</FormLabel>
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
													{status === "pending" && fetchStatus === "fetching"
														? t("shared.loadingShort")
														: field.value
															? branches?.find(
																	(branch) => branch.name === field.value,
																)?.name
															: t("shared.selectBranch")}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t("shared.searchBranch")}
													className="h-9"
												/>
												{status === "pending" && fetchStatus === "fetching" && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("shared.loadingBranches")}
													</span>
												)}
												{!repository?.owner && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("shared.selectRepositoryFirst")}
													</span>
												)}
												<ScrollArea className="h-96">
													<CommandEmpty>
														{t("shared.noBranchFound")}
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
									<FormLabel>{t("shared.composePath")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("shared.composePathPlaceholder")}
											{...field}
										/>
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
										<FormLabel>{t("shared.triggerType")}</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
												</TooltipTrigger>
												<TooltipContent>
													<p>{t("shared.triggerTypeTooltip")}</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</div>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
										value={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("shared.selectTriggerType")}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="push">{t("shared.onPush")}</SelectItem>
											<SelectItem value="tag">{t("shared.onTag")}</SelectItem>
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
											<FormLabel>{t("shared.watchPaths")}</FormLabel>
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
													</TooltipTrigger>
													<TooltipContent>
														<p>{t("shared.watchPathsTooltip")}</p>
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
													<X
														className="size-3 cursor-pointer hover:text-destructive"
														onClick={() => {
															const newPaths = [...(field.value || [])];
															newPaths.splice(index, 1);
															field.onChange(newPaths);
														}}
													/>
												</Badge>
											))}
										</div>
										<div className="flex gap-2">
											<FormControl>
												<Input
													ref={githubWatchPathInputRef}
													placeholder={t("shared.watchPathsPlaceholder")}
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
													const input = githubWatchPathInputRef.current;
													if (!input) return;
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
								<FormItem className="flex items-center space-x-2">
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<FormLabel className="!mt-0">
										{t("shared.enableSubmodules")}
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
							{tCommon("save")}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
