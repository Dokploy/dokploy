let lastNestedPopupCloseAt = 0;

export function markNestedPopupClosed() {
	lastNestedPopupCloseAt = performance.now();
}

export function wasNestedPopupJustClosed() {
	return performance.now() - lastNestedPopupCloseAt < 100;
}
