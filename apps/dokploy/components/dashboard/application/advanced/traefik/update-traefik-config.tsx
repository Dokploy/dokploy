import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { parse, stringify, YAMLParseError } from "yaml";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

const UpdateTraefikConfigSchema = z.object({
	traefikConfig: z.string(),
});

type UpdateTraefikConfig = z.infer<typeof UpdateTraefikConfigSchema>;

interface Props {
	applicationId: string;
}

export const validateAndFormatYAML = (yamlText: string) => {
	try {
		const obj = parse(yamlText);
		const formattedYaml = stringify(obj, { indent: 4 });
		return { valid: true, formattedYaml, error: null };
	} catch (error) {
		if (error instanceof YAMLParseError) {
			return {
				valid: false,
				formattedYaml: yamlText,
				error: error.message,
			};
		}
		return {
			valid: false,
			formattedYaml: yamlText,
			error: "An unexpected error occurred while processing the YAML.",
		};
	}
};

export const UpdateTraefikConfig = ({ applicationId }: Props) => {
	const [open, setOpen] = useState(false);
	const [skipYamlValidation, setSkipYamlValidation] = useState(false);
	const { data, refetch } = api.application.readTraefikConfig.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const { mutateAsync, isPending, error, isError } =
		api.application.updateTraefikConfig.useMutation();

	const form = useForm<UpdateTraefikConfig>({
		defaultValues: {
			traefikConfig: "",
		},
		resolver: zodResolver(UpdateTraefikConfigSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				traefikConfig: data || "",
			});
		}
	}, [data]);

	const onSubmit = async (data: UpdateTraefikConfig) => {
		if (!skipYamlValidation) {
			const { valid, error } = validateAndFormatYAML(data.traefikConfig);
			if (!valid) {
				form.setError("traefikConfig", {
					type: "manual",
					message: (error as string) || "Invalid YAML",
				});
				return;
			}
		}
		form.clearErrors("traefikConfig");
		await mutateAsync({
			applicationId,
			traefikConfig: data.traefikConfig,
		})
			.then(async () => {
				toast.success("Traefik config Updated");
				refetch();
				setOpen(false);
				form.reset();
			})
			.catch(() => {
				toast.error("Error updating the Traefik config");
			});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(open) => {
				setOpen(open);
				if (!open) {
					form.reset();
					setSkipYamlValidation(false);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button isLoading={isPending}>Modify</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Update traefik config</DialogTitle>
					<DialogDescription>Update the traefik config</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-update-traefik-config"
						onSubmit={form.handleSubmit(onSubmit)}
						className="w-full space-y-4 overflow-auto"
					>
						<div className="flex flex-col">
							<FormField
								control={form.control}
								name="traefikConfig"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Traefik config</FormLabel>
										<FormControl>
											<CodeEditor
												lineWrapping
												wrapperClassName="h-[35rem] font-mono"
												placeholder={`http:
routers:
    router-name:
        rule: Host('domain.com')
        service: container-name
        entryPoints:
            - web
        tls: false
        middlewares: []
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
						</div>
					</form>

					<DialogFooter className="flex-col sm:flex-row gap-4">
						<div className="flex flex-col gap-1 w-full sm:w-auto sm:mr-auto">
							<div className="flex items-center space-x-2">
								<Checkbox
									id="skip-yaml-validation-app"
									checked={skipYamlValidation}
									onCheckedChange={(checked) =>
										setSkipYamlValidation(checked === true)
									}
								/>
								<Label
									htmlFor="skip-yaml-validation-app"
									className="text-sm font-normal cursor-pointer"
								>
									Skip YAML validation (for Go templating)
								</Label>
							</div>
							<p className="text-sm text-muted-foreground">
								Check to save configs with Go templating (e.g.{" "}
								<code className="text-xs">{"{{range}}"}</code>).
							</p>
						</div>
						<Button
							isLoading={isPending}
							form="hook-form-update-traefik-config"
							type="submit"
						>
							Update
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
