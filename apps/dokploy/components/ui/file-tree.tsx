"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
// import { ScrollArea } from "@acme/components/ui/scroll-area";
// import { cn } from "@acme/components/lib/utils";
import { ChevronRight, type LucideIcon } from "lucide-react";
import React from "react";
import useResizeObserver from "use-resize-observer";
import { cn } from "@/lib/utils";
import { ScrollArea } from "./scroll-area";

interface TreeDataItem {
	id: string;
	name: string;
	icon?: LucideIcon;
	type: "file" | "directory";
	children?: TreeDataItem[];
}

type TreeProps = React.HTMLAttributes<HTMLDivElement> & {
	data: TreeDataItem[] | TreeDataItem;
	initialSlelectedItemId?: string;
	onSelectChange?: (item: TreeDataItem | undefined) => void;
	expandAll?: boolean;
	folderIcon?: LucideIcon;
	itemIcon?: LucideIcon;
};

const Tree = React.forwardRef<HTMLDivElement, TreeProps>(
	(
		{
			data,
			initialSlelectedItemId,
			onSelectChange,
			expandAll,
			folderIcon,
			itemIcon,
			className,
			...props
		},
		ref,
	) => {
		const [selectedItemId, setSelectedItemId] = React.useState<
			string | undefined
		>(initialSlelectedItemId);

		const handleSelectChange = React.useCallback(
			(item: TreeDataItem | undefined) => {
				setSelectedItemId(item?.id);
				if (onSelectChange && item?.type === "file") {
					onSelectChange(item);
				}
			},
			[onSelectChange],
		);

		const expandedItemIds = React.useMemo(() => {
			if (!initialSlelectedItemId) {
				return [] as string[];
			}

			const ids: string[] = [];

			function walkTreeItems(
				items: TreeDataItem[] | TreeDataItem,
				targetId: string,
			) {
				if (Array.isArray(items)) {
					// eslint-disable-next-line @typescript-eslint/prefer-for-of
					for (let i = 0; i < items.length; i++) {
						ids.push(items[i]!.id);
						if (walkTreeItems(items[i]!, targetId) && !expandAll) {
							return true;
						}
						if (!expandAll) ids.pop();
					}
				} else if (!expandAll && items.id === targetId) {
					return true;
				} else if (items.children) {
					return walkTreeItems(items.children, targetId);
				}
			}

			walkTreeItems(data, initialSlelectedItemId);
			return ids;
		}, [data, initialSlelectedItemId]);

		const { ref: refRoot } = useResizeObserver();

		return (
			<div ref={refRoot} className={cn("overflow-y-auto", className)}>
				<ScrollArea>
					<div className="relative p-2">
						<TreeItem
							data={data}
							ref={ref}
							selectedItemId={selectedItemId}
							handleSelectChange={handleSelectChange}
							expandedItemIds={expandedItemIds}
							FolderIcon={folderIcon}
							ItemIcon={itemIcon}
							{...props}
						/>
					</div>
				</ScrollArea>
			</div>
		);
	},
);

Tree.displayName = "Tree";

type TreeItemProps = TreeProps & {
	selectedItemId?: string;
	handleSelectChange: (item: TreeDataItem | undefined) => void;
	expandedItemIds: string[];
	FolderIcon?: LucideIcon;
	ItemIcon?: LucideIcon;
};

const TreeItem = React.forwardRef<HTMLDivElement, TreeItemProps>(
	(
		{
			className,
			data,
			selectedItemId,
			handleSelectChange,
			expandedItemIds,
			FolderIcon,
			ItemIcon,
			...props
		},
		ref,
	) => {
		return (
			<div ref={ref} role="tree" className={className} {...props}>
				<ul>
					{Array.isArray(data) ? (
						data.map((item) => (
							<li key={item.id}>
								{item.children ? (
									<AccordionPrimitive.Root
										type="multiple"
										defaultValue={expandedItemIds}
									>
										<AccordionPrimitive.Item value={item.id}>
											<AccordionTrigger
												className={cn(
													"px-2 hover:before:opacity-100  before:absolute before:left-0 before:w-full before:opacity-0 before:bg-muted/80 before:h-[1.75rem] before:-z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
													selectedItemId === item.id &&
														"before:opacity-100 before:bg-accent text-accent-foreground before:border-l-2 before:border-l-accent-foreground/50 dark:before:border-0",
												)}
												onClick={() => handleSelectChange(item)}
											>
												{item.icon && (
													<item.icon
														className="h-4 w-4 shrink-0 mr-2 text-accent-foreground/50"
														aria-hidden="true"
													/>
												)}
												{!item.icon && FolderIcon && (
													<FolderIcon
														className="h-4 w-4 shrink-0 mr-2 text-accent-foreground/50"
														aria-hidden="true"
													/>
												)}
												<span className="text-sm truncate font-mono">
													{item.name}
												</span>
											</AccordionTrigger>
											<AccordionContent className="pl-6">
												{item.children.length === 0 && (
													<div className="text-sm text-muted-foreground pl-6">
														No items
													</div>
												)}
												<TreeItem
													data={item.children ? item.children : item}
													selectedItemId={selectedItemId}
													handleSelectChange={handleSelectChange}
													expandedItemIds={expandedItemIds}
													FolderIcon={FolderIcon}
													ItemIcon={ItemIcon}
												/>
											</AccordionContent>
										</AccordionPrimitive.Item>
									</AccordionPrimitive.Root>
								) : (
									<Leaf
										item={item}
										isSelected={selectedItemId === item.id}
										onClick={() => handleSelectChange(item)}
										Icon={ItemIcon}
									/>
								)}
							</li>
						))
					) : (
						<li>
							<Leaf
								item={data}
								isSelected={selectedItemId === data.id}
								onClick={() => handleSelectChange(data)}
								Icon={ItemIcon}
							/>
						</li>
					)}
				</ul>
			</div>
		);
	},
);

TreeItem.displayName = "TreeItem";

const Leaf = React.forwardRef<
	HTMLButtonElement,
	React.HTMLAttributes<HTMLButtonElement> & {
		item: TreeDataItem;
		isSelected?: boolean;
		Icon?: LucideIcon;
	}
>(({ className, item, isSelected, Icon, ...props }, ref) => {
	return (
		<button
			ref={ref}
			type="button"
			className={cn(
				"flex items-center py-2 px-2 cursor-pointer \
			hover:before:opacity-100 before:absolute before:left-0 before:right-1 before:w-full transition-colors before:opacity-0 before:bg-muted/80 before:h-[1.75rem] before:-z-10 rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 relative focus-visible:z-10 w-full",
				className,
				isSelected &&
					"before:opacity-100 before:bg-accent bg-border rounded-lg   text-accent-foreground before:border-l-2 before:border-l-accent-foreground/50 dark:before:border-0",
			)}
			{...props}
		>
			{item.icon && (
				<item.icon
					className="h-4 w-4 shrink-0 mr-2 text-accent-foreground/50"
					aria-hidden="true"
				/>
			)}
			{!item.icon && Icon && (
				<Icon
					className="h-4 w-4 shrink-0 mr-2 text-accent-foreground/50"
					aria-hidden="true"
				/>
			)}
			<p className="text-sm whitespace-normal font-mono text-left">
				{item.name}
			</p>
		</button>
	);
});

Leaf.displayName = "Leaf";

const AccordionTrigger = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
	<AccordionPrimitive.Header>
		<AccordionPrimitive.Trigger
			ref={ref}
			className={cn(
				"flex flex-1 w-full items-center py-2 transition-all last:[&[data-state=open]>svg]:rotate-90",
				className,
			)}
			{...props}
		>
			{children}
			<ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 text-accent-foreground/50 ml-auto" />
		</AccordionPrimitive.Trigger>
	</AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
	<AccordionPrimitive.Content
		ref={ref}
		className={cn(
			"overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
			className,
		)}
		{...props}
	>
		<div className="pb-1 pt-0">{children}</div>
	</AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Tree, type TreeDataItem };
