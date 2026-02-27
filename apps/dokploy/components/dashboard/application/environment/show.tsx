import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	const hasChanges =
		currentEnv !== (data?.env || "") ||
		currentBuildArgs !== (data?.buildArgs || "") ||
		currentBuildSecrets !== (data?.buildSecrets || "") ||
		currentCreateEnvFile !== (data?.createEnvFile ?? true);

	useEffect(() => {
		if (data) {
			form.reset({
				env: data.env || "",
				buildArgs: data.buildArgs || "",
				buildSecrets: data.buildSecrets || "",
				createEnvFile: data.createEnvFile ?? true,
			});
		}
	}, [data, form]);

	const onSubmit = async (formData: EnvironmentSchema) => {
		mutateAsync({
			env: formData.env,
			buildArgs: formData.buildArgs,
			buildSecrets: formData.buildSecrets,
			createEnvFile: formData.createEnvFile,
			applicationId,
		})
			.then(async () => {
				toast.success("Environments Added");
				await refetch();
			})
			.catch(() => {
				toast.error("Error adding environment");
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
			if ((e.ctrlKey || e.metaKey) && e.key === "s" && !isPending) {
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
						title="Environment Settings"
						description={
							<span>
								You can add environment variables to your resource.
								{hasChanges && (
									<span className="text-yellow-500 ml-2">
										(You have unsaved changes)
									</span>
								)}
							</span>
						}
						placeholder={["NODE_ENV=production", "PORT=3000"].join("\n")}
					/>
					{data?.buildType === "dockerfile" && (
						<Secrets
							name="buildArgs"
							title="Build-time Arguments"
							description={
								<span>
									Arguments are available only at build-time. See
									documentation&nbsp;
									<a
										className="text-primary"
										href="https://docs.docker.com/build/building/variables/"
										target="_blank"
										rel="noopener noreferrer"
									>
										here
									</a>
									.
								</span>
							}
							placeholder="NPM_TOKEN=xyz"
						/>
					)}
					{data?.buildType === "dockerfile" && (
						<Secrets
							name="buildSecrets"
							title="Build-time Secrets"
							description={
								<span>
									Secrets are specially designed for sensitive information and
									are only available at build-time. See documentation&nbsp;
									<a
										className="text-primary"
										href="https://docs.docker.com/build/building/secrets/"
										target="_blank"
										rel="noopener noreferrer"
									>
										here
									</a>
									.
								</span>
							}
							placeholder="NPM_TOKEN=xyz"
						/>
					)}
					{data?.buildType === "dockerfile" && (
						<FormField
							control={form.control}
							name="createEnvFile"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Create Environment File</FormLabel>
										<FormDescription>
											When enabled, an .env file will be created in the same
											directory as your Dockerfile during the build process.
											Disable this if you don't want to generate an environment
											file.
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
					)}
					<div className="flex flex-row justify-end gap-2">
						{hasChanges && (
							<Button type="button" variant="outline" onClick={handleCancel}>
								Cancel
							</Button>
						)}
						<Button
							isLoading={isPending}
							className="w-fit"
							type="submit"
							disabled={!hasChanges}
						>
							Save
						</Button>
					</div>
				</form>
			</Form>
		</Card>
	);
};
