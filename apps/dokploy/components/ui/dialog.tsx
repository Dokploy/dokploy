import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const DialogContext = React.createContext<{
	onOpenChange?: (open: boolean) => void;
	open?: boolean;
}>({});

const Dialog = ({
	onOpenChange,
	open,
	...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) => {
	const [isOpened, setIsOpened] = React.useState(false); // for internal control

	const handleOpenChange = (open: boolean) => {
		if (onOpenChange) {
			onOpenChange(open);
		} else {
			setIsOpened(open);
		}
	};

	return (
		<DialogContext.Provider
			value={{ onOpenChange: handleOpenChange, open: open || isOpened }}
		>
			<DialogPrimitive.Root
				open={open || isOpened}
				onOpenChange={handleOpenChange}
				{...props}
				modal={false}
			/>
		</DialogContext.Provider>
	);
};
Dialog.displayName = DialogPrimitive.Root.displayName;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn(
			"fixed inset-0 z-50 bg-black/80 pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
			className,
		)}
		{...props}
	/>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
	const contentRef = React.useRef<HTMLDivElement>(null);
	const { onOpenChange, open } = React.useContext(DialogContext);

	React.useEffect(() => {
		if (!open) return;

		const scrollbarWidth =
			window.innerWidth - document.documentElement.clientWidth;
		const body = document.body;
		const originalPaddingRight = body.style.paddingRight;
		const originalOverflow = body.style.overflow;

		if (scrollbarWidth > 0) {
			body.style.paddingRight = `${scrollbarWidth}px`;
		}

		return () => {
			body.style.overflow = originalOverflow;
			body.style.paddingRight = originalPaddingRight;
		};
	}, [open]);

	// Handle outside interactions properly with Command components
	const handleInteractOutside = React.useCallback(
		(event: Event | React.MouseEvent) => {
			// Don't close when clicking inside popovers, dropdowns, or command components
			const target = event.target as HTMLElement;
			if (
				target.closest("[data-radix-popper-content-wrapper]") ||
				target.closest("[cmdk-root]") ||
				target.closest("[data-radix-command-root]")
			) {
				event.preventDefault();
				return;
			}

			if (onOpenChange) {
				event.preventDefault();
				event.stopPropagation();
				onOpenChange(false);
			}
		},
		[onOpenChange],
	);

	const hasPaddingOverride = className?.includes("p-0");

	// Separate DialogFooter from other children for proper layout
	const childrenArray = React.Children.toArray(children);
	const dialogFooter = childrenArray.find(
		(child) => React.isValidElement(child) && child.type === DialogFooter,
	);
	const otherChildren = childrenArray.filter(
		(child) => !(React.isValidElement(child) && child.type === DialogFooter),
	);

	return (
		<DialogPortal>
			{/* Custom overlay for modal=false - no click handler to avoid Command conflicts */}
			<div
				className="fixed inset-0 z-50 bg-black/80 pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
				onClick={handleInteractOutside}
			/>
			<DialogPrimitive.Content
				ref={ref}
				className={cn(
					"fixed left-[50%] top-[50%] z-50 pointer-events-auto w-full max-w-lg translate-x-[-50%] translate-y-[-50%] border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
					"flex flex-col max-h-[90vh]",
					className,
				)}
				style={{ pointerEvents: "auto" }}
				onInteractOutside={(event) => event.preventDefault()}
				{...props}
			>
				<div
					ref={contentRef}
					className={cn(
						"flex flex-col overflow-auto flex-1 min-h-0 overscroll-contain",
						!hasPaddingOverride && "p-6",
					)}
				>
					{otherChildren}
				</div>

				{/* DialogFooter outside scrollable area with proper spacing */}
				{dialogFooter && (
					<div className="p-6 pt-0 border-t border-border/50">
						{dialogFooter}
					</div>
				)}

				<DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
					<X className="h-4 w-4" />
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
			</DialogPrimitive.Content>
		</DialogPortal>
	);
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col space-y-1.5 text-center sm:text-left pb-4",
			className,
		)}
		{...props}
	/>
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col-reverse mt-4 sm:flex-row sm:justify-end sm:space-x-2",
			className,
		)}
		{...props}
	/>
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn(
			"text-lg font-semibold leading-none tracking-tight",
			className,
		)}
		{...props}
	/>
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
	Dialog,
	DialogPortal,
	DialogOverlay,
	DialogClose,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogFooter,
	DialogTitle,
	DialogDescription,
};
