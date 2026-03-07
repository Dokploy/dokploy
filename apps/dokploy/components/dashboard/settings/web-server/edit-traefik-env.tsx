import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
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
import { useHealthCheckAfterMutation } from "@/hooks/use-health-check-after-mutation";
import { api } from "@/utils/api";

const schema = z.object({
	env: z.string(),
});

type Schema = z.infer<typeof schema>;

interface Props {
	children?: React.ReactNode;
	serverId?: string;
}

export const EditTraefikEnv = ({ children, serverId }: Props) => {
	const [canEdit, setCanEdit] = useState(true);

	const { data } = api.settings.readTraefikEnv.useQuery({
		serverId,
	});

	const { mutateAsync, isPending, error, isError } =
		api.settings.writeTraefikEnv.useMutation();

	const {
		execute: executeWithHealthCheck,
		isExecuting: isHealthCheckExecuting,
	} = useHealthCheckAfterMutation({
		initialDelay: 5000,
		successMessage: "Traefik Env Updated",
	});

	const form = useForm<Schema>({
		defaultValues: {
			env: data || "",
		},
		disabled: canEdit,
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				env: data || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: Schema) => {
		try {
			await executeWithHealthCheck(() =>
				mutateAsync({
					env: data.env,
					serverId,
				}),
			);
		} catch {
			toast.error("Error updating the Traefik env");
		}
	};

	// Add keyboard shortcut for Ctrl+S/Cmd+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "s" && !isPending && !canEdit) {
				e.preventDefault();
				form.handleSubmit(onSubmit)();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [form, onSubmit, isPending, canEdit]);

	return (
		<Dialog>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Update Traefik Environment</DialogTitle>
					<DialogDescription>
						Update the traefik environment variables. For wildcard
						SSL certificates, configure your DNS provider credentials
						below.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<AlertBlock type="info">
					<strong>DNS Challenge for Wildcard Certificates:</strong>{" "}
					To use wildcard domains (e.g., *.example.com) with HTTPS,
					add your DNS provider API credentials here. Common providers:
					<ul className="mt-1 ml-4 list-disc text-xs space-y-0.5">
						<li><strong>Cloudflare:</strong> <code>CF_DNS_API_TOKEN=your_token</code></li>
						<li><strong>Route53:</strong> <code>AWS_ACCESS_KEY_ID</code> + <code>AWS_SECRET_ACCESS_KEY</code></li>
						<li><strong>DigitalOcean:</strong> <code>DO_AUTH_TOKEN=your_token</code></li>
						<li><strong>Hetzner:</strong> <code>HETZNER_API_KEY=your_key</code></li>
					</ul>
				</AlertBlock>

				<Form {...form}>
					<form
						id="hook-form-update-server-traefik-config"
						onSubmit={form.handleSubmit(onSubmit)}
						className="w-full space-y-4 relative overflow-auto"
					>
						<div className="flex flex-col">
							<FormField
								control={form.control}
								name="env"
								render={({ field }) => (
									<FormItem className="relative">
										<FormLabel>Env</FormLabel>
										<FormControl>
											<CodeEditor
												language="properties"
												wrapperClassName="h-[35rem] font-mono"
												placeholder={`# DNS Challenge credentials for wildcard certificates
CF_DNS_API_TOKEN=your_cloudflare_api_token
CF_API_EMAIL=your_cloudflare_email
                                                    `}
												{...field}
											/>
										</FormControl>

										<pre>
											<FormMessage />
										</pre>
										<div className="flex justify-end absolute z-50 right-6 top-0">
											<Button
												className="shadow-sm"
												variant="secondary"
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
							isLoading={isPending || isHealthCheckExecuting}
							disabled={canEdit || isPending || isHealthCheckExecuting}
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
