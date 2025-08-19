import type { ServiceType } from "@dokploy/server/db/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import copy from "copy-to-clipboard";
import { Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

const deleteComposeSchema = z.object({
	projectName: z.string().min(1, {
		message: "Compose name is required",
	}),
	deleteVolumes: z.boolean(),
});

type DeleteCompose = z.infer<typeof deleteComposeSchema>;

interface Props {
	id: string;
	type: ServiceType | "application";
}

export const DeleteService = ({ id, type }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	const queryMap = {
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		application: () =>
			api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
		compose: () =>
			api.compose.one.useQuery({ composeId: id }, { enabled: !!id }),
	};
	const { data } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });

	const mutationMap = {
		postgres: () => api.postgres.remove.useMutation(),
		redis: () => api.redis.remove.useMutation(),
		mysql: () => api.mysql.remove.useMutation(),
		mariadb: () => api.mariadb.remove.useMutation(),
		application: () => api.application.delete.useMutation(),
		mongo: () => api.mongo.remove.useMutation(),
		compose: () => api.compose.delete.useMutation(),
	};
	const { mutateAsync, isLoading } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.remove.useMutation();
	const { push } = useRouter();
	const form = useForm<DeleteCompose>({
		defaultValues: {
			projectName: "",
			deleteVolumes: false,
		},
		resolver: zodResolver(deleteComposeSchema),
	});

	const onSubmit = async (formData: DeleteCompose) => {
		const expectedName = `${data?.name}/${data?.appName}`;
		if (formData.projectName === expectedName) {
			const { deleteVolumes } = formData;
			await mutateAsync({
				mongoId: id || "",
				postgresId: id || "",
				redisId: id || "",
				mysqlId: id || "",
				mariadbId: id || "",
				applicationId: id || "",
				composeId: id || "",
				deleteVolumes,
			})
				.then((result) => {
					push(`/dashboard/project/${result?.projectId}`);
					toast.success("deleted successfully");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error deleting the service");
				});
		} else {
			form.setError("projectName", {
				message: `Project name must match "${expectedName}"`,
			});
		}
	};

	const isDisabled =
		(data &&
			"applicationStatus" in data &&
			data?.applicationStatus === "running") ||
		(data && "composeStatus" in data && data?.composeStatus === "running");

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-red-500/10 "
					isLoading={isLoading}
				>
					<Trash2 className="size-4 text-primary group-hover:text-red-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Are you absolutely sure?</DialogTitle>
					<DialogDescription>
						This action cannot be undone. This will permanently delete the
						service. If you are sure please enter the service name to delete
						this service.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							id="hook-form-delete-compose"
							className="grid w-full gap-4"
						>
							<FormField
								control={form.control}
								name="projectName"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											<span>
												To confirm, type{" "}
												<Badge
													className="p-2 rounded-md ml-1 mr-1 hover:border-primary hover:text-primary-foreground hover:bg-primary hover:cursor-pointer"
													variant="outline"
													onClick={() => {
														if (data?.name && data?.appName) {
															copy(`${data.name}/${data.appName}`);
															toast.success("Copied to clipboard. Be careful!");
														}
													}}
												>
													{data?.name}/{data?.appName}&nbsp;
													<Copy className="h-4 w-4 ml-1 text-muted-foreground" />
												</Badge>{" "}
												in the box below:
											</span>
										</FormLabel>
										<FormControl>
											<Input
												placeholder="Enter compose name to confirm"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							{type === "compose" && (
								<FormField
									control={form.control}
									name="deleteVolumes"
									render={({ field }) => (
										<FormItem>
											<div className="flex items-center">
												<FormControl>
													<Checkbox
														checked={field.value}
														onCheckedChange={field.onChange}
													/>
												</FormControl>

												<FormLabel className="ml-2">
													Delete volumes associated with this compose
												</FormLabel>
											</div>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}
						</form>
					</Form>
				</div>
				{isDisabled && (
					<AlertBlock type="warning" className="w-full mt-5">
						Cannot delete the service while it is running. Please wait for the
						build to finish and then try again.
					</AlertBlock>
				)}
				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => {
							setIsOpen(false);
						}}
					>
						Cancel
					</Button>

					<Button
						isLoading={isLoading}
						disabled={isDisabled}
						form="hook-form-delete-compose"
						type="submit"
						variant="destructive"
					>
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
