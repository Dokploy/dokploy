import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon, LockIcon, X } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { GitIcon } from "@/components/icons/data-tools-icons";
import Link from "next/link";

const GitProviderSchema = z.object({
	composePath: z.string().min(1),
	repositoryURL: z.string().min(1, {
		message: "Repository URL is required",
	}),
	branch: z.string().min(1, "Branch required"),
	sshKey: z.string().optional(),
	watchPaths: z.array(z.string()).optional(),
});

type GitProvider = z.infer<typeof GitProviderSchema>;

interface Props {
	composeId: string;
}

export const SaveGitProviderCompose = ({ composeId }: Props) => {
	const { data, refetch } = api.compose.one.useQuery({ composeId });
	const { data: sshKeys } = api.sshKey.all.useQuery();
	const router = useRouter();

	const { mutateAsync, isLoading } = api.compose.update.useMutation();

	const form = useForm<GitProvider>({
		defaultValues: {
			branch: "",
			repositoryURL: "",
			composePath: "./docker-compose.yml",
			sshKey: undefined,
			watchPaths: [],
		},
		resolver: zodResolver(GitProviderSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				sshKey: data.customGitSSHKeyId || undefined,
				branch: data.customGitBranch || "",
				repositoryURL: data.customGitUrl || "",
				composePath: data.composePath,
				watchPaths: data.watchPaths || [],
			});
		}
	}, [form.reset, data, form]);

	const onSubmit = async (values: GitProvider) => {
		await mutateAsync({
			customGitBranch: values.branch,
			customGitUrl: values.repositoryURL,
			customGitSSHKeyId: values.sshKey === "none" ? null : values.sshKey,
			composeId,
			sourceType: "git",
			composePath: values.composePath,
			composeStatus: "idle",
			watchPaths: values.watchPaths || [],
		})
			.then(async () => {
				toast.success("Git Provider Saved");
				await refetch();
			})
			.catch(() => {
				toast.error("Error saving the Git provider");
			});
	};

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="flex flex-col gap-4"
			>
				<div className="grid md:grid-cols-2 gap-4 ">
					<div className="flex items-end col-span-2 gap-4">
						<div className="grow">
							<FormField
								control={form.control}
								name="repositoryURL"
								render={({ field }) => (
									<FormItem>
										<div className="flex items-center justify-between">
											<FormLabel>Repository URL</FormLabel>
											{field.value?.startsWith("https://") && (
												<Link
													href={field.value}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
												>
													<GitIcon className="h-4 w-4" />
													<span>View Repository</span>
												</Link>
											)}
										</div>
										<FormControl>
											<Input placeholder="Repository URL" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						{sshKeys && sshKeys.length > 0 ? (
							<FormField
								control={form.control}
								name="sshKey"
								render={({ field }) => (
									<FormItem className="basis-40">
										<FormLabel className="w-full inline-flex justify-between">
											SSH Key
											<LockIcon className="size-4 text-muted-foreground" />
										</FormLabel>
										<FormControl>
											<Select
												key={field.value}
												onValueChange={field.onChange}
												defaultValue={field.value}
												value={field.value}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select a key" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{sshKeys?.map((sshKey) => (
															<SelectItem
																key={sshKey.sshKeyId}
																value={sshKey.sshKeyId}
															>
																{sshKey.name}
															</SelectItem>
														))}
														<SelectItem value="none">None</SelectItem>
														<SelectLabel>Keys ({sshKeys?.length})</SelectLabel>
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>
									</FormItem>
								)}
							/>
						) : (
							<Button
								variant="secondary"
								onClick={() => router.push("/dashboard/settings/ssh-keys")}
								type="button"
							>
								<KeyRoundIcon className="size-4" /> Add SSH Key
							</Button>
						)}
					</div>
					<div className="space-y-4">
						<FormField
							control={form.control}
							name="branch"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Branch</FormLabel>
									<FormControl>
										<Input placeholder="Branch" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

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
					<FormField
						control={form.control}
						name="watchPaths"
						render={({ field }) => (
							<FormItem className="md:col-span-2">
								<div className="flex items-center gap-2">
									<FormLabel>Watch Paths</FormLabel>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger>
												<div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
													?
												</div>
											</TooltipTrigger>
											<TooltipContent className="max-w-[300px]">
												<p>
													Add paths to watch for changes. When files in these
													paths change, a new deployment will be triggered. This
													will work only when manual webhook is setup.
												</p>
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
											placeholder="Enter a path to watch (e.g., src/*, dist/*)"
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
													'input[placeholder="Enter a path to watch (e.g., src/*, dist/*)"]',
												) as HTMLInputElement;
												const value = input.value.trim();
												if (value) {
													const newPaths = [...(field.value || []), value];
													form.setValue("watchPaths", newPaths);
													input.value = "";
												}
											}}
										>
											Add
										</Button>
									</div>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<div className="flex flex-row justify-end">
					<Button type="submit" className="w-fit" isLoading={isLoading}>
						Save{" "}
					</Button>
				</div>
			</form>
		</Form>
	);
};
