import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
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
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canWrite = permissions?.envVars.write ?? false;
	const queryMap = {
		compose: () =>
			api.compose.one.useQuery({ composeId: id }, { enabled: !!id }),
		libsql: () => api.libsql.one.useQuery({ libsqlId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
	};
	const { data, refetch } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });
	const [isEnvVisible, setIsEnvVisible] = useState(true);
	const [revealedEnvironment, setRevealedEnvironment] = useState<string | null>(
		null,
	);

	const mutationMap = {
		compose: () => api.compose.saveEnvironment.useMutation(),
		libsql: () => api.libsql.saveEnvironment.useMutation(),
		mariadb: () => api.mariadb.saveEnvironment.useMutation(),
		mongo: () => api.mongo.saveEnvironment.useMutation(),
		mysql: () => api.mysql.saveEnvironment.useMutation(),
		postgres: () => api.postgres.saveEnvironment.useMutation(),
		redis: () => api.redis.saveEnvironment.useMutation(),
	};
	const { mutateAsync, isPending } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.saveEnvironment.useMutation();
	const revealMutationMap = {
		compose: () => api.compose.revealEnvironment.useMutation(),
		libsql: () => api.libsql.revealEnvironment.useMutation(),
		mariadb: () => api.mariadb.revealEnvironment.useMutation(),
		mongo: () => api.mongo.revealEnvironment.useMutation(),
		mysql: () => api.mysql.revealEnvironment.useMutation(),
		postgres: () => api.postgres.revealEnvironment.useMutation(),
		redis: () => api.redis.revealEnvironment.useMutation(),
	};
	const { mutateAsync: revealEnvironment, isPending: isRevealingEnvironment } =
		revealMutationMap[type]
			? revealMutationMap[type]()
			: api.mongo.revealEnvironment.useMutation();

	const form = useForm<EnvironmentSchema>({
		defaultValues: {
			environment: "",
		},
		resolver: zodResolver(addEnvironmentSchema),
	});

	// Watch form value
	const currentEnvironment = form.watch("environment");
	const baselineEnvironment = revealedEnvironment ?? data?.env ?? "";
	const hasChanges = currentEnvironment !== baselineEnvironment;

	useEffect(() => {
		if (data) {
			setRevealedEnvironment(null);
			form.reset({
				environment: data.env || "",
			});
		}
	}, [data, form]);

	const onSubmit = async (formData: EnvironmentSchema) => {
		mutateAsync({
			composeId: id || "",
			libsqlId: id || "",
			mariadbId: id || "",
			mongoId: id || "",
			mysqlId: id || "",
			postgresId: id || "",
			redisId: id || "",
			env: formData.environment,
		})
			.then(async () => {
				toast.success("Environments Added");
				setRevealedEnvironment(null);
				await refetch();
			})
			.catch(() => {
				toast.error("Error adding environment");
			});
	};

	const handleCancel = () => {
		form.reset({
			environment: baselineEnvironment,
		});
	};

	const handleReveal = async () => {
		if (revealedEnvironment !== null) {
			return;
		}
		if (hasChanges) {
			toast.error("Save or cancel changes before revealing environment");
			throw new Error("Unsaved environment changes");
		}

		try {
			const values = await revealEnvironment({
				composeId: id || "",
				libsqlId: id || "",
				mariadbId: id || "",
				mongoId: id || "",
				mysqlId: id || "",
				postgresId: id || "",
				redisId: id || "",
			});
			setRevealedEnvironment(values.env);
			form.reset({
				environment: values.env,
			});
		} catch (error) {
			toast.error("Error revealing environment");
			throw error;
		}
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
						aria-label="Toggle secret visibility"
						pressed={isEnvVisible}
						onPressedChange={async (pressed: boolean) => {
							if (!pressed) {
								try {
									await handleReveal();
								} catch {
									return;
								}
							}
							setIsEnvVisible(pressed);
						}}
						disabled={isRevealingEnvironment}
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

							{canWrite && (
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
										isLoading={isPending}
										className="w-fit"
										type="submit"
										disabled={!hasChanges}
									>
										Save
									</Button>
								</div>
							)}
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
};
