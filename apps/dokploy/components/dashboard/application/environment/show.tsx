import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useEnvCompletionSource } from "@/components/shared/env-autocomplete";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@/components/ui/form";
import { Secrets } from "@/components/ui/secrets";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

const addEnvironmentSchema = z.object({
	env: z.string(),
	buildArgs: z.string(),
	buildSecrets: z.string(),
	createEnvFile: z.boolean(),
});

type EnvironmentSchema = z.infer<typeof addEnvironmentSchema>;

interface Props {
	applicationId: string;
}

export const ShowEnvironment = ({ applicationId }: Props) => {
	const { t } = useTranslation();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canWrite = permissions?.envVars.write ?? false;
	const utils = api.useUtils();
	const { mutateAsync, isPending } =
		api.application.saveEnvironment.useMutation();

	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);

	const completionSource = useEnvCompletionSource({
		projectEnv: data?.environment?.project?.env,
		environmentEnv: data?.environment?.env,
		projectId: data?.environment?.projectId,
		environmentId: data?.environment?.environmentId,
	});

	const form = useForm<EnvironmentSchema>({
		defaultValues: {
			env: "",
			buildArgs: "",
			buildSecrets: "",
			createEnvFile: true,
		},
		resolver: zodResolver(addEnvironmentSchema),
	});

	// Watch form values
	const currentEnv = form.watch("env");
	const currentBuildArgs = form.watch("buildArgs");
	const currentBuildSecrets = form.watch("buildSecrets");
	const currentCreateEnvFile = form.watch("createEnvFile");
	const { isDirty } = form.formState;
	const hasChanges =
		currentEnv !== (data?.env || "") ||
		currentBuildArgs !== (data?.buildArgs || "") ||
		currentBuildSecrets !== (data?.buildSecrets || "") ||
		currentCreateEnvFile !== (data?.createEnvFile ?? true);

	// Skip reset while editing so background refetches don't wipe edits
	useEffect(() => {
		if (data && !isDirty) {
			form.reset({
				env: data.env || "",
				buildArgs: data.buildArgs || "",
				buildSecrets: data.buildSecrets || "",
				createEnvFile: data.createEnvFile ?? true,
			});
		}
	}, [data, isDirty, form]);

	const onSubmit = async (formData: EnvironmentSchema) => {
		mutateAsync({
			env: formData.env,
			buildArgs: formData.buildArgs,
			buildSecrets: formData.buildSecrets,
			createEnvFile: formData.createEnvFile,
			applicationId,
		})
			.then(async () => {
				toast.success(t("application.environment.saved"));
				// Otherwise the reset effect re-applies the pre-save cached value
				utils.application.one.setData({ applicationId }, (prev) =>
					prev ? { ...prev, ...formData } : prev,
				);
				form.reset(formData);
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.environment.saveError"));
			});
	};

	const handleCancel = () => {
		form.reset({
			env: data?.env || "",
			buildArgs: data?.buildArgs || "",
			buildSecrets: data?.buildSecrets || "",
			createEnvFile: data?.createEnvFile ?? true,
		});
	};

	// Add keyboard shortcut for Ctrl+S/Cmd+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.code === "KeyS" && !isPending) {
				e.preventDefault();
				form.handleSubmit(onSubmit)();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [form, onSubmit, isPending]);

	return (
		<Card className="bg-background px-6 pb-6">
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex w-full flex-col gap-4"
				>
					<Secrets
						name="env"
						title={t("application.environment.title")}
						description={
							<span>
								{t("application.environment.description")}
								{hasChanges && (
									<span className="text-yellow-500 ml-2">
										{t("application.environment.unsavedChanges")}
									</span>
								)}
							</span>
						}
						placeholder={["NODE_ENV=production", "PORT=3000"].join("\n")}
						completionSource={completionSource}
						projectId={data?.environment?.projectId}
						environmentId={data?.environment?.environmentId}
					/>
					{data?.buildType === "dockerfile" && (
						<Secrets
							name="buildArgs"
							title={t("application.environment.buildArgsTitle")}
							description={
								<span>
									{t("application.environment.buildArgsDescription")}&nbsp;
									<a
										className="text-primary"
										href="https://docs.docker.com/build/building/variables/"
										target="_blank"
										rel="noopener noreferrer"
									>
										{t("application.environment.documentationHere")}
									</a>
									.
								</span>
							}
							placeholder="NPM_TOKEN=xyz"
							completionSource={completionSource}
						/>
					)}
					{data?.buildType === "dockerfile" && (
						<Secrets
							name="buildSecrets"
							title={t("application.environment.buildSecretsTitle")}
							description={
								<span>
									{t("application.environment.buildSecretsDescription")}&nbsp;
									<a
										className="text-primary"
										href="https://docs.docker.com/build/building/secrets/"
										target="_blank"
										rel="noopener noreferrer"
									>
										{t("application.environment.documentationHere")}
									</a>
									.
								</span>
							}
							placeholder="NPM_TOKEN=xyz"
							completionSource={completionSource}
						/>
					)}
					{data?.buildType === "dockerfile" && (
						<FormField
							control={form.control}
							name="createEnvFile"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-xs">
									<div className="space-y-0.5">
										<FormLabel>
											{t("application.environment.createEnvFile")}
										</FormLabel>
										<FormDescription>
											{t("application.environment.createEnvFileDockerfileHint")}
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
											disabled={!canWrite}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
					)}
					{canWrite && (
						<div className="flex flex-row justify-end gap-2">
							{hasChanges && (
								<Button type="button" variant="outline" onClick={handleCancel}>
									{t("application.environment.cancel")}
								</Button>
							)}
							<Button
								isLoading={isPending}
								className="w-fit"
								type="submit"
								disabled={!hasChanges}
							>
								{t("application.environment.save")}
							</Button>
						</div>
					)}
				</form>
			</Form>
		</Card>
	);
};
