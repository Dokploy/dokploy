import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Toggle } from "@/components/ui/toggle";
import { api } from "@/utils/api";
import type { ServiceType } from "../advanced/show-resources";

const addEnvironmentSchema = z.object({
	environment: z.string(),
});

type EnvironmentSchema = z.infer<typeof addEnvironmentSchema>;

interface Props {
	id: string;
	type: Exclude<ServiceType | "compose", "application">;
}

export const ShowEnvironment = ({ id, type }: Props) => {
	const queryMap = {
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
		compose: () =>
			api.compose.one.useQuery({ composeId: id }, { enabled: !!id }),
	};
	const { data, refetch } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });
	const [isEnvVisible, setIsEnvVisible] = useState(true);

	const mutationMap = {
		postgres: () => api.postgres.update.useMutation(),
		redis: () => api.redis.update.useMutation(),
		mysql: () => api.mysql.update.useMutation(),
		mariadb: () => api.mariadb.update.useMutation(),
		mongo: () => api.mongo.update.useMutation(),
		compose: () => api.compose.update.useMutation(),
	};
	const { mutateAsync, isLoading } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.update.useMutation();

	const form = useForm<EnvironmentSchema>({
		defaultValues: {
			environment: "",
		},
		resolver: zodResolver(addEnvironmentSchema),
	});

	// Watch form value
	const currentEnvironment = form.watch("environment");
	const hasChanges = currentEnvironment !== (data?.env || "");

	useEffect(() => {
		if (data) {
			form.reset({
				environment: data.env || "",
			});
		}
	}, [data, form]);

	const onSubmit = async (formData: EnvironmentSchema) => {
		mutateAsync({
			mongoId: id || "",
			postgresId: id || "",
			redisId: id || "",
			mysqlId: id || "",
			mariadbId: id || "",
			composeId: id || "",
			env: formData.environment,
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
			environment: data?.env || "",
		});
	};

	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader className="flex flex-row w-full items-center justify-between">
					<div>
						<CardTitle className="text-xl">Environment Settings</CardTitle>
						<CardDescription>
							You can add environment variables to your resource.
							{hasChanges && (
								<span className="text-yellow-500 ml-2">
									(You have unsaved changes)
								</span>
							)}
						</CardDescription>
					</div>

					<Toggle
						aria-label="Toggle bold"
						pressed={isEnvVisible}
						onPressedChange={setIsEnvVisible}
					>
						{isEnvVisible ? (
							<EyeOffIcon className="h-4 w-4 text-muted-foreground" />
						) : (
							<EyeIcon className="h-4 w-4 text-muted-foreground" />
						)}
					</Toggle>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form
							id="hook-form"
							onSubmit={form.handleSubmit(onSubmit)}
							className="w-full space-y-4"
						>
							<FormField
								control={form.control}
								name="environment"
								render={({ field }) => (
									<FormItem>
										<FormControl className="">
											<CodeEditor
												style={
													{
														WebkitTextSecurity: isEnvVisible ? "disc" : null,
													} as CSSProperties
												}
												language="properties"
												disabled={isEnvVisible}
												className="font-mono"
												wrapperClassName="compose-file-editor"
												placeholder={`NODE_ENV=production
PORT=3000
														`}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="flex flex-row justify-end gap-2">
								{hasChanges && (
									<Button
										type="button"
										variant="outline"
										onClick={handleCancel}
									>
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
				</CardContent>
			</Card>
		</div>
	);
};
