export const createLookupRequestGuard = () => {
	let context = "";
	let currentRequest = 0;

	return {
		setContext(nextContext: string) {
			if (nextContext !== context) {
				context = nextContext;
				currentRequest += 1;
			}
		},
		begin() {
			currentRequest += 1;
			return currentRequest;
		},
		isCurrent(request: number) {
			return request === currentRequest;
		},
		cancel() {
			currentRequest += 1;
		},
	};
};
