import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AzureDevopsIcon } from "@/components/icons/data-tools-icons";
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
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

const schema = z.object({
	azureDevopsId: z.string().min(1, "Provider is required"),
	repositoryId: z.string().min(1, "Repository is required"),
	branch: z.string().min(1, "Branch is required"),
	buildPath: z.string().min(1),
	composePath: z.string().min(1),
	enableSubmodules: z.boolean(),
});
type Values = z.infer<typeof schema>;

type Props =
	| { applicationId: string; composeId?: never }
	| { composeId: string; applicationId?: never };

export const SaveAzureDevopsProvider = (props: Props) => {
	const isCompose = !!props.composeId;
	const utils = api.useUtils();
	const { data: providers } = api.azureDevops.providers.useQuery();
	const { data: application } = api.application.one.useQuery(
		{ applicationId: props.applicationId ?? "" },
		{ enabled: !isCompose },
	);
	const { data: compose } = api.compose.one.useQuery(
		{ composeId: props.composeId ?? "" },
		{ enabled: isCompose },
	);
	const saveApplication = api.application.saveAzureDevopsProvider.useMutation();
	const saveCompose = api.compose.update.useMutation();
	const form = useForm<Values>({
		resolver: zodResolver(schema),
		defaultValues: {
			azureDevopsId: "",
			repositoryId: "",
			branch: "",
			buildPath: "/",
			composePath: "./docker-compose.yml",
			enableSubmodules: false,
		},
	});
	const azureDevopsId = form.watch("azureDevopsId");
	const repositoryId = form.watch("repositoryId");
	const { data: repositories, isPending: loadingRepositories } =
		api.azureDevops.repositories.useQuery(
			{ azureDevopsId },
			{ enabled: !!azureDevopsId },
		);
	const selectedRepository = repositories?.find(
		(repo) => repo.id === repositoryId,
	);
	const { data: branches, isPending: loadingBranches } =
		api.azureDevops.branches.useQuery(
			{
				azureDevopsId,
				projectId: selectedRepository?.project.id ?? "",
				repositoryId,
			},
			{ enabled: !!azureDevopsId && !!repositoryId && !!selectedRepository },
		);

	useEffect(() => {
		const entity = isCompose ? compose : application;
		if (!entity) return;
		form.reset({
			azureDevopsId: entity.azureDevopsId ?? "",
			repositoryId: entity.azureDevopsRepositoryId ?? "",
			branch: entity.azureDevopsBranch ?? "",
			buildPath:
				"azureDevopsBuildPath" in entity
					? (entity.azureDevopsBuildPath ?? "/")
					: "/",
			composePath:
				"composePath" in entity ? entity.composePath : "./docker-compose.yml",
			enableSubmodules: entity.enableSubmodules,
		});
	}, [application, compose, form, isCompose]);

	const onProviderChange = (value: string) => {
		form.setValue("azureDevopsId", value);
		form.setValue("repositoryId", "");
		form.setValue("branch", "");
	};
	const onRepositoryChange = (value: string) => {
		form.setValue("repositoryId", value);
		form.setValue("branch", "");
	};
	const submit = async (values: Values) => {
		const repository = repositories?.find(
			(repo) => repo.id === values.repositoryId,
		);
		if (!repository) return;
		if (isCompose) {
			await saveCompose.mutateAsync({
				composeId: props.composeId,
				azureDevopsId: values.azureDevopsId,
				azureDevopsRepositoryId: repository.id,
				azureDevopsRepository: repository.name,
				azureDevopsProjectId: repository.project.id,
				azureDevopsProject: repository.project.name,
				azureDevopsRemoteUrl: repository.remoteUrl,
				azureDevopsBranch: values.branch,
				composePath: values.composePath,
				sourceType: "azureDevops",
				composeStatus: "idle",
				enableSubmodules: values.enableSubmodules,
			});
			await utils.compose.one.invalidate({ composeId: props.composeId });
		} else {
			await saveApplication.mutateAsync({
				applicationId: props.applicationId!,
				azureDevopsId: values.azureDevopsId,
				azureDevopsRepositoryId: repository.id,
				azureDevopsRepository: repository.name,
				azureDevopsProjectId: repository.project.id,
				azureDevopsProject: repository.project.name,
				azureDevopsRemoteUrl: repository.remoteUrl,
				azureDevopsBranch: values.branch,
				azureDevopsBuildPath: values.buildPath,
				enableSubmodules: values.enableSubmodules,
			});
			await utils.application.one.invalidate({
				applicationId: props.applicationId!,
			});
		}
		toast.success("Azure DevOps repository saved successfully");
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(submit)} className="space-y-5 py-3">
				<div className="flex items-center gap-2">
					<AzureDevopsIcon className="size-5 text-[#0078d4]" />
					<span className="font-medium">Azure Repos</span>
				</div>
				<FormField
					control={form.control}
					name="azureDevopsId"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Azure DevOps account</FormLabel>
							<Select value={field.value} onValueChange={onProviderChange}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select an Azure DevOps account" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{providers?.map((provider) => (
										<SelectItem
											key={provider.azureDevopsId}
											value={provider.azureDevopsId}
										>
											{provider.gitProvider.name}
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
					name="repositoryId"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Repository</FormLabel>
							<Select
								value={field.value}
								onValueChange={onRepositoryChange}
								disabled={!azureDevopsId || loadingRepositories}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue
											placeholder={
												loadingRepositories
													? "Loading repositories..."
													: "Select a repository"
											}
										/>
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{repositories?.map((repo) => (
										<SelectItem key={repo.id} value={repo.id}>
											{repo.project.name} / {repo.name}
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
					name="branch"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Branch</FormLabel>
							<Select
								value={field.value}
								onValueChange={field.onChange}
								disabled={!repositoryId || loadingBranches}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue
											placeholder={
												loadingBranches
													? "Loading branches..."
													: "Select a branch"
											}
										/>
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{branches?.map((branch) => (
										<SelectItem key={branch.name} value={branch.name}>
											{branch.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>
				{isCompose ? (
					<FormField
						control={form.control}
						name="composePath"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Compose path</FormLabel>
								<FormControl>
									<Input {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				) : (
					<FormField
						control={form.control}
						name="buildPath"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Build path</FormLabel>
								<FormControl>
									<Input {...field} />
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
						<FormItem className="flex items-center justify-between rounded-lg border p-3">
							<FormLabel>Initialize Git submodules</FormLabel>
							<FormControl>
								<Switch
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
						</FormItem>
					)}
				/>
				<Button
					type="submit"
					isLoading={saveApplication.isPending || saveCompose.isPending}
				>
					Save
				</Button>
			</form>
		</Form>
	);
};
