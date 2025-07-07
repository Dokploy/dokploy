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
import type { Repository } from "@/utils/gitea-utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, ChevronsUpDown, Plus, X } from "lucide-react";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const createGiteaProviderSchema = (t: any) =>
	z.object({
		composePath: z.string().min(1),
		repository: z
			.object({
				repo: z.string().min(1, t("dashboard.compose.repoRequired")),
				owner: z.string().min(1, t("dashboard.compose.ownerRequired")),
			})
			.required(),
		branch: z.string().min(1, t("dashboard.compose.branchRequired")),
		giteaId: z.string().min(1, t("dashboard.compose.giteaProviderRequired")),
		watchPaths: z.array(z.string()).optional(),
		enableSubmodules: z.boolean().default(false),
	});

type GiteaProvider = z.infer<ReturnType<typeof createGiteaProviderSchema>>;

interface Props {
	composeId: string;
}

export const SaveGiteaProviderCompose = ({ composeId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data: giteaProviders } = api.gitea.giteaProviders.useQuery();
	const { data, refetch } = api.compose.one.useQuery({ composeId });
	const { mutateAsync, isLoading: isSavingGiteaProvider } =
		api.compose.update.useMutation();

	const form = useForm<GiteaProvider>({
		defaultValues: {
			composePath: "./docker-compose.yml",
			repository: {
				owner: "",
				repo: "",
			},
			giteaId: "",
			branch: "",
			watchPaths: [],
			enableSubmodules: false,
		},
		resolver: zodResolver(createGiteaProviderSchema(t)),
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
	} = api.gitea.getGiteaRepositories.useQuery<Repository[]>(
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
				composePath: data.composePath || "./docker-compose.yml",
				giteaId: data.giteaId || "",
				watchPaths: data.watchPaths || [],
				enableSubmodules: data.enableSubmodules ?? false,
			});
		}
	}, [form.reset, data?.composeId, form]);

	const onSubmit = async (data: GiteaProvider) => {
		await mutateAsync({
			giteaBranch: data.branch,
			giteaRepository: data.repository.repo,
			giteaOwner: data.repository.owner,
			composePath: data.composePath,
			giteaId: data.giteaId,
			composeId,
			sourceType: "gitea",
			composeStatus: "idle",
			watchPaths: data.watchPaths,
			enableSubmodules: data.enableSubmodules,
		} as any)
			.then(async () => {
				toast.success(t("dashboard.compose.giteaProviderSaved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("dashboard.compose.errorSavingGiteaProvider"));
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
									<FormLabel>{t("dashboard.compose.giteaAccount")}</FormLabel>
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
														"dashboard.compose.selectGiteaAccount",
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
										<FormLabel>{t("dashboard.compose.repository")}</FormLabel>
										{field.value.owner && field.value.repo && (
											<Link
												href={`${giteaUrl}/${field.value.owner}/${field.value.repo}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<GiteaIcon className="h-4 w-4" />
												<span>{t("dashboard.compose.viewRepository")}</span>
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
														? t("dashboard.compose.loading")
														: field.value.owner
															? repositories?.find(
																	(repo) => repo.name === field.value.repo,
																)?.name
															: t("dashboard.compose.selectRepository")}

													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t("dashboard.compose.searchRepository")}
													className="h-9"
												/>
												{isLoadingRepositories && (
													<span className="py-6 text-center text-sm">
														{t("dashboard.compose.loadingRepositories")}
													</span>
												)}
												<CommandEmpty>
													{t("dashboard.compose.noRepositoriesFound")}
												</CommandEmpty>
												<ScrollArea className="h-96">
													<CommandGroup>
														{repositories?.map((repo) => (
															<CommandItem
																key={repo.url}
																value={repo.name}
																onSelect={() => {
																	form.setValue("repository", {
																		owner: repo.owner.username,
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
														))}
													</CommandGroup>
												</ScrollArea>
											</Command>
										</PopoverContent>
									</Popover>
									{form.formState.errors.repository && (
										<p className={cn("text-sm font-medium text-destructive")}>
											{t("dashboard.compose.repositoryRequired")}
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
									<FormLabel>{t("dashboard.compose.branch")}</FormLabel>
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
													{status === "loading" && fetchStatus === "fetching"
														? t("dashboard.compose.loading")
														: field.value
															? branches?.find(
																	(branch) => branch.name === field.value,
																)?.name
															: t("dashboard.compose.selectBranch")}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t("dashboard.compose.searchBranches")}
													className="h-9"
												/>
												<CommandEmpty>
													{t("dashboard.compose.noBranchesFound")}
												</CommandEmpty>
												<ScrollArea className="h-96">
													<CommandGroup>
														{branches?.map((branch) => (
															<CommandItem
																key={branch.name}
																value={branch.name}
																onSelect={() =>
																	form.setValue("branch", branch.name)
																}
															>
																<span className="flex items-center gap-2">
																	{branch.name}
																</span>
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
									{form.formState.errors.branch && (
										<p className={cn("text-sm font-medium text-destructive")}>
											{t("dashboard.compose.branchRequired")}
										</p>
									)}
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="composePath"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("dashboard.compose.composePath")}</FormLabel>
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
										<FormLabel>{t("dashboard.compose.watchPaths")}</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger>
													<div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
														?
													</div>
												</TooltipTrigger>
												<TooltipContent>
													<p>{t("dashboard.compose.watchPathsTooltip")}</p>
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
												placeholder={t(
													"dashboard.compose.watchPathsInputPlaceholder",
												)}
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
												variant="outline"
												size="icon"
												onClick={() => {
													const input = document.querySelector(
														`input[placeholder*="${t(
															"dashboard.compose.watchPathsInputPlaceholder",
														)}"]`,
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
									<FormLabel className="!mt-0">
										{t("dashboard.compose.enableSubmodules")}
									</FormLabel>
								</FormItem>
							)}
						/>
					</div>

					<div className="flex justify-end">
						<Button type="submit" isLoading={isSavingGiteaProvider}>
							{t("dashboard.compose.save")}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
