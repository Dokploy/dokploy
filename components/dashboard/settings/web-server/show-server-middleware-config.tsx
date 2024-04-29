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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { validateAndFormatYAML } from "../../application/advanced/traefik/update-traefik-config";

const UpdateServerMiddlewareConfigSchema = z.object({
	traefikConfig: z.string(),
});

type UpdateServerMiddlewareConfig = z.infer<
	typeof UpdateServerMiddlewareConfigSchema
>;

interface Props {
	children?: React.ReactNode;
}

export const ShowServerMiddlewareConfig = ({ children }: Props) => {
	const { data, refetch } = api.settings.readMiddlewareTraefikConfig.useQuery();
	const [canEdit, setCanEdit] = useState(true);

	const { mutateAsync, isLoading, error, isError } =
		api.settings.updateMiddlewareTraefikConfig.useMutation();

	const form = useForm<UpdateServerMiddlewareConfig>({
		defaultValues: {
			traefikConfig: "",
		},
		disabled: canEdit,
		resolver: zodResolver(UpdateServerMiddlewareConfigSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				traefikConfig: data || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: UpdateServerMiddlewareConfig) => {
		const { valid, error } = validateAndFormatYAML(data.traefikConfig);
		console.log(error);
		if (!valid) {
			form.setError("traefikConfig", {
				type: "manual",
				message: error || "Invalid YAML",
			});
			return;
		}
		form.clearErrors("traefikConfig");
		await mutateAsync({
			traefikConfig: data.traefikConfig,
		})
			.then(async () => {
				toast.success("Middleware config Updated");
				refetch();
			})
			.catch(() => {
				toast.error("Error to update the middleware traefik config");
			});
	};

	return (
		<Dialog>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Update Middleware config</DialogTitle>
					<DialogDescription>Update the middleware config</DialogDescription>
				</DialogHeader>
				{isError && (
					<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{error?.message}
						</span>
					</div>
				)}

				<Form {...form}>
					<form
						id="hook-form-update-server-traefik-config"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full py-4 relative"
					>
						<div className="flex flex-col">
							<FormField
								control={form.control}
								name="traefikConfig"
								render={({ field }) => (
									<FormItem className="relative">
										<FormLabel>Traefik config</FormLabel>
										<FormControl>
											<Textarea
												className="h-[35rem]"
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
										<div className="flex justify-end absolute z-50 right-6 top-10">
											<Button
												type="button"
												onClick={async () => {
													setCanEdit(!canEdit);
												}}
											>
												{canEdit ? "Unlock" : "Lock"}
											</Button>
										</div>
									</FormItem>
								)}
							/>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={isLoading}
							disabled={canEdit}
							form="hook-form-update-server-traefik-config"
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
