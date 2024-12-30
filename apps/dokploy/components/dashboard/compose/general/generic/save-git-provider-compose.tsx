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
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon, LockIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const GitProviderSchema = z.object({
	composePath: z.string().min(1),
	repositoryURL: z.string().min(1, {
		message: "Repository URL is required",
	}),
	branch: z.string().min(1, "Branch required"),
	sshKey: z.string().optional(),
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
										<FormLabel className="flex flex-row justify-between">
											Repository URL
										</FormLabel>
										<FormControl>
											<Input placeholder="git@bitbucket.org" {...field} />
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
