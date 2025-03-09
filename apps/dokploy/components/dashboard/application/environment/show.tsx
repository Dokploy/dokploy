import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Secrets } from "@/components/ui/secrets";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addEnvironmentSchema = z.object({
	env: z.string(),
	buildArgs: z.string(),
	buildSecrets: z.record(z.string(), z.string()),
});

type EnvironmentSchema = z.infer<typeof addEnvironmentSchema>;

interface Props {
	applicationId: string;
}

export const ShowEnvironment = ({ applicationId }: Props) => {
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
			env: data?.env || "",
			buildArgs: data?.buildArgs || "",
			buildSecrets: data?.buildSecrets || {},
		},
		resolver: zodResolver(addEnvironmentSchema),
	});

	const onSubmit = async (data: EnvironmentSchema) => {
		mutateAsync({
			env: data.env,
			buildArgs: data.buildArgs,
			buildSecrets: data.buildSecrets,
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
						description="You can add environment variables to your resource."
						placeholder={["NODE_ENV=production", "PORT=3000"].join("\n")}
					/>
					{data?.buildType === "dockerfile" && (
						<>
							<Secrets
								name="buildArgs"
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
							<Secrets
								name="buildSecrets"
								title="Build Secrets"
								description={
									<span>
										Secrets available only during build-time and not in the
										final image. See documentation&nbsp;
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
								placeholder="API_TOKEN=xyz"
								transformValue={(value) => {
									// Convert the string format to object
									const lines = value.split("\n").filter((line) => line.trim());
									return Object.fromEntries(
										lines.map((line) => {
											const [key, ...valueParts] = line.split("=");
											return [key.trim(), valueParts.join("=").trim()];
										}),
									);
								}}
								formatValue={(value) => {
									// Convert the object back to string format
									return Object.entries(value as Record<string, string>)
										.map(([key, val]) => `${key}=${val}`)
										.join("\n");
								}}
							/>
						</>
					)}
					<div className="flex flex-row justify-end">
						<Button isLoading={isLoading} className="w-fit" type="submit">
							Save
						</Button>
					</div>
				</form>
			</Form>
		</Card>
	);
};
