import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, ChevronsUpDown, HelpCircle, Plus, X } from "lucide-react";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
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

const createGiteaProviderSchema = (t: (key: string) => string) =>
	z.object({
		buildPath: z
			.string()
			.min(1, t("application.git.gitea.validation.buildPathRequired"))
			.default("/"),
		repository: z
			.object({
				repo: z
					.string()
					.min(1, t("application.git.gitea.validation.repositoryRequired")),
				owner: z
					.string()
					.min(1, t("application.git.gitea.validation.ownerRequired")),
			})
			.required(),
		branch: z
			.string()
			.min(1, t("application.git.gitea.validation.branchRequired")),
		giteaId: z
			.string()
			.min(1, t("application.git.gitea.validation.giteaIdRequired")),
		watchPaths: z.array(z.string()).default([]),
		enableSubmodules: z.boolean().optional(),
	});

type GiteaProvider = z.infer<ReturnType<typeof createGiteaProviderSchema>>;

interface Props {
	applicationId: string;
}

export const SaveGiteaProvider = ({ applicationId }: Props) => {
	const { t } = useTranslation("common");
	const { data: giteaProviders } = api.gitea.giteaProviders.useQuery();
	const { data, refetch } = api.application.one.useQuery({ applicationId });
	const watchPathInputRef = useRef<HTMLInputElement | null>(null);

	const { mutateAsync, isLoading: isSavingGiteaProvider } =
		api.application.saveGiteaProvider.useMutation();

	const schema = createGiteaProviderSchema(t);
	const form = useForm<GiteaProvider>({
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
		resolver: zodResolver(schema),
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
				toast.success(t("application.git.gitea.toast.saveSuccess"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.git.gitea.toast.saveError"));
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
									<FormLabel>
										{t("application.git.gitea.form.giteaAccountLabel")}
									</FormLabel>
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
														"application.git.gitea.form.giteaAccountPlaceholder",
													)}
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
										<FormLabel>
											{t("application.git.gitea.form.repositoryLabel")}
										</FormLabel>
										{field.value.owner && field.value.repo && (
											<Link
												href={`${giteaUrl}/${field.value.owner}/${field.value.repo}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<GiteaIcon className="h-4 w-4" />
												<span>
													{t("application.git.gitea.form.viewRepositoryLink")}
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
														"w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													{isLoadingRepositories
														? t("application.git.gitea.state.loadingRepositories")
														: field.value.owner
															? repositories?.find(
																	(repo: GiteaRepository) =>
																		repo.name === field.value.repo,
																)?.name
															: t(
																	"application.git.gitea.form.repositorySelectPlaceholder",
																)}

													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t(
														"application.git.gitea.form.repositorySearchPlaceholder",
													)}
													className="h-9"
												/>
												{isLoadingRepositories && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("application.git.gitea.state.loadingRepositories")}
													</span>
												)}
												<CommandEmpty>
													{t("application.git.gitea.state.noRepositories")}
												</CommandEmpty>
												<ScrollArea className="h-96">
													<CommandGroup>
														{repositories && repositories.length === 0 && (
															<CommandEmpty>
																{t("application.git.gitea.state.noRepositories")}
															</CommandEmpty>
														)}
														{repositories?.map((repo: GiteaRepository) => {
															return (
																<CommandItem
																	value={repo.name}
																	key={repo.url}
																	onSelect={() => {
																		form.setValue("repository", {
																			owner: repo.owner.username as string,
																			repo: repo.name,
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
																			repo.name === field.value.repo
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
											{t("application.git.gitea.validation.repositoryRequired")}
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
									<FormLabel>
										{t("application.git.gitea.form.branchLabel")}
									</FormLabel>
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
														? t("application.git.gitea.state.loadingBranches")
														: field.value
															? branches?.find(
																	(branch: GiteaBranch) =>
																		branch.name === field.value,
																)?.name
															: t(
																	"application.git.gitea.form.branchSelectPlaceholder",
																)}

													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t(
														"application.git.gitea.form.branchSearchPlaceholder",
													)}
													className="h-9"
												/>
												{status === "loading" && fetchStatus === "fetching" && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("application.git.gitea.state.loadingBranches")}
													</span>
												)}
												{!repository?.owner && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t(
															"application.git.gitea.form.repositorySelectFirst",
														)}
													</span>
												)}
												<ScrollArea className="h-96">
													<CommandEmpty>
														{t("application.git.gitea.state.noBranches")}
													</CommandEmpty>

													<CommandGroup>
														{branches && branches.length === 0 && (
															<CommandItem>
																{t("application.git.gitea.state.noBranches")}
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
									</Popover>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="buildPath"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("application.git.gitea.form.buildPathLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"application.git.gitea.form.buildPathPlaceholder",
											)}
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
										<FormLabel>
											{t("application.git.gitea.form.watchPathsLabel")}
										</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
												</TooltipTrigger>
												<TooltipContent>
													<p>
														{t("application.git.gitea.form.watchPathsTooltip")}
													</p>
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
												<X
													className="size-3 cursor-pointer hover:text-destructive"
													onClick={() => {
														const newPaths = [...field.value];
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
												placeholder={t(
													"application.git.gitea.form.watchPathsPlaceholder",
												)}
												ref={watchPathInputRef}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														e.preventDefault();
														const input = e.currentTarget;
														const path = input.value.trim();
														if (path) {
															field.onChange([...field.value, path]);
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
												const input = watchPathInputRef.current;
												if (!input) return;
												const path = input.value.trim();
												if (path) {
													field.onChange([...field.value, path]);
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
										{t("application.git.gitea.form.enableSubmodulesLabel")}
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
							{t("button.save")}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
