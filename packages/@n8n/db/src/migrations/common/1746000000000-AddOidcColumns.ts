import type { MigrationContext, ReversibleMigration } from '@/databases/types';

export class AddOidcColumns1746000000000 implements ReversibleMigration {
	async up({ schemaBuilder: { addColumns, column, createIndex } }: MigrationContext) {
		await addColumns('user', [
			column('oidcSubject').varchar(255),
			column('oidcIssuer').varchar(255),
		]);

		// Add index on oidcSubject for faster lookups during authentication
		await createIndex('user', ['oidcSubject'], { name: 'IDX_USER_OIDC_SUBJECT' });
	}

	async down({ schemaBuilder: { dropColumns, dropIndex } }: MigrationContext) {
		await dropIndex('user', 'IDX_USER_OIDC_SUBJECT');
		await dropColumns('user', ['oidcSubject', 'oidcIssuer']);
	}
}
