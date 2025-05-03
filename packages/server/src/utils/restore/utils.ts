export const getPostgresRestoreCommand = (
	containerId: string,
	database: string,
	databaseUser: string,
) => {
	return `docker exec -i ${containerId} sh -c "pg_restore -U ${databaseUser} -d ${database} --clean --if-exists"`;
};

export const getMariadbRestoreCommand = (
	containerId: string,
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -i ${containerId} sh -c "mariadb -u ${databaseUser} -p${databasePassword} ${database}"`;
};

export const getMysqlRestoreCommand = (
	containerId: string,
	database: string,
	databasePassword: string,
) => {
	return `docker exec -i ${containerId} sh -c "mysql -u root -p${databasePassword} ${database}"`;
};

export const getMongoRestoreCommand = (
	containerId: string,
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -i ${containerId} sh -c "mongorestore --username ${databaseUser} --password ${databasePassword} --authenticationDatabase admin --db ${database} --archive"`;
};
