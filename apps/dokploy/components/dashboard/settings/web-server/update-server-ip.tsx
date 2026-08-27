import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

const schema = z.object({
	serverIp: z.string(),
	serverIpv6: z.string(),
});

type Schema = z.infer<typeof schema>;

interface Props {
	children?: React.ReactNode;
	serverId?: string;
}

export const UpdateServerIp = ({ children }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { data: ipv4 } = api.server.publicIpv4.useQuery();
	const { data: ipv6 } = api.server.publicIpv6.useQuery();

	const { mutateAsync, isPending, error, isError } =
		api.settings.updateServerIp.useMutation();

	const form = useForm<Schema>({
		defaultValues: {
			serverIp: data?.serverIp || "",
			serverIpv6: data?.serverIpv6 || "",
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				serverIp: data.serverIp || "",
				serverIpv6: data.serverIpv6 || "",
			});
		}
	}, [form, form.reset, data]);

	const setCurrentIpv4 = () => {
		if (!ipv4) return;
		form.setValue("serverIp", ipv4);
	};

	const setCurrentIpv6 = () => {
		if (!ipv6) return;
		form.setValue("serverIpv6", ipv6);
	};

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			serverIp: data.serverIp.trim(),
			serverIpv6: data.serverIpv6.trim(),
		})
			.then(async () => {
				toast.success("Server IP Updated");
				await refetch();
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error updating the IP of the server");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Update Server IP</DialogTitle>
					<DialogDescription>Update the IP of the server</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-update-server-ip"
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-4"
					>
						<FormField
							control={form.control}
							name="serverIp"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Public IPv4</FormLabel>
									<FormControl className="flex gap-2">
										<div>
											<Input {...field} />

											<TooltipProvider delayDuration={0}>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															variant="secondary"
															type="button"
															onClick={setCurrentIpv4}
														>
															<RefreshCw className="size-4 text-muted-foreground" />
														</Button>
													</TooltipTrigger>
													<TooltipContent
														side="left"
														sideOffset={5}
														className="max-w-44"
													>
														<p>Set current public IPv4</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="serverIpv6"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Public IPv6</FormLabel>
									<FormControl className="flex gap-2">
										<div>
											<Input placeholder="2001:db8::10" {...field} />
											<TooltipProvider delayDuration={0}>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															variant="secondary"
															type="button"
															onClick={setCurrentIpv6}
														>
															<RefreshCw className="size-4 text-muted-foreground" />
														</Button>
													</TooltipTrigger>
													<TooltipContent
														side="left"
														sideOffset={5}
														className="max-w-44"
													>
														<p>Set current public IPv6</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>

					<DialogFooter>
						<Button
							isLoading={isPending}
							disabled={isPending}
							form="hook-form-update-server-ip"
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
