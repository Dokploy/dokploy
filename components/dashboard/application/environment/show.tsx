import { Form } from "@/components/ui/form";
import { Secrets } from "@/components/ui/secrets";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addEnvironmentSchema = z.object({
	env: z.string(),
});

type EnvironmentSchema = z.infer<typeof addEnvironmentSchema>;

const addBuildArgsSchema = z.object({
	buildArgs: z.string(),
});

type BuildArgsSchema = z.infer<typeof addBuildArgsSchema>;

interface Props {
	applicationId: string;
}

export const ShowEnvironment = ({ applicationId }: Props) => {
	const saveEnvironmentMutation = api.application.saveEnvironment.useMutation();
	const saveBuildArgsMutation = api.application.saveBuildArgs.useMutation();

	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);

	const envForm = useForm<EnvironmentSchema>({
		defaultValues: {
			env: data?.env || "",
		},
		resolver: zodResolver(addEnvironmentSchema),
	});

	const buildArgsForm = useForm<BuildArgsSchema>({
		defaultValues: {
			buildArgs: data?.buildArgs || "",
		},
		resolver: zodResolver(addBuildArgsSchema),
	});

	const onEnvSubmit = async (data: EnvironmentSchema) => {
		saveEnvironmentMutation
			.mutateAsync({
				env: data.env,
				applicationId,
			})
			.then(async () => {
				toast.success("Environments Added");
				await refetch();
			})
			.catch(() => {
				toast.error("Error to add environment");
			});
	};

	const onBuildArgsSubmit = async (data: BuildArgsSchema) => {
		saveBuildArgsMutation
			.mutateAsync({
				buildArgs: data.buildArgs,
				applicationId,
			})
			.then(async () => {
				toast.success("Buildargs Added");
				await refetch();
			})
			.catch(() => {
				toast.error("Error to add build-args");
			});
	};

	return (
		<div className="flex w-full flex-col gap-5 ">
			<Form {...envForm}>
				<form onSubmit={envForm.handleSubmit(onEnvSubmit)}>
					<Secrets
						name="env"
						isLoading={saveEnvironmentMutation.isLoading}
						title="Environment Settings"
						description="You can add environment variables to your resource."
						placeholder={["NODE_ENV=production", "PORT=3000"].join("\n")}
					/>
				</form>
			</Form>
			<Form {...buildArgsForm}>
				<form onSubmit={buildArgsForm.handleSubmit(onBuildArgsSubmit)}>
					<Secrets
						name="buildArgs"
						isLoading={saveBuildArgsMutation.isLoading}
						title="Build-time Variables"
						description={
							<span>
								Available only at build-time. See documentation&nbsp;
								<a
									className="text-primary"
									href="https://docs.docker.com/build/guide/build-args/"
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
				</form>
			</Form>
		</div>
	);
};
