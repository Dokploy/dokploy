import { zodResolver } from "@hookform/resolvers/zod";
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
});

type Schema = z.infer<typeof schema>;

interface Props {
	children?: React.ReactNode;
	serverId?: string;
}

export const UpdateServerIp = ({ children }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	const { data } = api.user.get.useQuery();
	const { data: ip } = api.server.publicIp.useQuery();

	const { mutateAsync, isLoading, error, isError } =
		api.user.update.useMutation();

	const form = useForm<Schema>({
		defaultValues: {
			serverIp: data?.user.serverIp || "",
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				serverIp: data.user.serverIp || "",
			});
		}
	}, [form, form.reset, data]);

	const utils = api.useUtils();

	const setCurrentIp = () => {
		if (!ip) return;
		form.setValue("serverIp", ip);
	};

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			serverIp: data.serverIp,
		})
			.then(async () => {
				toast.success("Server IP Updated");
				await utils.user.get.invalidate();
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
					>
						<FormField
							control={form.control}
							name="serverIp"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Server IP</FormLabel>
									<FormControl className="flex gap-2">
										<div>
											<Input {...field} />

											<TooltipProvider delayDuration={0}>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															variant="secondary"
															type="button"
															onClick={setCurrentIp}
														>
															<RefreshCw className="size-4 text-muted-foreground" />
														</Button>
													</TooltipTrigger>
													<TooltipContent
														side="left"
														sideOffset={5}
														className="max-w-[11rem]"
													>
														<p>Set current public IP</p>
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
					</form>

					<DialogFooter>
						<Button
							isLoading={isLoading}
							disabled={isLoading}
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
