import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { useEnvCompletionSource } from "@/components/shared/env-autocomplete";
import { VaultImportDialog } from "@/components/shared/vault-import-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { api } from "@/utils/api";

const updateEnvironmentSchema = z.object({
	env: z.string().optional(),
});

type UpdateEnvironment = z.infer<typeof updateEnvironmentSchema>;

interface Props {
	environmentId: string;
	children?: React.ReactNode;
}

export const EnvironmentVariables = ({ environmentId, children }: Props) => {
	const { t } = useTranslation();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canRead = permissions?.environmentEnvVars.read ?? false;
	const canWrite = permissions?.environmentEnvVars.write ?? false;
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isPending } =
		api.environment.update.useMutation();
	const { data } = api.environment.one.useQuery(
		{
			environmentId,
		},
		{
			enabled: !!environmentId,
		},
	);

	const completionSource = useEnvCompletionSource({
		includeShared: false,
		projectId: data?.projectId,
		environmentId,
	});
	const form = useForm<UpdateEnvironment>({
		defaultValues: {
			env: data?.env ?? "",
		},
		resolver: zodResolver(updateEnvironmentSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				env: data.env ?? "",
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateEnvironment) => {
		await mutateAsync({
			env: formData.env || "",
			environmentId: environmentId,
		})
			.then(() => {
				toast.success(t("project.envVars.updateSuccess"));
				utils.environment.one.invalidate({ environmentId });
			})
			.catch(() => {
				toast.error(t("project.envVars.updateError"));
			})
			.finally(() => {});
	};

	// Add keyboard shortcut for Ctrl+S/Cmd+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				(e.ctrlKey || e.metaKey) &&
				e.code === "KeyS" &&
				!isPending &&
				isOpen
			) {
				e.preventDefault();
				form.handleSubmit(onSubmit)();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [form, onSubmit, isPending, isOpen]);

	if (!canRead) {
		return null;
	}

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ?? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<Terminal className="size-4" />
						<span>{t("project.envVars.menuLabel")}</span>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle>{t("project.envVars.title")}</DialogTitle>
					<DialogDescription>
						{t("project.envVars.description")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<AlertBlock type="info">
					{t("project.envVars.syntaxHint")}{" "}
					<code>API_URL=${"{{environment.API_URL}}"}</code>.{" "}
					{t("project.envVars.vaultHint")}{" "}
					<code>DB_URL=${"{{vault.<provider>.<secret>}}"}</code>
				</AlertBlock>
				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="env"
									render={({ field }) => (
										<FormItem>
											<div className="flex items-center justify-between">
												<FormLabel>{t("project.envVars.label")}</FormLabel>
												<VaultImportDialog
													projectId={data?.projectId}
													environmentId={environmentId}
													currentEnv={field.value ?? ""}
													onImport={(next) =>
														form.setValue("env", next, { shouldDirty: true })
													}
												/>
											</div>
											<FormControl>
												<CodeEditor
													completionSource={completionSource}
													lineWrapping
													language="properties"
													readOnly={!canWrite}
													wrapperClassName="h-140 font-mono"
													placeholder={`NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/mydb
API_KEY=your-api-key-here

                                                    `}
													{...field}
												/>
											</FormControl>

											<pre>
												<FormMessage />
											</pre>
										</FormItem>
									)}
								/>
								{canWrite && (
									<DialogFooter>
										<Button isLoading={isPending} type="submit">
											{t("project.form.update")}
										</Button>
									</DialogFooter>
								)}
							</form>
						</Form>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
