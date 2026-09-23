export const S3_PROVIDERS: Array<{
	key: string;
	name: string;
}> = [
	{
		key: "AWS",
		name: "Amazon Web Services (AWS) S3",
	},
	{
		key: "Alibaba",
		name: "Alibaba Cloud Object Storage System (OSS) formerly Aliyun",
	},
	{
		key: "ArvanCloud",
		name: "Arvan Cloud Object Storage (AOS)",
	},
	{
		key: "Ceph",
		name: "Ceph Object Storage",
	},
	{
		key: "ChinaMobile",
		name: "China Mobile Ecloud Elastic Object Storage (EOS)",
	},
	{
		key: "Cloudflare",
		name: "Cloudflare R2 Storage",
	},
	{
		key: "DigitalOcean",
		name: "DigitalOcean Spaces",
	},
	{
		key: "Dreamhost",
		name: "Dreamhost DreamObjects",
	},
	{
		key: "GCS",
		name: "Google Cloud Storage",
	},
	{
		key: "HuaweiOBS",
		name: "Huawei Object Storage Service",
	},
	{
		key: "IBMCOS",
		name: "IBM COS S3",
	},
	{
		key: "IDrive",
		name: "IDrive e2",
	},
	{
		key: "IONOS",
		name: "IONOS Cloud",
	},
	{
		key: "LyveCloud",
		name: "Seagate Lyve Cloud",
	},
	{
		key: "Leviia",
		name: "Leviia Object Storage",
	},
	{
		key: "Liara",
		name: "Liara Object Storage",
	},
	{
		key: "Linode",
		name: "Linode Object Storage",
	},
	{
		key: "Magalu",
		name: "Magalu Object Storage",
	},
	{
		key: "Minio",
		name: "Minio Object Storage",
	},
	{
		key: "Netease",
		name: "Netease Object Storage (NOS)",
	},
	{
		key: "Petabox",
		name: "Petabox Object Storage",
	},
	{
		key: "RackCorp",
		name: "RackCorp Object Storage",
	},
	{
		key: "Rclone",
		name: "Rclone S3 Server",
	},
	{
		key: "Scaleway",
		name: "Scaleway Object Storage",
	},
	{
		key: "SeaweedFS",
		name: "SeaweedFS S3",
	},
	{
		key: "StackPath",
		name: "StackPath Object Storage",
	},
	{
		key: "Storj",
		name: "Storj (S3 Compatible Gateway)",
	},
	{
		key: "Synology",
		name: "Synology C2 Object Storage",
	},
	{
		key: "TencentCOS",
		name: "Tencent Cloud Object Storage (COS)",
	},
	{
		key: "Wasabi",
		name: "Wasabi Object Storage",
	},
	{
		key: "Qiniu",
		name: "Qiniu Object Storage (Kodo)",
	},
	{
		key: "Other",
		name: "Any other S3 compatible provider",
	},
];

export const RCLONE_PROVIDERS: Array<{
	key: string;
	name: string;
}> = [
	{
		key: "drive",
		name: "Google Drive",
	},
	{
		key: "onedrive",
		name: "OneDrive",
	},
	{
		key: "ftp",
		name: "FTP",
	},
	{
		key: "sftp",
		name: "SFTP",
	},
	{
		key: "custom",
		name: "Custom (rclone)",
	},
];

export const RCLONE_CONFIG_PLACEHOLDERS: Record<string, string> = {
	drive:
		'client_id = <google oauth client id>\nclient_secret = <google oauth client secret>\nscope = drive\ntoken = {"access_token":"...","refresh_token":"...","token_type":"Bearer","expiry":"..."}',
	onedrive:
		'client_id = <app client id>\nclient_secret = <app client secret>\ntoken = {"access_token":"...","refresh_token":"...","token_type":"Bearer","expiry":"..."}',
	ftp: "host = ftp.example.com\nport = 21\nuser = myuser\npass = mypassword",
	sftp: "host = sftp.example.com\nport = 22\nuser = myuser\npass = mypassword\n# or key_file = /path/to/id_ed25519",
	custom: "type = <rclone backend>\n<option> = <value>",
};

export const RCLONE_PROVIDER_HELP: Record<string, string> = {
	drive:
		'Run "rclone authorize drive" on a machine with a browser and paste the token JSON it prints. Custom client_id/secret: https://rclone.org/drive/#making-your-own-client-id',
	onedrive:
		'Run "rclone authorize onedrive" on a machine with a browser and paste the token JSON it prints: https://rclone.org/onedrive/',
	ftp: "Any rclone option works here (https://rclone.org/ftp/).",
	sftp: "Any rclone option works here (https://rclone.org/sftp/).",
	custom:
		"Any rclone backend is supported; set its type and options (https://rclone.org/overview/).",
};
