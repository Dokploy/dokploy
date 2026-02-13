import { zodResolver } from "@hookform/resolvers/zod";
import { Palette, PenBoxIcon, PlusIcon, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { TagBadge } from "@/components/shared/tag-badge";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
	const colorInputRef = useRef<HTMLInputElement>(null);

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
			...(tagId && { tagId }),
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
									<FormLabel>Color (Optional)</FormLabel>
									<FormControl>
										<div className="flex items-center gap-3">
											<FormLabel
												className="relative flex items-center justify-center w-12 h-12 rounded-md border-2 cursor-pointer hover:opacity-80 transition-opacity"
												style={{
													backgroundColor: field.value || "#3b82f6",
												}}
												onClick={() => colorInputRef.current?.click()}
											>
												<div className="flex items-center justify-center">
													{!field.value && (
														<Palette className="h-5 w-5 text-white" />
													)}
												</div>
												<input
													ref={colorInputRef}
													type="color"
													className="absolute opacity-0 pointer-events-none w-12 h-12 top-0 left-0"
													value={field.value || "#3b82f6"}
													onChange={field.onChange}
												/>
											</FormLabel>
											<div className="flex-1">
												<Input
													placeholder="#3b82f6"
													{...field}
													value={field.value || ""}
													onChange={(e) => {
														const value = e.target.value;
														if (value.startsWith("#") || value === "") {
															field.onChange(value);
														}
													}}
												/>
												<FormDescription className="mt-1">
													Choose a color to easily identify this tag
												</FormDescription>
											</div>
										</div>
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

interface DeleteTagProps {
	tagId: string;
	tagName: string;
}

const DeleteTag = ({ tagId, tagName }: DeleteTagProps) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { mutateAsync, isLoading } = api.tag.remove.useMutation();

	const handleDelete = async () => {
		await mutateAsync({ tagId })
			.then(async () => {
				await utils.tag.all.invalidate();
				toast.success("Tag deleted successfully");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error deleting tag");
			});
	};

	return (
		<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8 text-destructive hover:text-destructive"
				onClick={() => setIsOpen(true)}
			>
				<Trash2 className="h-4 w-4" />
			</Button>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Tag</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete the tag "{tagName}"? This will
						remove the tag from all projects. This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleDelete}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						disabled={isLoading}
					>
						{isLoading ? "Deleting..." : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};

export const TagManager = () => {
	const { data: tags, isLoading } = api.tag.all.useQuery();

	return (
		<div className="w-full">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle>Tags</CardTitle>
						<CardDescription>
							Create and manage tags to organize your projects
						</CardDescription>
					</div>
					<HandleTag />
				</CardHeader>
				<CardContent>
					{isLoading && (
						<div className="flex items-center justify-center py-8">
							<p className="text-sm text-muted-foreground">Loading tags...</p>
						</div>
					)}

					{!isLoading && (!tags || tags.length === 0) && (
						<div className="flex flex-col items-center justify-center py-8 text-center">
							<p className="text-sm text-muted-foreground">
								No tags yet. Create your first tag to start organizing projects.
							</p>
						</div>
					)}

					{!isLoading && tags && tags.length > 0 && (
						<div className="space-y-2">
							{tags.map((tag) => (
								<div
									key={tag.tagId}
									className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors"
								>
									<div className="flex items-center gap-3">
										<TagBadge name={tag.name} color={tag.color} />
										{tag.color && (
											<span className="text-xs text-muted-foreground font-mono">
												{tag.color}
											</span>
										)}
									</div>
									<div className="flex items-center gap-1">
										<HandleTag tagId={tag.tagId} />
										<DeleteTag tagId={tag.tagId} tagName={tag.name} />
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
