import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { TagBadge } from "@/components/shared/tag-badge";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/ui/color-picker";
import { api } from "@/utils/api";

const TagSchema = z.object({
	name: z
		.string()
		.min(1, "Tag name is required")
		.max(50, "Tag name must be less than 50 characters")
		.refine(
			(name) => {
				const trimmedName = name.trim();
				const validNameRegex =
					/^[\p{L}\p{N}_-][\p{L}\p{N}\s_.-]*[\p{L}\p{N}_-]$/u;
				return validNameRegex.test(trimmedName);
			},
			{
				message:
					"Tag name must start and end with a letter, number, hyphen or underscore. Spaces are allowed in between.",
			},
		)
		.transform((name) => name.trim()),
	color: z.string().optional(),
});

type Tag = z.infer<typeof TagSchema>;

interface HandleTagProps {
	tagId?: string;
}

export const HandleTag = ({ tagId }: HandleTagProps) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { mutateAsync, error, isError } = tagId
		? api.tag.update.useMutation()
		: api.tag.create.useMutation();

	const { data: tag } = api.tag.one.useQuery(
		{
			tagId: tagId || "",
		},
		{
			enabled: !!tagId,
		},
	);

	const form = useForm<Tag>({
		defaultValues: {
			name: "",
			color: "#3b82f6",
		},
		resolver: zodResolver(TagSchema),
	});

	useEffect(() => {
		if (tag) {
			form.reset({
				name: tag.name ?? "",
				color: tag.color ?? "#3b82f6",
			});
		} else {
			form.reset({
				name: "",
				color: "#3b82f6",
			});
		}
	}, [form, form.reset, tag]);

	const onSubmit = async (data: Tag) => {
		await mutateAsync({
			name: data.name,
			color: data.color,
			tagId: tagId || "",
		})
			.then(async () => {
				await utils.tag.all.invalidate();
				toast.success(tagId ? "Tag Updated" : "Tag Created");
				setIsOpen(false);
				form.reset();
			})
			.catch(() => {
				toast.error(tagId ? "Error updating tag" : "Error creating tag");
			});
	};

	const colorValue = form.watch("color");

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{tagId ? (
					<Button variant="ghost" size="icon" className="h-8 w-8">
						<PenBoxIcon className="h-4 w-4" />
					</Button>
				) : (
					<Button>
						<PlusIcon className="h-4 w-4" />
						Create Tag
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{tagId ? "Update" : "Create"} Tag</DialogTitle>
					<DialogDescription>
						{tagId
							? "Update the tag name and color"
							: "Create a new tag to organize your projects"}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-tag"
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
											placeholder="e.g., Production, Client, Internal"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="color"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Color</FormLabel>
									<FormControl>
										<ColorPicker
											value={field.value || "#3b82f6"}
											onChange={field.onChange}
											defaultValue="#3b82f6"
											placeholder="#3b82f6"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{colorValue && (
							<div className="flex items-center gap-2">
								<span className="text-sm text-muted-foreground">Preview:</span>
								<TagBadge
									name={form.watch("name") || "Tag Name"}
									color={colorValue}
								/>
							</div>
						)}
					</form>
				</Form>

				<DialogFooter>
					<Button
						isLoading={form.formState.isSubmitting}
						form="hook-form-tag"
						type="submit"
					>
						{tagId ? "Update" : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
