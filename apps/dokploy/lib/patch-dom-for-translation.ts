// Browser translators (Google Translate, Edge, extensions) replace text nodes
// with their own <font> elements behind React's back. React then calls
// removeChild/insertBefore with nodes that are no longer children of the
// parent, which throws NotFoundError, unmounts the tree and shows the error
// page. Only those would-be-throwing calls are softened here; everything else
// goes through the native implementation.
// https://github.com/facebook/react/issues/11538
if (typeof Node === "function") {
	const originalRemoveChild = Node.prototype.removeChild;
	Node.prototype.removeChild = function <T extends Node>(
		this: Node,
		child: T,
	): T {
		if (child.parentNode !== this) {
			return child;
		}
		return originalRemoveChild.call(this, child) as T;
	};

	const originalInsertBefore = Node.prototype.insertBefore;
	Node.prototype.insertBefore = function <T extends Node>(
		this: Node,
		node: T,
		child: Node | null,
	): T {
		if (child && child.parentNode !== this) {
			// Appending keeps the new node visible and attached where React
			// expects its parent to be, so later removals still work.
			return originalInsertBefore.call(this, node, null) as T;
		}
		return originalInsertBefore.call(this, node, child) as T;
	};
}
