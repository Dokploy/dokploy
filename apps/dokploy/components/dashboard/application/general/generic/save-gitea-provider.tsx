import { VALID_BRANCH_REGEX } from "@dokploy/server/utils/git-branch-validation";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { CheckIcon, ChevronsUpDown, HelpCircle, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { GiteaIcon } from "@/components/icons/data-tools-icons";
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

interface GiteaRepository {
	name: string;
	url: string;
	id: number;
	owner: {
		username: string;
	};
}

interface GiteaBranch {
	name: string;
	commit: {
		id: string;
	};
}

const GiteaProviderSchema = z.object({
	buildPath: z.string().min(1, "application.gitea.pathRequired").default("/"),
	repository: z
		.object({
			repo: z.string().min(1, "application.gitea.repoRequired"),
			owner: z.string().min(1, "application.gitea.ownerRequired"),
		})
		.required(),
	branch: z
		.string()
		.min(1, "application.gitea.branchRequired")
		.regex(VALID_BRANCH_REGEX, "application.gitea.invalidBranchName"),
	giteaId: z.string().min(1, "application.gitea.providerRequired"),
	watchPaths: z.array(z.string()).default([]),
	enableSubmodules: z.boolean().optional(),
});

type GiteaProvider = z.infer<typeof GiteaProviderSchema>;

interface Props {
	applicationId: string;
}

export const SaveGiteaProvider = ({ applicationId }: Props) => {
	const { t } = useTranslation();
	const inputRef = useRef<HTMLInputElement>(null);
	const { data: giteaProviders } = api.gitea.giteaProviders.useQuery();
	const { data, refetch } = api.application.one.useQuery({ applicationId });

	const { mutateAsync, isPending: isSavingGiteaProvider } =
		api.application.saveGiteaProvider.useMutation();

	const form = useForm({
		defaultValues: {
			buildPath: "/",
			repository: {
				owner: "",
				repo: "",
			},
			giteaId: "",
			branch: "",
			watchPaths: [],
			enableSubmodules: false,
		},
		resolver: zodResolver(GiteaProviderSchema),
	});

	const repository = form.watch("repository");
	const giteaId = form.watch("giteaId");

	const { data: giteaUrl } = api.gitea.getGiteaUrl.useQuery(
		{ giteaId },
		{
			enabled: !!giteaId,
		},
	);

	const {
		data: repositories,
		isLoading: isLoadingRepositories,
		error,
	} = api.gitea.getGiteaRepositories.useQuery(
		{
			giteaId,
		},
		{
			enabled: !!giteaId,
		},
	);

	const {
		data: branches,
		fetchStatus,
		status,
	} = api.gitea.getGiteaBranches.useQuery(
		{
			owner: repository?.owner,
			repositoryName: repository?.repo,
			giteaId: giteaId,
		},
		{
			enabled: !!repository?.owner && !!repository?.repo && !!giteaId,
		},
	);

	useEffect(() => {
		if (data) {
			form.reset({
				branch: data.giteaBranch || "",
				repository: {
					repo: data.giteaRepository || "",
					owner: data.giteaOwner || "",
				},
				buildPath: data.giteaBuildPath || "/",
				giteaId: data.giteaId || "",
				watchPaths: data.watchPaths || [],
				enableSubmodules: data.enableSubmodules || false,
			});
		}
	}, [form.reset, data?.applicationId, form]);

	const onSubmit = async (data: GiteaProvider) => {
		await mutateAsync({
			giteaBranch: data.branch,
			giteaRepository: data.repository.repo,
			giteaOwner: data.repository.owner,
			giteaBuildPath: data.buildPath,
			giteaId: data.giteaId,
			applicationId,
			watchPaths: data.watchPaths,
			enableSubmodules: data.enableSubmodules || false,
		})
			.then(async () => {
				toast.success(t("application.gitea.saved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.gitea.saveError"));
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
							name="giteaId"
							render={({ field }) => (
								<FormItem className="md:col-span-2 flex flex-col">
									<FormLabel>{t("application.gitea.account")}</FormLabel>
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
													placeholder={t("application.gitea.selectAccount")}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{giteaProviders?.map((giteaProvider) => (
												<SelectItem
													key={giteaProvider.giteaId}
													value={giteaProvider.giteaId}
												>
													{giteaProvider.gitProvider.name}
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
										<FormLabel>{t("application.gitea.repository")}</FormLabel>
										{field.value.owner && field.value.repo && (
											<Link
												href={`${giteaUrl}/${field.value.owner}/${field.value.repo}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<GiteaIcon className="h-4 w-4" />
												<span>{t("application.gitea.viewRepository")}</span>
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
														? t("application.gitea.selectRepository")
														: isLoadingRepositories
															? t("application.gitea.loading")
															: (repositories?.find(
																	(repo: GiteaRepository) =>
																		repo.name === field.value.repo &&
																		repo.owner.username === field.value.owner,
																)?.name ??
																t("application.gitea.selectRepository"))}

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
													placeholder={t("application.gitea.searchRepository")}
													className="h-9"
												/>
												{!giteaId ? (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("application.gitea.selectAccountFirst")}
													</span>
												) : isLoadingRepositories ? (
													<span className="py-6 text-center text-sm">
														{t("application.gitea.loadingRepositories")}
													</span>
												) : null}
												<CommandEmpty>
													{t("application.gitea.noRepositories")}
												</CommandEmpty>
												<ScrollArea className="h-96">
													<CommandGroup>
														{repositories && repositories.length === 0 && (
															<CommandEmpty>
																{t("application.gitea.noRepositories")}
															</CommandEmpty>
														)}
														{repositories?.map((repo: GiteaRepository) => {
															return (
																<CommandItem
																	value={`${repo.owner.username}/${repo.name}`}
																	key={repo.url}
																	onSelect={() => {
																		form.setValue("repository", {
																			owner: repo.owner.username as string,
																			repo: repo.name,
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
																			repo.name === field.value.repo &&
																				repo.owner.username ===
																					field.value.owner
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
											{t("application.gitea.repoRequired")}
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
									<FormLabel>{t("application.gitea.branch")}</FormLabel>
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
														? t("application.gitea.loading")
														: field.value
															? branches?.find(
																	(branch: GiteaBranch) =>
																		branch.name === field.value,
																)?.name
															: t("application.gitea.selectBranch")}
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
													placeholder={t("application.gitea.searchBranch")}
													className="h-9"
												/>
												{status === "pending" && fetchStatus === "fetching" && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("application.gitea.loadingBranches")}
													</span>
												)}
												{!repository?.owner && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("application.gitea.selectRepositoryFirst")}
													</span>
												)}
												<ScrollArea className="h-96">
													<CommandEmpty>
														{t("application.gitea.noBranches")}
													</CommandEmpty>

													<CommandGroup>
														{branches && branches.length === 0 && (
															<CommandItem>
																{t("application.gitea.noBranches")}
															</CommandItem>
														)}
														{branches?.map((branch: GiteaBranch) => (
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
							name="buildPath"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("application.gitea.buildPath")}</FormLabel>
									<FormControl>
										<Input placeholder="/" {...field} />
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
										<FormLabel>{t("application.gitea.watchPaths")}</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
												</TooltipTrigger>
												<TooltipContent>
													<p>{t("application.gitea.watchPathsTooltip")}</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</div>
									<div className="flex flex-wrap gap-2 mb-2">
										{field.value?.map((path: string, index: number) => (
											<Badge
												key={index}
												variant="secondary"
												className="flex items-center gap-1"
											>
												{path}
												<button
													type="button"
													aria-label={t("application.gitea.removeWatchPath")}
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
												placeholder={t(
													"application.gitea.watchPathPlaceholder",
												)}
												ref={inputRef}
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
												const input = inputRef.current;
												const path = input?.value.trim();
												if (path) {
													field.onChange([...(field.value || []), path]);
													if (input) input.value = "";
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
								<FormItem className="flex flex-row items-center space-x-2 space-y-0">
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<FormLabel>
										{t("application.gitea.enableSubmodules")}
									</FormLabel>
								</FormItem>
							)}
						/>
					</div>
					<div className="flex w-full justify-end">
						<Button
							isLoading={isSavingGiteaProvider}
							type="submit"
							className="w-fit"
						>
							{t("application.gitea.save")}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
