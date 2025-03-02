import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Server } from "lucide-react";
import Link from "next/link";
import React from "react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AddSwarmSettings } from "./modify-swarm-settings";

interface Props {
	applicationId: string;
}

const AddRedirectchema = z.object({
	replicas: z.number(),
	registryId: z.string(),
});

type AddCommand = z.infer<typeof AddRedirectchema>;

export const ShowClusterSettings = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const { data: registries } = api.registry.all.useQuery();

	const utils = api.useUtils();

	const { mutateAsync, isLoading } = api.application.update.useMutation();

	const form = useForm<AddCommand>({
		defaultValues: {
			registryId: data?.registryId || "",
			replicas: data?.replicas || 1,
		},
		resolver: zodResolver(AddRedirectchema),
	});

	useEffect(() => {
		if (data?.command) {
			form.reset({
				registryId: data?.registryId || "",
				replicas: data?.replicas || 1,
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data?.command]);

	const onSubmit = async (data: AddCommand) => {
		await mutateAsync({
			applicationId,
			registryId:
				data?.registryId === "none" || !data?.registryId
					? null
					: data?.registryId,
			replicas: data?.replicas,
		})
			.then(async () => {
				toast.success("Command Updated");
				await utils.application.one.invalidate({
					applicationId,
				});
			})
			.catch(() => {
				toast.error("Error updating the command");
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">Cluster Settings</CardTitle>
					<CardDescription>
						Add the registry and the replicas of the application
					</CardDescription>
				</div>
				<AddSwarmSettings applicationId={applicationId} />
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">
					Please remember to click Redeploy after modify the cluster settings to
					apply the changes.
				</AlertBlock>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="replicas"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Replicas</FormLabel>
										<FormControl>
											<Input
												placeholder="1"
												{...field}
												onChange={(e) => {
													field.onChange(Number(e.target.value));
												}}
												type="number"
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{registries && registries?.length === 0 ? (
							<div className="pt-10">
								<div className="flex flex-col items-center gap-3">
									<Server className="size-8 text-muted-foreground" />
									<span className="text-base text-muted-foreground">
										To use a cluster feature, you need to configure at least a
										registry first. Please, go to{" "}
										<Link
											href="/dashboard/settings/cluster"
											className="text-foreground"
										>
											Settings
										</Link>{" "}
										to do so.
									</span>
								</div>
							</div>
						) : (
							<>
								<FormField
									control={form.control}
									name="registryId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Select a registry</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select a registry" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{registries?.map((registry) => (
															<SelectItem
																key={registry.registryId}
																value={registry.registryId}
															>
																{registry.registryName}
															</SelectItem>
														))}
														<SelectItem value={"none"}>None</SelectItem>
														<SelectLabel>
															Registries ({registries?.length})
														</SelectLabel>
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormItem>
									)}
								/>
							</>
						)}

						<div className="flex justify-end">
							<Button isLoading={isLoading} type="submit" className="w-fit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
