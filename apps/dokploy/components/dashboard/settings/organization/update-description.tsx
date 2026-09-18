import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const descriptionSchema = z.object({
	description: z.string().max(500, "Description must be 500 characters or less"),
});

type DescriptionForm = z.infer<typeof descriptionSchema>;

export const UpdateOrgDescription = () => {
	const utils = api.useUtils();
	const { data: org } = api.organization.active.useQuery();
	const { mutateAsync: updateDescription, isPending } =
		api.organization.updateDescription.useMutation();

	const existingDescription = org?.metadata
		? (() => {
				try {
					return JSON.parse(org.metadata)?.description ?? "";
				} catch {
					return "";
				}
			})()
		: "";

	const form = useForm<DescriptionForm>({
		defaultValues: { description: existingDescription },
		resolver: zodResolver(descriptionSchema),
		values: { description: existingDescription },
	});

	const onSubmit = async (data: DescriptionForm) => {
		if (!org?.id) return;
		try {
			await updateDescription({
				organizationId: org.id,
				description: data.description,
			});
			toast.success("Organization description updated");
			await utils.organization.active.invalidate();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to update description";
			toast.error(message);
		}
	};

	return (
		<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader>
					<CardTitle className="text-xl">Organization Description</CardTitle>
					<CardDescription>
						Add a short description to help members understand this organization.
					</CardDescription>
				</CardHeader>
				<CardContent className="border-t py-6">
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Describe what this organization is for..."
												className="resize-none"
												rows={4}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{field.value?.length ?? 0}/500 characters
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button type="submit" isLoading={isPending} className="self-start">
								Save Description
							</Button>
						</form>
					</Form>
				</CardContent>
			</div>
		</Card>
	);
};
