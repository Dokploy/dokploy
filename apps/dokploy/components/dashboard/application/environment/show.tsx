import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Secrets } from "@/components/ui/secrets";
import { Badge } from "@/components/ui/badge";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
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

	// Fetch service links for this application
	const { data: serviceLinks } = api.serviceLinks.list.useQuery({
		sourceServiceId: applicationId,
		sourceServiceType: "application",
	});

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
					)}
					<div className="flex flex-row justify-end gap-2">
						{hasChanges && (
							<Button type="button" variant="outline" onClick={handleCancel}>
								Cancel
							</Button>
						)}
						<Button
							isLoading={isLoading}
							className="w-fit"
							type="submit"
							disabled={!hasChanges}
						>
							Save
						</Button>
					</div>
				</form>
			</Form>

			{/* Service Links Environment Variables */}
			{serviceLinks && serviceLinks.length > 0 && (
				<div className="mt-6 pt-6 border-t">
					<div className="flex items-center gap-2 mb-3">
						<ExternalLink className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">Service Links</h3>
						<Badge variant="secondary" className="text-xs">
							{serviceLinks.length}
						</Badge>
					</div>
					<p className="text-sm text-muted-foreground mb-4">
						These environment variables are automatically injected from your service links:
					</p>
					<div className="space-y-2">
						{serviceLinks.map((link) => (
							<div
								key={link.serviceLinkId}
								className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
							>
								<div className="flex-1">
									<code className="text-sm font-mono">
										{link.envVariableName}
									</code>
									<div className="text-xs text-muted-foreground mt-1">
										From {link.targetService?.name || "Unknown Service"} • {link.attribute}
									</div>
								</div>
								<div className="text-xs text-muted-foreground">
									Auto-injected
								</div>
							</div>
						))}
					</div>
					<div className="mt-3 text-xs text-muted-foreground">
						💡 These variables are resolved automatically during deployment. 
						Go to the Service Links tab to manage these connections.
					</div>
				</div>
			)}
		</Card>
	);
};
