import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Secrets } from "@/components/ui/secrets";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addEnvironmentSchema = z.object({
	env: z.string(),
	buildArgs: z.string(),
});

type EnvironmentSchema = z.infer<typeof addEnvironmentSchema>;

interface Props {
	applicationId: string;
}

export const ShowEnvironment = ({ applicationId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { mutateAsync, isLoading } =
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
		},
		resolver: zodResolver(addEnvironmentSchema),
	});

	// Watch form values
	const currentEnv = form.watch("env");
	const currentBuildArgs = form.watch("buildArgs");
	const hasChanges =
		currentEnv !== (data?.env || "") ||
		currentBuildArgs !== (data?.buildArgs || "");

	useEffect(() => {
		if (data) {
			form.reset({
				env: data.env || "",
				buildArgs: data.buildArgs || "",
			});
		}
	}, [data, form]);

	const onSubmit = async (formData: EnvironmentSchema) => {
		mutateAsync({
			env: formData.env,
			buildArgs: formData.buildArgs,
			applicationId,
		})
			.then(async () => {
				toast.success(t("dashboard.environment.environmentsAdded"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("dashboard.environment.errorAddingEnvironment"));
			});
	};

	const handleCancel = () => {
		form.reset({
			env: data?.env || "",
			buildArgs: data?.buildArgs || "",
		});
	};

	return (
		<Card className="bg-background px-6 pb-6">
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex w-full flex-col gap-4"
				>
					<Secrets
						name="env"
						title={t("dashboard.environment.environmentSettings")}
						description={
							<span>
								{t("dashboard.environment.environmentDescription")}
								{hasChanges && (
									<span className="text-yellow-500 ml-2">
										{t("dashboard.environment.unsavedChanges")}
									</span>
								)}
							</span>
						}
						placeholder={["NODE_ENV=production", "PORT=3000"].join("\n")}
					/>
					{data?.buildType === "dockerfile" && (
						<Secrets
							name="buildArgs"
							title={t("dashboard.environment.buildTimeVariables")}
							description={
								<span>
									{t("dashboard.environment.buildTimeDescription")}&nbsp;
									<a
										className="text-primary"
										href="https://docs.docker.com/build/guide/build-args/"
										target="_blank"
										rel="noopener noreferrer"
									>
										{t("dashboard.environment.here")}
									</a>
									.
								</span>
							}
							placeholder="NPM_TOKEN=xyz"
						/>
					)}
					<div className="flex flex-row justify-end gap-2">
						{hasChanges && (
							<Button type="button" variant="outline" onClick={handleCancel}>
								{t("dashboard.environment.cancel")}
							</Button>
						)}
						<Button
							isLoading={isLoading}
							className="w-fit"
							type="submit"
							disabled={!hasChanges}
						>
							{t("dashboard.environment.save")}
						</Button>
					</div>
				</form>
			</Form>
		</Card>
	);
};
