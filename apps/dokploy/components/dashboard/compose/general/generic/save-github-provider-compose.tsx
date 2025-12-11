import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, ChevronsUpDown, HelpCircle, X } from "lucide-react";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useEffect, useRef } from "react";
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

const createGithubProviderSchema = (t: (key: string) => string) =>
	z.object({
		composePath: z
			.string()
			.min(1, {
				message: t("compose.git.validation.composePathRequired"),
			}),
		repository: z
			.object({
				repo: z.string().min(1, {
					message: t("compose.git.validation.repoRequired"),
				}),
				owner: z.string().min(1, {
					message: t("compose.git.validation.ownerRequired"),
				}),
			})
			.required(),
		branch: z.string().min(1, {
			message: t("compose.git.validation.branchRequired"),
		}),
		githubId: z.string().min(1, {
			message: t("compose.git.validation.providerRequired"),
		}),
		watchPaths: z.array(z.string()).optional(),
		triggerType: z.enum(["push", "tag"]).default("push"),
		enableSubmodules: z.boolean().default(false),
	});

type GithubProvider = z.infer<ReturnType<typeof createGithubProviderSchema>>;

interface Props {
	composeId: string;
}

export const SaveGithubProviderCompose = ({ composeId }: Props) => {
	const { t } = useTranslation("common");
	const watchPathInputRef = useRef<HTMLInputElement | null>(null);
	const { data: githubProviders } = api.github.githubProviders.useQuery();
	const { data, refetch } = api.compose.one.useQuery({ composeId });

	const { mutateAsync, isLoading: isSavingGithubProvider } =
		api.compose.update.useMutation();

	const schema = createGithubProviderSchema(t);
	const form = useForm<GithubProvider>({
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
		resolver: zodResolver(schema),
	});

	const repository = form.watch("repository");
	const githubId = form.watch("githubId");
	const triggerType = form.watch("triggerType");
	const { data: repositories, isLoading: isLoadingRepositories } =
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
	}, [form.reset, data?.composeId, form]);

	const onSubmit = async (data: GithubProvider) => {
		await mutateAsync({
			branch: data.branch,
			repository: data.repository.repo,
			composeId,
			owner: data.repository.owner,
			composePath: data.composePath,
			githubId: data.githubId,
			sourceType: "github",
			composeStatus: "idle",
			watchPaths: data.watchPaths,
			enableSubmodules: data.enableSubmodules,
			triggerType: data.triggerType,
		})
			.then(async () => {
				toast.success(t("application.git.toast.saveSuccess"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.git.toast.saveError"));
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
									<FormLabel>{t("compose.git.github.form.githubAccountLabel")}</FormLabel>
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
													placeholder={t(
														"compose.git.github.form.githubAccountPlaceholder",
													)}
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
										<FormLabel>{t("compose.git.github.form.repositoryLabel")}</FormLabel>
										{field.value.owner && field.value.repo && (
											<Link
												href={`https://github.com/${field.value.owner}/${field.value.repo}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<GithubIcon className="h-4 w-4" />
												<span>{t("compose.git.github.form.viewRepositoryLink")}</span>
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
														? t("compose.git.github.state.loadingRepositories")
														: field.value.owner
															? repositories?.find(
																	(repo) => repo.name === field.value.repo,
																)?.name
															: t(
																	"compose.git.github.form.repositorySelectPlaceholder",
																)}

													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t(
														"compose.git.github.form.repositorySearchPlaceholder",
													)}
													className="h-9"
												/>
												{isLoadingRepositories && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("compose.git.github.state.loadingRepositories")}
													</span>
												)}
												<CommandEmpty>
													{t("compose.git.github.state.noRepositories")}
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
										{form.formState.errors.repository && (
											<p className={cn("text-sm font-medium text-destructive")}>
												{t("compose.git.github.validation.repositoryRequired")}
											</p>
										)}
									</Popover>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="branch"
							render={({ field }) => (
								<FormItem className="block w-full">
									<FormLabel>{t("compose.git.github.form.branchLabel")}</FormLabel>
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
														? t("compose.git.github.state.loadingBranches")
														: field.value
															? branches?.find(
																	(branch) => branch.name === field.value,
																)?.name
															: t(
																	"compose.git.github.form.branchSelectPlaceholder",
																)}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t(
														"compose.git.github.form.branchSearchPlaceholder",
													)}
													className="h-9"
												/>
												{status === "loading" && fetchStatus === "fetching" && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("compose.git.github.state.loadingBranches")}
													</span>
												)}
												{!repository?.owner && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("compose.git.github.form.repositorySelectFirst")}
													</span>
												)}
												<CommandEmpty>
													{t("compose.git.github.state.noBranches")}
												</CommandEmpty>
												<ScrollArea className="h-96">
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
									<FormLabel>{t("compose.git.form.composePathLabel")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("compose.git.form.composePathPlaceholder")}
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
									<div className="flex items-center gap-2">
										<FormLabel>{t("compose.git.github.form.triggerTypeLabel")}</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
												</TooltipTrigger>
												<TooltipContent>
													<p>{t("compose.git.github.form.triggerTypeTooltip")}</p>
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
													placeholder={t(
														"compose.git.github.form.triggerTypePlaceholder",
													)}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="push">
												{t("compose.git.github.form.triggerType.push")}
											</SelectItem>
											<SelectItem value="tag">
												{t("compose.git.github.form.triggerType.tag")}
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
												{t("application.git.watchPathsLabel")}
											</FormLabel>
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger>
														<div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
															?
														</div>
													</TooltipTrigger>
													<TooltipContent>
														<p>{t("application.git.watchPathsTooltip")}</p>
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
													placeholder={t("application.git.watchPathsPlaceholder")}
													ref={watchPathInputRef}
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
														const input = watchPathInputRef.current;
														if (!input) return;
														const value = input.value.trim();
														if (value) {
															const newPaths = [...(field.value || []), value];
															form.setValue("watchPaths", newPaths);
															input.value = "";
														}
													}}
												>
													{t("application.git.button.addWatchPath")}
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
								<FormItem className="flex items-center space-x-2">
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<FormLabel className="!mt-0">
										{t("application.git.enableSubmodulesLabel")}
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
							{t("button.save")}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
