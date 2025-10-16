import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import CryptoJS from "crypto-js";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
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
	const [isSecureMode, setIsSecureMode] = useState(false);
	// For storing original decrypted values when in secure mode
	const [originalEnv, setOriginalEnv] = useState("");

	// Get the appropriate mutation based on service type
	const postgresMutation = api.postgres.update.useMutation();
	const redisMutation = api.redis.update.useMutation();
	const mysqlMutation = api.mysql.update.useMutation();
	const mariadbMutation = api.mariadb.update.useMutation();
	const mongoMutation = api.mongo.update.useMutation();
	const composeMutation = api.compose.update.useMutation();

	// Get the appropriate loading state based on service type
	const getLoadingState = () => {
		switch (type) {
			case "postgres":
				return postgresMutation.isLoading;
			case "redis":
				return redisMutation.isLoading;
			case "mysql":
				return mysqlMutation.isLoading;
			case "mariadb":
				return mariadbMutation.isLoading;
			case "mongo":
				return mongoMutation.isLoading;
			case "compose":
				return composeMutation.isLoading;
			default:
				return mongoMutation.isLoading;
		}
	};

	const isLoading = getLoadingState();

	const form = useForm<EnvironmentSchema>({
		defaultValues: {
			environment: "",
		},
		resolver: zodResolver(addEnvironmentSchema),
	});

	const currentEnvironment = form.watch("environment");

	// Determine if there are unsaved changes
	// When in secure mode, compare with original values instead of encrypted display values
	const hasChanges = isSecureMode
		? data?.env !== originalEnv
		: data?.env !== currentEnvironment;

	useEffect(() => {
		if (data) {
			// If this is a compose resource and it's secured
			if (
				type === "compose" &&
				"is_secured" in data &&
				data.is_secured === true
			) {
				setIsSecureMode(true);
				setOriginalEnv(data.env || "");
				// For display, we'll show the encrypted form
				const encryptedValue = encryptEnvironmentValues(data.env || "");
				form.reset({
					environment: encryptedValue,
				});
			} else {
				setIsSecureMode(false);
				setOriginalEnv("");
				form.reset({
					environment: data.env || "",
				});
			}
		}
	}, [data, form, type]);

	const SECRET_KEY = "my-secret-key"; // you can move this to .env if needed

	// Encrypt only values (right side of '=')
	const encryptEnvironmentValues = (envString: string) => {
		if (!envString) return "";
		const lines = envString.split("\n");
		return lines
			.map((line) => {
				if (!line.includes("=")) return line;
				const equalIndex = line.indexOf("=");
				const key = line.substring(0, equalIndex);
				const value = line.substring(equalIndex + 1);
				const encryptedValue = CryptoJS.AES.encrypt(
					value.trim(),
					SECRET_KEY,
				).toString();
				// Ensure the encrypted value is not trimmed
				return `${key}=${encryptedValue}`;
			})
			.join("\n");
	};

	// Decrypt encrypted environment values
	const decryptEnvironmentValues = (envString: string) => {
		if (!envString) return "";
		const lines = envString.split("\n");
		return lines
			.map((line: string) => {
				if (!line.includes("=")) return line;
				const equalIndex = line.indexOf("=");
				const key = line.substring(0, equalIndex);
				const value = line.substring(equalIndex + 1);
				try {
					const decryptedBytes = CryptoJS.AES.decrypt(value.trim(), SECRET_KEY);
					const decryptedValue = decryptedBytes.toString(CryptoJS.enc.Utf8);
					// Only return decrypted if not empty; else, use original
					return decryptedValue
						? `${key}=${decryptedValue}`
						: `${key}=${value.trim()}`;
				} catch (error) {
					return `${key}=${value.trim()}`;
				}
			})
			.join("\n");
	};

	const handleSecureClick = async () => {
		try {
			const currentFormValues = form.getValues("environment");

			if (type === "compose") {
				await composeMutation.mutateAsync({
					composeId: id,
					is_secured: !isSecureMode,
				});
			} else {
				// For other service types, we don't support secure mode
				toast.error("Secure mode is not supported for this service type");
				return;
			}

			setIsSecureMode(!isSecureMode);

			if (!isSecureMode) {
				// Store the current unencrypted values before enabling secure mode
				setOriginalEnv(currentFormValues);
				// Update the form with encrypted values for display only
				form.setValue(
					"environment",
					encryptEnvironmentValues(currentFormValues),
					{ shouldDirty: false },
				);
			} else {
				// If turning off secure mode, restore the original unencrypted values
				form.setValue("environment", originalEnv || "", { shouldDirty: false });
			}

			toast.success(
				`Secure mode ${!isSecureMode ? "enabled" : "disabled"} successfully`,
			);
			await refetch();
		} catch (error) {
			console.error("Error toggling secure mode:", error);
			toast.error("Failed to toggle secure mode");
		}
	};

	const onSubmit = async (formData: EnvironmentSchema) => {
		let envToSave = formData.environment;
		if (isSecureMode) {
			// Always decrypt the form values if in secure mode
			envToSave = decryptEnvironmentValues(envToSave);
			// Update originalEnv with the decrypted values
			setOriginalEnv(envToSave);
		}
		// Determine if this is a secured environment from the database
		const isSecuredFromDB =
			type === "compose" &&
			data &&
			"is_secured" in data &&
			data.is_secured === true;

		try {
			// Use the appropriate mutation based on service type
			switch (type) {
				case "postgres":
					await postgresMutation.mutateAsync({
						postgresId: id,
						env: envToSave,
					});
					break;
				case "redis":
					await redisMutation.mutateAsync({ redisId: id, env: envToSave });
					break;
				case "mysql":
					await mysqlMutation.mutateAsync({ mysqlId: id, env: envToSave });
					break;
				case "mariadb":
					await mariadbMutation.mutateAsync({ mariadbId: id, env: envToSave });
					break;
				case "mongo":
					await mongoMutation.mutateAsync({ mongoId: id, env: envToSave });
					break;
				case "compose":
					await composeMutation.mutateAsync({
						composeId: id,
						env: envToSave,
						is_secured: isSecuredFromDB || isSecureMode,
					});
					break;
				default:
					throw new Error(`Unsupported service type: ${type}`);
			}

			toast.success("Environments Updated");
			// After saving, if in secure mode, update the form with encrypted values
			if (isSecureMode || isSecuredFromDB) {
				const encrypted = encryptEnvironmentValues(envToSave);
				form.setValue("environment", encrypted, { shouldDirty: false });
			}
			await refetch();
		} catch (error) {
			console.error("Save error:", error);
			toast.error("Error updating environment");
		}
	};

	const handleCancel = () => {
		if (
			type === "compose" &&
			data &&
			"is_secured" in data &&
			data.is_secured === true
		) {
			// If the data was already secured, maintain that state
			const encryptedValue = encryptEnvironmentValues(data.env || "");
			form.reset({
				environment: encryptedValue,
			});
			setIsSecureMode(true);
			setOriginalEnv(data.env || "");
		} else {
			form.reset({
				environment: data?.env || "",
			});
			setIsSecureMode(false);
		}
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
							{type === "compose" &&
								data &&
								"is_secured" in data &&
								data.is_secured === true && (
									<span className="text-green-500 ml-2">
										(Using Secured Environment)
									</span>
								)}
						</CardDescription>
					</div>

					<div className="flex items-center gap-2">
						<Toggle
							aria-label="Toggle visibility"
							pressed={isEnvVisible}
							onPressedChange={setIsEnvVisible}
						>
							{isEnvVisible ? (
								<EyeOffIcon className="h-4 w-4 text-muted-foreground" />
							) : (
								<EyeIcon className="h-4 w-4 text-muted-foreground" />
							)}
						</Toggle>

						{/* Show toggle for compose type */}
						{type === "compose" && (
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Toggle
											aria-label="Encrypt values"
											pressed={isSecureMode}
											onPressedChange={handleSecureClick}
											disabled={
												data && "is_secured" in data && data.is_secured === true
											}
										>
											{isSecureMode ? (
												<LockIcon
													className={`h-4 w-4 ${data && "is_secured" in data && data.is_secured === true ? "text-green-600" : "text-green-500"}`}
												/>
											) : (
												<UnlockIcon className="h-4 w-4 text-muted-foreground" />
											)}
										</Toggle>
									</TooltipTrigger>
									{data && "is_secured" in data && data.is_secured === true && (
										<TooltipContent>
											<p>Environment is secured and cannot be toggled off</p>
										</TooltipContent>
									)}
								</Tooltip>
							</TooltipProvider>
						)}
					</div>
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
										<FormControl>
											<CodeEditor
												style={
													{
														WebkitTextSecurity: isEnvVisible ? "disc" : null,
													} as CSSProperties
												}
												language="properties"
												disabled={isEnvVisible}
												className={`font-mono ${isSecureMode ? "bg-green-50" : ""}`}
												wrapperClassName="compose-file-editor"
												placeholder={`NODE_ENV=production
PORT=3000`}
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
									disabled={!hasChanges && !isSecureMode}
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
