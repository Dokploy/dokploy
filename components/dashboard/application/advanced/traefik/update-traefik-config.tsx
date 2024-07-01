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
import { AlertBlock } from "@/components/shared/alert-block";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import jsyaml from "js-yaml";
import { CodeEditor } from "@/components/shared/code-editor";

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
	const [isOpen, setIsOpen] = useState(false);
	const { data, isLoading, refetch } = api.application.readTraefikConfig.useQuery(
		{ applicationId },
		{ enabled: isOpen },
	);

	const { mutateAsync, error, isError } =
		api.application.updateTraefikConfig.useMutation();

	const form = useForm<UpdateTraefikConfig>({
		defaultValues: {
			traefikConfig: "",
		},
		resolver: zodResolver(UpdateTraefikConfigSchema),
	});

	useEffect(() => {
		if (data && isOpen) {
			form.reset({
				traefikConfig: data || "",
			});
		}
	}, [data, isOpen, form.reset]);

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
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error to update the traefik config");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button isLoading={isLoading}>Modify</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle className="flex items-center space-x-2">
						<div>Update traefik config</div>
						{isLoading && (
							<Loader2 className="inline-block w-4 h-4 animate-spin" />
						)}
					</DialogTitle>
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
							isLoading={form.formState.isSubmitting}
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
