import { zodResolver } from "@hookform/resolvers/zod";
import { Folder, HelpCircle } from "lucide-react";
import { useState } from "react";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { slugify } from "@/lib/slug";
import { api } from "@/utils/api";

const AddTemplateSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	appName: z
		.string()
		.min(1, {
			message: "App name is required",
		})
		.regex(/^[a-z](?!.*--)([a-z0-9-]*[a-z])?$/, {
			message:
				"App name supports lowercase letters, numbers, '-' and can only start and end letters, and does not support continuous '-'",
		}),
	description: z.string().optional(),
	serverId: z.string().optional(),
});

type AddTemplate = z.infer<typeof AddTemplateSchema>;

interface Props {
	projectId: string;
	projectName?: string;
}

export const AddApplication = ({ projectId, projectName }: Props) => {
	const utils = api.useUtils();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const [visible, setVisible] = useState(false);
	const slug = slugify(projectName);
	const { data: servers } = api.server.withSSHKey.useQuery();

	const hasServers = servers && servers.length > 0;

	const { mutateAsync, isLoading, error, isError } =
		api.application.create.useMutation();

	const form = useForm<AddTemplate>({
		defaultValues: {
			name: "",
			appName: `${slug}-`,
			description: "",
		},
		resolver: zodResolver(AddTemplateSchema),
	});

	const onSubmit = async (data: AddTemplate) => {
		await mutateAsync({
			name: data.name,
			appName: data.appName,
			description: data.description,
			projectId,
			serverId: data.serverId,
		})
			.then(async () => {
				toast.success("Service Created");
				form.reset();
				setVisible(false);
				await utils.project.one.invalidate({
					projectId,
				});
			})
			.catch(() => {
				toast.error("Error creating the service");
			});
	};

	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<Folder className="size-4 text-muted-foreground" />
					<span>Application</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Create</DialogTitle>
					<DialogDescription>
						Assign a name and description to your application
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input
											placeholder="Frontend"
											{...field}
											onChange={(e) => {
												const val = e.target.value?.trim() || "";
												const serviceName = slugify(val);
												form.setValue("appName", `${slug}-${serviceName}`);
												field.onChange(val);
											}}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{hasServers && (
							<FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger asChild>
													<FormLabel className="break-all w-fit flex flex-row gap-1 items-center">
														Select a Server {!isCloud ? "(Optional)" : ""}
														<HelpCircle className="size-4 text-muted-foreground" />
													</FormLabel>
												</TooltipTrigger>
												<TooltipContent
													className="z-[999] w-[300px]"
													align="start"
													side="top"
												>
													<span>
														If no server is selected, the application will be
														deployed on the server where the user is logged in.
													</span>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>

										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select a Server" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{servers?.map((server) => (
														<SelectItem
															key={server.serverId}
															value={server.serverId}
														>
															<span className="flex items-center gap-2 justify-between w-full">
																<span>{server.name}</span>
																<span className="text-muted-foreground text-xs self-center">
																	{server.ipAddress}
																</span>
															</span>
														</SelectItem>
													))}
													<SelectLabel>Servers ({servers?.length})</SelectLabel>
												</SelectGroup>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						<FormField
							control={form.control}
							name="appName"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										App Name
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground" />
												</TooltipTrigger>
												<TooltipContent side="right">
													<p>
														This will be the name of the Docker Swarm service
													</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</FormLabel>
									<FormControl>
										<Input placeholder="my-app" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Description of your service..."
											className="resize-none"
											{...field}
										/>
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>
					</form>

					<DialogFooter>
						<Button isLoading={isLoading} form="hook-form" type="submit">
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
