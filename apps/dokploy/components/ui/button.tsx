import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
	'inline-flex items-center justify-center whitespace-nowrap select-none rounded-lg transition-all duration-150 will-change-transform active:scale-[0.97] text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40',
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/85 shadow-none border-2 border-[var(--border-s)] ',
				destructive:
					'bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25',
				outline:
					'border border-border bg-transparent text-foreground hover:bg-accent hover:border-border/80',
				secondary:
					'bg-secondary text-secondary-foreground border border-border hover:bg-accent',
				ghost:
					'text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent',
				link:
					'text-primary underline-offset-4 hover:underline p-0 h-auto',
			},
			size: {
				default: 'h-9 px-4 py-2',
				sm: 'h-7 rounded-md px-3 text-xs',
				lg: 'h-10 rounded-md px-6',
				icon: 'h-9 w-9',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
	isLoading?: boolean;
	children?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant,
			size,
			children,
			isLoading = false,
			asChild = false,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? Slot : 'button'
		const type = props.type ?? undefined

		return (
			<>
				<Comp
					className={cn(
						buttonVariants({variant, size, className}),
						'flex gap-2 ',
					)}
					ref={ref}
					{...props}
					disabled={isLoading || props.disabled}
					type={type}
				>

					{isLoading && <Loader2 className="animate-spin"/>}
					<Slottable>{children}</Slottable>
				</Comp>
			</>
		)
	},
)
Button.displayName = 'Button'

export { Button, buttonVariants }
