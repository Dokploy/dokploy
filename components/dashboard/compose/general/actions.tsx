import { Button } from "@/components/ui/button";
import { CheckIcon, ChevronsUpDown, Hammer, Terminal } from "lucide-react";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import { api } from "@/utils/api";
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Toggle } from "@/components/ui/toggle";
import { RedbuildCompose } from "./rebuild-compose";
import { DeployCompose } from "./deploy-compose";
import { StopCompose } from "./stop-compose";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";

const GithubProviderSchema = z.object({
	serviceName: z.string().min(1, "Service name is required"),
});

type GithubProvider = z.infer<typeof GithubProviderSchema>;

interface Props {
	composeId: string;
}
export const ComposeActions = ({ composeId }: Props) => {
	const utils = api.useUtils();
	// const { data, refetch, isLoading } = api.compose.allServices.useQuery(
	// 	{
	// 		composeId,
	// 	},
	// 	{ enabled: !!composeId },
	// );
	const { data, refetch, isLoading } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);
	const { mutateAsync: update } = api.compose.update.useMutation();
	const { mutateAsync } = api.compose.deploy.useMutation();

	// const form = useForm<GithubProvider>({
	// 	defaultValues: {
	// 		serviceName: "",
	// 	},
	// 	resolver: zodResolver(GithubProviderSchema),
	// });

	// const onSubmit = async () => {
	// 	await mutateAsync({
	// 		composeId,
	// 	})
	// 		.then(async () => {
	// 			toast.success("Compose deploy updated");
	// 			await utils.compose.one.invalidate({
	// 				composeId,
	// 			});
	// 		})
	// 		.catch(() => {
	// 			toast.error("Error to deploy the compose");
	// 		});
	// };

	return (
		<div className="flex flex-row gap-4 w-full flex-wrap ">
			{/* <Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex w-full gap-4 "
				> */}
			{/* <div className="">
						<FormField
							control={form.control}
							name="serviceName"
							render={({ field }) => (
								<FormItem className="md:col-span-2 flex flex-col">
									<FormLabel>Service</FormLabel>
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													role="combobox"
													className={cn(
														"w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													{isLoading
														? "Loading...."
														: field.value
															? data?.find((repo) => repo === field.value)
															: "Select service"}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder="Select service..."
													className="h-9"
												/>
												{isLoading && (
													<span className="py-6 text-center text-sm">
														Loading Services....
													</span>
												)}
												<CommandEmpty>No services found.</CommandEmpty>
												<ScrollArea className="h-96">
													<CommandGroup>
														{data?.map((serviceName, index) => (
															<CommandItem
																value={serviceName}
																key={`service-${index}`}
																onSelect={() => {
																	field.onChange(serviceName);
																}}
															>
																{serviceName}
																<CheckIcon
																	className={cn(
																		"ml-auto h-4 w-4",
																		serviceName === field.value
																			? "opacity-100"
																			: "opacity-0",
																	)}
																/>
															</CommandItem>
														))}
													</CommandGroup>
												</ScrollArea>
											</Command>
										</PopoverContent>
									</Popover>
								</FormItem>
							)}
						/>
					</div> */}
			<DeployCompose composeId={composeId} />

			<Toggle
				aria-label="Toggle italic"
				pressed={data?.autoDeploy || false}
				onPressedChange={async (enabled) => {
					await update({
						composeId,
						autoDeploy: enabled,
					})
						.then(async () => {
							toast.success("Auto Deploy Updated");
							await refetch();
						})
						.catch(() => {
							toast.error("Error to update Auto Deploy");
						});
				}}
			>
				Autodeploy
			</Toggle>
			<RedbuildCompose composeId={composeId} />
			<StopCompose composeId={composeId} />
			<DockerTerminalModal appName={data?.appName || ""}>
				<Button variant="outline">
					<Terminal />
					Open Terminal
				</Button>
			</DockerTerminalModal>
			{/* </form>
			</Form> */}
		</div>
	);
};
