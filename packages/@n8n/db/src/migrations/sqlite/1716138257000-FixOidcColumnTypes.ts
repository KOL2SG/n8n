import type { IrreversibleMigration, MigrationContext } from '@/databases/types';

/**
 * Fix SQLite compatibility issues with OIDC fields
 */
export class FixOidcColumnTypes1716138257000 implements IrreversibleMigration {
	name = 'FixOidcColumnTypes1716138257000';

	async up({ queryRunner, tablePrefix }: MigrationContext): Promise<void> {
		// Check if the user table exists
		const userTable = await queryRunner.getTable(`${tablePrefix}user`);
		if (!userTable) {
			console.log('User table not found, skipping OIDC fields fix');
			return;
		}

		// Check if columns exist and fix if needed
		const oidcSubjectColumn = userTable.findColumnByName('oidcSubject');
		const oidcIssuerColumn = userTable.findColumnByName('oidcIssuer');

		// If columns don't exist, add them with correct TEXT type
		if (!oidcSubjectColumn) {
			await queryRunner.query(`ALTER TABLE ${tablePrefix}"user" ADD COLUMN "oidcSubject" TEXT`);
			// Create index for oidcSubject
			await queryRunner.query(
				`CREATE INDEX "IDX_user_oidcSubject" ON ${tablePrefix}"user" ("oidcSubject")`,
			);
			console.log('Added oidcSubject column with TEXT type');
		} else {
			console.log('oidcSubject column already exists, checking type compatibility');
			// If column exists but has wrong type, we need to fix with table recreation
			// This is complex in SQLite, so we'll attempt to check type
			const columnInfo = await queryRunner.query(`PRAGMA table_info("${tablePrefix}user")`);
			const oidcSubjectInfo = columnInfo.find((col: any) => col.name === 'oidcSubject');

			if (oidcSubjectInfo && oidcSubjectInfo.type !== 'TEXT') {
				console.log('oidcSubject has incompatible type, fixing...');
				// SQLite doesn't allow ALTER COLUMN, so we need table recreation
				await this.recreateUserTableWithCorrectTypes(queryRunner, tablePrefix);
				return; // Skip further steps as table was recreated with all fixes
			}
		}

		if (!oidcIssuerColumn) {
			await queryRunner.query(`ALTER TABLE ${tablePrefix}"user" ADD COLUMN "oidcIssuer" TEXT`);
			console.log('Added oidcIssuer column with TEXT type');
		} else {
			console.log('oidcIssuer column already exists');
			// Type checking handled in the recreation step above if needed
		}
	}

	/**
	 * Helper method to recreate the user table with correct column types
	 */
	private async recreateUserTableWithCorrectTypes(
		queryRunner: any,
		tablePrefix: string,
	): Promise<void> {
		// Get all column information
		const columnInfo = await queryRunner.query(`PRAGMA table_info("${tablePrefix}user")`);

		// Create a backup table
		await queryRunner.query(
			`CREATE TABLE "${tablePrefix}user_backup" AS SELECT * FROM "${tablePrefix}user"`,
		);
		console.log('Created user_backup table with current data');

		// Drop the original table
		await queryRunner.query(`DROP TABLE "${tablePrefix}user"`);

		// Create list of all columns except OIDC columns
		const columnDefinitions = columnInfo
			.filter((col: any) => col.name !== 'oidcSubject' && col.name !== 'oidcIssuer')
			.map((col: any) => {
				const nullable = col.notnull === 0 ? '' : ' NOT NULL';
				const defaultVal = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
				return `"${col.name}" ${col.type}${nullable}${defaultVal}`;
			})
			.join(', ');

		// Create new table with correct column types
		await queryRunner.query(`
			CREATE TABLE "${tablePrefix}user" (
				${columnDefinitions},
				"oidcSubject" TEXT,
				"oidcIssuer" TEXT
			)
		`);
		console.log('Recreated user table with correct column types');

		// Copy data from backup
		await queryRunner.query(
			`INSERT INTO "${tablePrefix}user" SELECT * FROM "${tablePrefix}user_backup"`,
		);
		console.log('Restored data from backup');

		// Drop backup table
		await queryRunner.query(`DROP TABLE "${tablePrefix}user_backup"`);

		// Recreate indexes
		const indexInfo = await queryRunner.query(
			`SELECT * FROM sqlite_master WHERE type='index' AND tbl_name='${tablePrefix}user'`,
		);
		for (const index of indexInfo) {
			if (!index.sql) continue;
			try {
				await queryRunner.query(index.sql);
				console.log(`Recreated index: ${index.name}`);
			} catch (error) {
				console.log(`Failed to recreate index: ${index.name}`, error);
			}
		}

		// Ensure we have an index for oidcSubject
		try {
			await queryRunner.query(
				`CREATE INDEX IF NOT EXISTS "IDX_user_oidcSubject" ON "${tablePrefix}user" ("oidcSubject")`,
			);
		} catch (error) {
			console.log('Error creating oidcSubject index', error);
		}
	}

	// This is an irreversible migration - no down method
}
