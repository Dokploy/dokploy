import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { CheckIcon, ChevronsUpDown, HelpCircle, Plus, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
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

const createGitlabComposeProviderSchema = (
	t: ReturnType<typeof useTranslations<"applicationGeneralForms">>,
) =>
	z.object({
		composePath: z.string().min(1, t("shared.pathRequired")),
		repository: z
			.object({
				repo: z.string().min(1, t("shared.repoRequired")),
				owner: z.string().min(1, t("shared.ownerRequired")),
				gitlabPathNamespace: z.string().min(
					1,
					t("gitlab.validation.pathNamespaceRequired"),
				),
				id: z.number().nullable(),
			})
			.required(),
		branch: z.string().min(1, t("shared.branchRequired")),
		gitlabId: z.string().min(1, t("gitlab.validation.gitlabProviderRequired")),
		watchPaths: z.array(z.string()).optional(),
		enableSubmodules: z.boolean().default(false),
	});

type GitlabComposeProvider = z.infer<
	ReturnType<typeof createGitlabComposeProviderSchema>
>;

interface Props {
	composeId: string;
}

export const SaveGitlabProviderCompose = ({ composeId }: Props) => {
	const t = useTranslations("applicationGeneralForms");
	const tCommon = useTranslations("common");
	const gitlabComposeProviderSchema = useMemo(
		() => createGitlabComposeProviderSchema(t),
		[t],
	);
	const gitlabWatchPathInputRef = useRef<HTMLInputElement>(null);

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
				id: null as number | null,
			},
			gitlabId: "",
			branch: "",
			watchPaths: [] as string[],
			enableSubmodules: false,
		},
		resolver: zodResolver(gitlabComposeProviderSchema),
	});

	const repository = form.watch("repository");
	const gitlabId = form.watch("gitlabId");

	const gitlabUrl = useMemo(() => {
		const url = gitlabProviders?.find(
			(provider) => provider.gitlabId === gitlabId,
		)?.gitlabUrl;

		const normalized = url?.replace(/\/$/, "");

		return normalized || "https://gitlab.com";
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
					gitlabPathNamespace: data.gitlabPathNamespace || "",
					id: data.gitlabProjectId,
				},
				composePath: data.composePath,
				gitlabId: data.gitlabId || "",
				watchPaths: data.watchPaths || [],
				enableSubmodules: data.enableSubmodules ?? false,
			});
		}
	}, [form.reset, data?.composeId, form, data]);

	const onSubmit = async (formData: GitlabComposeProvider) => {
		await mutateAsync({
			gitlabBranch: formData.branch,
			gitlabRepository: formData.repository.repo,
			gitlabOwner: formData.repository.owner,
			composePath: formData.composePath,
			gitlabId: formData.gitlabId,
			composeId,
			gitlabProjectId: formData.repository.id,
			gitlabPathNamespace: formData.repository.gitlabPathNamespace,
			sourceType: "gitlab",
			composeStatus: "idle",
			watchPaths: formData.watchPaths,
			enableSubmodules: formData.enableSubmodules,
		})
			.then(async () => {
				toast.success(t("shared.providerSaved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("gitlab.toastError"));
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
									<FormLabel>{t("gitlab.gitlabAccount")}</FormLabel>
									<Select
										onValueChange={(value) => {
											field.onChange(value);
											form.setValue("repository", {
												owner: "",
												repo: "",
												id: null,
												gitlabPathNamespace: "",
											});
											form.setValue("branch", "");
										}}
										defaultValue={field.value}
										value={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("gitlab.selectGitlabAccount")}
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
										<FormLabel>{t("shared.repository")}</FormLabel>
										{field.value.gitlabPathNamespace && (
											<Link
												href={`${gitlabUrl}/${field.value.gitlabPathNamespace}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<GitlabIcon className="h-4 w-4" />
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
												{!gitlabId ? (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("shared.selectGitlabAccountFirst")}
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
														{repositories && repositories.length === 0 && (
															<CommandEmpty>
																{t("shared.noRepositoriesFound")}
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
												ref={gitlabWatchPathInputRef}
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
												const input = gitlabWatchPathInputRef.current;
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
							isLoading={isSavingGitlabProvider}
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
