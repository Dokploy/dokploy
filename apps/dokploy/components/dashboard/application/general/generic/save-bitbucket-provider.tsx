import { VALID_BRANCH_REGEX } from "@dokploy/server/utils/git-branch-validation";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { CheckIcon, ChevronsUpDown, HelpCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { BitbucketIcon } from "@/components/icons/data-tools-icons";
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

const BitbucketProviderSchema = z.object({
	buildPath: z
		.string()
		.min(1, "application.bitbucket.pathRequired")
		.default("/"),
	repository: z
		.object({
			repo: z.string().min(1, "application.bitbucket.repoRequired"),
			owner: z.string().min(1, "application.bitbucket.ownerRequired"),
			slug: z.string().optional(),
		})
		.required(),
	branch: z
		.string()
		.min(1, "application.bitbucket.branchRequired")
		.regex(VALID_BRANCH_REGEX, "application.bitbucket.invalidBranchName"),
	bitbucketId: z.string().min(1, "application.bitbucket.providerRequired"),
	watchPaths: z.array(z.string()).optional(),
	enableSubmodules: z.boolean().optional(),
});

type BitbucketProvider = z.infer<typeof BitbucketProviderSchema>;

interface Props {
	applicationId: string;
}

export const SaveBitbucketProvider = ({ applicationId }: Props) => {
	const { t } = useTranslation();
	const { data: bitbucketProviders } =
		api.bitbucket.bitbucketProviders.useQuery();
	const { data, refetch } = api.application.one.useQuery({ applicationId });

	const { mutateAsync, isPending: isSavingBitbucketProvider } =
		api.application.saveBitbucketProvider.useMutation();

	const form = useForm({
		defaultValues: {
			buildPath: "/",
			repository: {
				owner: "",
				repo: "",
				slug: "",
			},
			bitbucketId: "",
			branch: "",
			watchPaths: [],
			enableSubmodules: false,
		},
		resolver: zodResolver(BitbucketProviderSchema),
	});

	const repository = form.watch("repository");
	const bitbucketId = form.watch("bitbucketId");

	const {
		data: repositories,
		isLoading: isLoadingRepositories,
		error,
	} = api.bitbucket.getBitbucketRepositories.useQuery(
		{
			bitbucketId,
		},
		{
			enabled: !!bitbucketId,
		},
	);

	const {
		data: branches,
		fetchStatus,
		status,
	} = api.bitbucket.getBitbucketBranches.useQuery(
		{
			owner: repository?.owner,
			repo: repository?.slug || repository?.repo || "",
			bitbucketId,
		},
		{
			enabled:
				!!repository?.owner &&
				!!(repository?.slug || repository?.repo) &&
				!!bitbucketId,
		},
	);

	useEffect(() => {
		if (data) {
			form.reset({
				branch: data.bitbucketBranch || "",
				repository: {
					repo: data.bitbucketRepository || "",
					owner: data.bitbucketOwner || "",
					slug: data.bitbucketRepositorySlug || "",
				},
				buildPath: data.bitbucketBuildPath || "/",
				bitbucketId: data.bitbucketId || "",
				watchPaths: data.watchPaths || [],
				enableSubmodules: data.enableSubmodules || false,
			});
		}
	}, [form.reset, data?.applicationId, form]);

	const onSubmit = async (data: BitbucketProvider) => {
		await mutateAsync({
			bitbucketBranch: data.branch,
			bitbucketRepository: data.repository.repo,
			bitbucketRepositorySlug: data.repository.slug || data.repository.repo,
			bitbucketOwner: data.repository.owner,
			bitbucketBuildPath: data.buildPath,
			bitbucketId: data.bitbucketId,
			applicationId,
			watchPaths: data.watchPaths || [],
			enableSubmodules: data.enableSubmodules || false,
		})
			.then(async () => {
				toast.success(t("application.bitbucket.saved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.bitbucket.saveError"));
			});
	};

	return (
		<div>
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="grid w-full gap-4 py-3"
				>
					{error && (
						<AlertBlock type="error">Repositories: {error.message}</AlertBlock>
					)}
					<div className="grid md:grid-cols-2 gap-4">
						<FormField
							control={form.control}
							name="bitbucketId"
							render={({ field }) => (
								<FormItem className="md:col-span-2 flex flex-col">
									<FormLabel>
										{t("application.bitbucket.account")}
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
												slug: "",
											});
											form.setValue("branch", "");
										}}
										value={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("application.bitbucket.selectAccount")}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{bitbucketProviders?.map((bitbucketProvider) => (
												<SelectItem
													key={bitbucketProvider.bitbucketId}
													value={bitbucketProvider.bitbucketId}
												>
													{bitbucketProvider.gitProvider.name}
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
											{t("application.bitbucket.repository")}
										</FormLabel>
										{field.value.owner && field.value.repo && (
											<Link
												href={`https://bitbucket.org/${field.value.owner}/${field.value.slug || field.value.repo}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
											>
												<BitbucketIcon className="h-4 w-4" />
												<span>
													{t("application.bitbucket.viewRepository")}
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
														? t("application.bitbucket.selectRepository")
														: isLoadingRepositories
															? t("application.bitbucket.loading")
															: (repositories?.find(
																	(repo) =>
																		repo.name === field.value.repo &&
																		repo.owner.username === field.value.owner,
																)?.name ?? t("application.bitbucket.selectRepository"))}

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
													placeholder={t("application.bitbucket.searchRepository")}
													className="h-9"
												/>
												{!bitbucketId ? (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("application.bitbucket.selectAccountFirst")}
													</span>
												) : isLoadingRepositories ? (
													<span className="py-6 text-center text-sm">
														{t("application.bitbucket.loadingRepositories")}
													</span>
												) : null}
												<CommandEmpty>
													{t("application.bitbucket.noRepositories")}
												</CommandEmpty>
												<ScrollArea className="h-96">
													<CommandGroup>
														{repositories?.map((repo) => (
															<CommandItem
																value={`${repo.owner.username}/${repo.name}`}
																key={repo.url}
																onSelect={() => {
																	form.setValue("repository", {
																		owner: repo.owner.username as string,
																		repo: repo.name,
																		slug: repo.slug,
																	});
																	form.setValue("branch", "");
																}}
															>
																<span className="flex min-w-0 items-center gap-2">
																	<span className="truncate">{repo.name}</span>
																	<span className="text-muted-foreground text-xs">
																		{repo.owner.username}
																	</span>
																</span>
																<CheckIcon
																	className={cn(
																		"ml-auto h-4 w-4",
																		repo.name === field.value.repo &&
																			repo.owner.username === field.value.owner
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
												{t("application.bitbucket.repoRequired")}
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
									<FormLabel>{t("application.bitbucket.branch")}</FormLabel>
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
														? t("application.bitbucket.loading")
														: field.value
															? branches?.find(
																	(branch) => branch.name === field.value,
																)?.name
															: t("application.bitbucket.selectBranch")}
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
													placeholder={t("application.bitbucket.searchBranch")}
													className="h-9"
												/>
												{status === "pending" && fetchStatus === "fetching" && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("application.bitbucket.loadingBranches")}
													</span>
												)}
												{!repository?.owner && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														{t("application.bitbucket.selectRepositoryFirst")}
													</span>
												)}
												<ScrollArea className="h-96">
													<CommandEmpty>
														{t("application.bitbucket.noBranches")}
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
									<FormLabel>{t("application.bitbucket.buildPath")}</FormLabel>
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
										<FormLabel>
											{t("application.bitbucket.watchPaths")}
										</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
												</TooltipTrigger>
												<TooltipContent>
													<p>
														{t("application.bitbucket.watchPathsTooltip")}
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
														aria-label={t("application.bitbucket.removeWatchPath")}
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
												placeholder={t(
													"application.bitbucket.watchPathPlaceholder",
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
													variant="secondary"
													onClick={() => {
														const input = document.querySelector(
															`input[placeholder="${t("application.bitbucket.watchPathPlaceholder")}"]`,
														) as HTMLInputElement;
													const value = input.value.trim();
													if (value) {
														const newPaths = [...(field.value || []), value];
														form.setValue("watchPaths", newPaths);
														input.value = "";
													}
												}}
											>
												{t("application.bitbucket.add")}
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
									<FormLabel>
										{t("application.bitbucket.enableSubmodules")}
									</FormLabel>
								</FormItem>
							)}
						/>
					</div>
					<div className="flex w-full justify-end">
						<Button
							isLoading={isSavingBitbucketProvider}
							type="submit"
							className="w-fit"
							>
								{t("application.bitbucket.save")}
							</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
