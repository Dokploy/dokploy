let lastNestedPopupCloseAt = 0;

export function markNestedPopupClosed() {
	lastNestedPopupCloseAt = performance.now();
}

export function wasNestedPopupJustClosed() {
	return performance.now() - lastNestedPopupCloseAt < 100;
}


let lastWindowFocusChangeAt = 0;

if (typeof window !== "undefined") {
	const markWindowFocusChange = () => {
		lastWindowFocusChangeAt = performance.now();
	};
	window.addEventListener("blur", markWindowFocusChange);
	window.addEventListener("focus", markWindowFocusChange);
	document.addEventListener("visibilitychange", markWindowFocusChange);
}

export function wasWindowRecentlyBlurred() {
	return performance.now() - lastWindowFocusChangeAt < 150;
}
