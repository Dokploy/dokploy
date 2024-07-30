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
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const GithubProviderSchema = z.object({
	composePath: z.string().min(1),
	repository: z
		.object({
			repo: z.string().min(1, "Repo is required"),
			owner: z.string().min(1, "Owner is required"),
		})
		.required(),
	branch: z.string().min(1, "Branch is required"),
});

type GithubProvider = z.infer<typeof GithubProviderSchema>;

interface Props {
	composeId: string;
}

export const SaveGithubProviderCompose = ({ composeId }: Props) => {
	const { data, refetch } = api.compose.one.useQuery({ composeId });

	const { mutateAsync, isLoading: isSavingGithubProvider } =
		api.compose.update.useMutation();

	const form = useForm<GithubProvider>({
		defaultValues: {
			composePath: "./docker-compose.yml",
			repository: {
				owner: "",
				repo: "",
			},
			branch: "",
		},
		resolver: zodResolver(GithubProviderSchema),
	});

	const repository = form.watch("repository");

	const { data: repositories, isLoading: isLoadingRepositories } =
		api.admin.getRepositories.useQuery();

	const {
		data: branches,
		fetchStatus,
		status,
	} = api.admin.getBranches.useQuery(
		{
			owner: repository?.owner,
			repo: repository?.repo,
		},
		{ enabled: !!repository?.owner && !!repository?.repo },
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
			});
		}
	}, [form.reset, data, form]);

	const onSubmit = async (data: GithubProvider) => {
		console.log(data);
		await mutateAsync({
			branch: data.branch,
			repository: data.repository.repo,
			composeId: composeId,
			owner: data.repository.owner,
			sourceType: "github",
			composePath: data.composePath,
		})
			.then(async () => {
				toast.success("Service Provided Saved");
				await refetch();
			})
			.catch(() => {
				toast.error("Error to save the github provider");
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
							name="repository"
							render={({ field }) => (
								<FormItem className="md:col-span-2 flex flex-col">
									<FormLabel>Repository</FormLabel>
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													role="combobox"
													className={cn(
														"w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													{isLoadingRepositories
														? "Loading...."
														: field.value.owner
															? repositories?.find(
																	(repo) => repo.name === field.value.repo,
																)?.name
															: "Select repository"}

													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder="Search repository..."
													className="h-9"
												/>
												{isLoadingRepositories && (
													<span className="py-6 text-center text-sm">
														Loading Repositories....
													</span>
												)}
												<CommandEmpty>No repositories found.</CommandEmpty>
												<ScrollArea className="h-96">
													<CommandGroup>
														{repositories?.map((repo) => (
															<CommandItem
																value={repo.url}
																key={repo.url}
																onSelect={() => {
																	form.setValue("repository", {
																		owner: repo.owner.login as string,
																		repo: repo.name,
																	});
																	form.setValue("branch", "");
																}}
															>
																{repo.name}
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
											Repository is required
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
									<FormLabel>Branch</FormLabel>
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													role="combobox"
													className={cn(
														" w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													{status === "loading" && fetchStatus === "fetching"
														? "Loading...."
														: field.value
															? branches?.find(
																	(branch) => branch.name === field.value,
																)?.name
															: "Select branch"}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder="Search branch..."
													className="h-9"
												/>
												{status === "loading" && fetchStatus === "fetching" && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														Loading Branches....
													</span>
												)}
												{!repository?.owner && (
													<span className="py-6 text-center text-sm text-muted-foreground">
														Select a repository
													</span>
												)}
												<ScrollArea className="h-96">
													<CommandEmpty>No branch found.</CommandEmpty>

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
									<FormLabel>Compose Path</FormLabel>
									<FormControl>
										<Input placeholder="docker-compose.yml" {...field} />
									</FormControl>

									<FormMessage />
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
							Save
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
