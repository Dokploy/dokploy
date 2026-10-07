import { RCLONE_DESTINATION_PROVIDERS } from "@dokploy/server/db/validations/destination";

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

export const DESTINATION_PROVIDERS: Array<{
	key: string;
	name: string;
}> = [
	{
		key: RCLONE_DESTINATION_PROVIDERS.GOOGLE_DRIVE,
		name: "Google Drive (configured rclone remote)",
	},
	{
		key: RCLONE_DESTINATION_PROVIDERS.ONEDRIVE,
		name: "Microsoft OneDrive (configured rclone remote)",
	},
	{
		key: RCLONE_DESTINATION_PROVIDERS.SFTP,
		name: "SFTP",
	},
	{
		key: RCLONE_DESTINATION_PROVIDERS.FTP,
		name: "FTP",
	},
	{
		key: RCLONE_DESTINATION_PROVIDERS.REMOTE,
		name: "Other configured rclone remote",
	},
	...S3_PROVIDERS,
];
