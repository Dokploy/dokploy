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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { extractServices } from "@/pages/dashboard/project/[projectId]";
import { api } from "@/utils/api";
import { AlertBlock } from "@/components/shared/alert-block";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

const addPermissions = z.object({
	accesedProjects: z.array(z.string()).optional(),
	accesedServices: z.array(z.string()).optional(),
	canCreateProjects: z.boolean().optional().default(false),
	canCreateServices: z.boolean().optional().default(false),
	canDeleteProjects: z.boolean().optional().default(false),
	canDeleteServices: z.boolean().optional().default(false),
	canAccessToTraefikFiles: z.boolean().optional().default(false),
	canAccessToDocker: z.boolean().optional().default(false),
	canAccessToAPI: z.boolean().optional().default(false),
});

type AddPermissions = z.infer<typeof addPermissions>;

interface Props {
	userId: string;
}

export const AddUserPermissions = ({ userId }: Props) => {
	const { data: projects } = api.project.all.useQuery();

	const { data, refetch } = api.user.byUserId.useQuery(
		{
			userId,
		},
		{
			enabled: !!userId,
		},
	);

	const { mutateAsync, isError, error, isLoading } =
		api.admin.assignPermissions.useMutation();

	const form = useForm<AddPermissions>({
		defaultValues: {
			accesedProjects: [],
			accesedServices: [],
		},
		resolver: zodResolver(addPermissions),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				accesedProjects: data.accesedProjects || [],
				accesedServices: data.accesedServices || [],
				canCreateProjects: data.canCreateProjects,
				canCreateServices: data.canCreateServices,
				canDeleteProjects: data.canDeleteProjects,
				canDeleteServices: data.canDeleteServices,
				canAccessToTraefikFiles: data.canAccessToTraefikFiles,
				canAccessToDocker: data.canAccessToDocker,
				canAccessToAPI: data.canAccessToAPI,
			});
		}
	}, [form, form.formState.isSubmitSuccessful, form.reset, data]);

	const onSubmit = async (data: AddPermissions) => {
		await mutateAsync({
			userId,
			canCreateServices: data.canCreateServices,
			canCreateProjects: data.canCreateProjects,
			canDeleteServices: data.canDeleteServices,
			canDeleteProjects: data.canDeleteProjects,
			canAccessToTraefikFiles: data.canAccessToTraefikFiles,
			accesedProjects: data.accesedProjects || [],
			accesedServices: data.accesedServices || [],
			canAccessToDocker: data.canAccessToDocker,
			canAccessToAPI: data.canAccessToAPI,
		})
			.then(async () => {
				toast.success("Permissions updated");
				refetch();
			})
			.catch(() => {
				toast.error("Error to update the permissions");
			});
	};
	return (
		<Dialog>
			<DialogTrigger className="" asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					Add Permissions
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh]  overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Permissions</DialogTitle>
					<DialogDescription>Add or remove permissions</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-permissions"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid  grid-cols-1 md:grid-cols-2  w-full gap-4"
					>
						<FormField
							control={form.control}
							name="canCreateProjects"
							render={({ field }) => (
								<FormItem className=" flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Create Projects</FormLabel>
										<FormDescription>
											Allow the user to create projects
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="canDeleteProjects"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Delete Projects</FormLabel>
										<FormDescription>
											Allow the user to delete projects
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="canCreateServices"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Create Services</FormLabel>
										<FormDescription>
											Allow the user to create services
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="canDeleteServices"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Delete Services</FormLabel>
										<FormDescription>
											Allow the user to delete services
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="canAccessToTraefikFiles"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Access to Traefik Files</FormLabel>
										<FormDescription>
											Allow the user to access to the Traefik Tab Files
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="canAccessToDocker"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Access to Docker</FormLabel>
										<FormDescription>
											Allow the user to access to the Docker Tab
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="canAccessToAPI"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Access to API/CLI</FormLabel>
										<FormDescription>
											Allow the user to access to the API/CLI
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="accesedProjects"
							render={() => (
								<FormItem className="md:col-span-2">
									<div className="mb-4">
										<FormLabel className="text-base">Projects</FormLabel>
										<FormDescription>
											Select the Projects that the user can access
										</FormDescription>
									</div>
									{projects?.length === 0 && (
										<p className="text-sm text-muted-foreground">
											No projects found
										</p>
									)}
									<div className="grid md:grid-cols-2  gap-4">
										{projects?.map((item, index) => {
											const applications = extractServices(item);
											return (
												<FormField
													key={`project-${index}`}
													control={form.control}
													name="accesedProjects"
													render={({ field }) => {
														return (
															<FormItem
																key={item.projectId}
																className="flex flex-col items-start space-x-4 rounded-lg p-4 border"
															>
																<div className="flex flex-row gap-4">
																	<FormControl>
																		<Checkbox
																			checked={field.value?.includes(
																				item.projectId,
																			)}
																			onCheckedChange={(checked) => {
																				return checked
																					? field.onChange([
																							...(field.value || []),
																							item.projectId,
																						])
																					: field.onChange(
																							field.value?.filter(
																								(value) =>
																									value !== item.projectId,
																							),
																						);
																			}}
																		/>
																	</FormControl>
																	<FormLabel className="text-sm font-medium text-primary">
																		{item.name}
																	</FormLabel>
																</div>
																{applications.length === 0 && (
																	<p className="text-sm text-muted-foreground">
																		No services found
																	</p>
																)}
																{applications?.map((item, index) => (
																	<FormField
																		key={`project-${index}`}
																		control={form.control}
																		name="accesedServices"
																		render={({ field }) => {
																			return (
																				<FormItem
																					key={item.id}
																					className="flex flex-row items-start space-x-3 space-y-0"
																				>
																					<FormControl>
																						<Checkbox
																							checked={field.value?.includes(
																								item.id,
																							)}
																							onCheckedChange={(checked) => {
																								return checked
																									? field.onChange([
																											...(field.value || []),
																											item.id,
																										])
																									: field.onChange(
																											field.value?.filter(
																												(value) =>
																													value !== item.id,
																											),
																										);
																							}}
																						/>
																					</FormControl>
																					<FormLabel className="text-sm text-muted-foreground">
																						{item.name}
																					</FormLabel>
																				</FormItem>
																			);
																		}}
																	/>
																))}
															</FormItem>
														);
													}}
												/>
											);
										})}
									</div>

									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter className="flex w-full flex-row justify-end md:col-span-2">
							<Button
								isLoading={isLoading}
								form="hook-form-add-permissions"
								type="submit"
							>
								Update
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
