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
			return originalInsertBefore.call(this, node, null) as T;
		}
		return originalInsertBefore.call(this, node, child) as T;
	};
}
