export interface LemonSqueezyLicenseResponse {
	valid: boolean;
	error?: string;
	meta?: {
		store_id: string;
		order_id: number;
		order_item_id: number;
		product_id: number;
		product_name: string;
		variant_id: number;
		variant_name: string;
		customer_id: number;
		customer_name: string;
		customer_email: string;
	};
}
