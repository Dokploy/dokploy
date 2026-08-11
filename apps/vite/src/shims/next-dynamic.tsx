import * as React from "react";

type ComponentModule<P> =
	| { default: React.ComponentType<P> }
	| React.ComponentType<P>;

interface DynamicOptions {
	ssr?: boolean;
	loading?: React.ComponentType;
}

const dynamic = <P extends object>(
	loader: () => Promise<ComponentModule<P>>,
	options?: DynamicOptions,
) => {
	const Lazy = React.lazy(async () => {
		const mod = await loader();
		if (mod && typeof mod === "object" && "default" in mod) {
			return mod as { default: React.ComponentType<P> };
		}
		return { default: mod as React.ComponentType<P> };
	}) as unknown as React.ComponentType<P>;

	const Loading = options?.loading;

	const DynamicComponent = (props: P) => (
		<React.Suspense fallback={Loading ? <Loading /> : null}>
			<Lazy {...props} />
		</React.Suspense>
	);

	return DynamicComponent;
};

export default dynamic;
