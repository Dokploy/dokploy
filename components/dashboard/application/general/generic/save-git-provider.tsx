import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import copy from "copy-to-clipboard";
import { CopyIcon, LockIcon } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const GitProviderSchema = z.object({
	repositoryURL: z.string().min(1, {
		message: "Repository URL is required",
	}),
	branch: z.string().min(1, "Branch required"),
	buildPath: z.string().min(1, "Build Path required"),
});

type GitProvider = z.infer<typeof GitProviderSchema>;

interface Props {
	applicationId: string;
}

export const SaveGitProvider = ({ applicationId }: Props) => {
	const { data, refetch } = api.application.one.useQuery({ applicationId });

	const { mutateAsync, isLoading } =
		api.application.saveGitProdiver.useMutation();
	const { mutateAsync: generateSSHKey, isLoading: isGeneratingSSHKey } =
		api.application.generateSSHKey.useMutation();

	const { mutateAsync: removeSSHKey, isLoading: isRemovingSSHKey } =
		api.application.removeSSHKey.useMutation();
	const form = useForm<GitProvider>({
		defaultValues: {
			branch: "",
			buildPath: "/",
			repositoryURL: "",
		},
		resolver: zodResolver(GitProviderSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				branch: data.customGitBranch || "",
				buildPath: data.customGitBuildPath || "/",
				repositoryURL: data.customGitUrl || "",
			});
		}
	}, [form.reset, data, form]);

	const onSubmit = async (values: GitProvider) => {
		await mutateAsync({
			customGitBranch: values.branch,
			customGitBuildPath: values.buildPath,
			customGitUrl: values.repositoryURL,
			applicationId,
		})
			.then(async () => {
				toast.success("Git Provider Saved");
				await refetch();
			})
			.catch(() => {
				toast.error("Error to save the Git provider");
			});
	};

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="flex flex-col gap-4"
			>
				<div className="grid md:grid-cols-2 gap-4 ">
					<div className="md:col-span-2 space-y-4">
						<FormField
							control={form.control}
							name="repositoryURL"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex flex-row justify-between">
										Repository URL
										<div className="flex gap-2">
											<Dialog>
												<DialogTrigger className="flex flex-row gap-2">
													<LockIcon className="size-4 text-muted-foreground" />?
												</DialogTrigger>
												<DialogContent className="sm:max-w-[425px]">
													<DialogHeader>
														<DialogTitle>Private Repository</DialogTitle>
														<DialogDescription>
															If your repository is private is necessary to
															generate SSH Keys to add to your git provider.
														</DialogDescription>
													</DialogHeader>
													<div className="grid gap-4 py-4">
														<div className="relative">
															<Textarea
																placeholder="Please click on Generate SSH Key"
																className="no-scrollbar h-64 text-muted-foreground"
																disabled={!data?.customGitSSHKey}
																contentEditable={false}
																value={
																	data?.customGitSSHKey ||
																	"Please click on Generate SSH Key"
																}
															/>
															<button
																type="button"
																className="absolute right-2 top-2"
																onClick={() => {
																	copy(
																		data?.customGitSSHKey ||
																			"Generate a SSH Key",
																	);
																	toast.success("SSH Copied to clipboard");
																}}
															>
																<CopyIcon className="size-4" />
															</button>
														</div>
													</div>
													<DialogFooter className="flex sm:justify-between gap-3.5 flex-col sm:flex-col w-full">
														<div className="flex flex-row gap-2 w-full justify-between flex-wrap">
															{data?.customGitSSHKey && (
																<Button
																	variant="destructive"
																	isLoading={
																		isGeneratingSSHKey || isRemovingSSHKey
																	}
																	className="max-sm:w-full"
																	onClick={async () => {
																		await removeSSHKey({
																			applicationId,
																		})
																			.then(async () => {
																				toast.success("SSH Key Removed");
																				await refetch();
																			})
																			.catch(() => {
																				toast.error(
																					"Error to remove the SSH Key",
																				);
																			});
																	}}
																	type="button"
																>
																	Remove SSH Key
																</Button>
															)}

															<Button
																isLoading={
																	isGeneratingSSHKey || isRemovingSSHKey
																}
																className="max-sm:w-full"
																onClick={async () => {
																	await generateSSHKey({
																		applicationId,
																	})
																		.then(async () => {
																			toast.success("SSH Key Generated");
																			await refetch();
																		})
																		.catch(() => {
																			toast.error(
																				"Error to generate the SSH Key",
																			);
																		});
																}}
																type="button"
															>
																Generate SSH Key
															</Button>
														</div>
														<span className="text-sm text-muted-foreground">
															Is recommended to remove the SSH Key if you want
															to deploy a public repository.
														</span>
													</DialogFooter>
												</DialogContent>
											</Dialog>
										</div>
									</FormLabel>
									<FormControl>
										<Input placeholder="git@bitbucket.org" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
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
					<div className="space-y-4">
						<FormField
							control={form.control}
							name="buildPath"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Build Path</FormLabel>
									<FormControl>
										<Input placeholder="/" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
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
