import { zodResolver } from "@hookform/resolvers/zod";
import jsyaml from "js-yaml";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
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
		const obj = jsyaml.load(yamlText);
		const formattedYaml = jsyaml.dump(obj, { indent: 4 });
		return { valid: true, formattedYaml, error: null };
	} catch (error) {
		if (error instanceof jsyaml.YAMLException) {
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
	const { data, refetch } = api.application.readTraefikConfig.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const { mutateAsync, isLoading, error, isError } =
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
		const { valid, error } = validateAndFormatYAML(data.traefikConfig);
		if (!valid) {
			form.setError("traefikConfig", {
				type: "manual",
				message: error || "Invalid YAML",
			});
			return;
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
				}
			}}
		>
			<DialogTrigger asChild>
				<Button isLoading={isLoading}>Modify</Button>
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

					<DialogFooter>
						<Button
							isLoading={isLoading}
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
