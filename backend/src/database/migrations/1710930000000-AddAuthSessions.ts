import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from "typeorm";

export class AddAuthSessions1710930000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasUsersTable = await queryRunner.hasTable("users");
    if (!hasUsersTable) {
      return;
    }

    const hasAuthSessionsTable = await queryRunner.hasTable("auth_sessions");

    if (!hasAuthSessionsTable) {
      await queryRunner.createTable(
        new Table({
          name: "auth_sessions",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              default: "uuid_generate_v4()"
            },
            {
              name: "userId",
              type: "uuid",
              isNullable: false
            },
            {
              name: "refreshTokenHash",
              type: "varchar",
              length: "128",
              isNullable: false
            },
            {
              name: "expiresAt",
              type: "timestamptz",
              isNullable: false
            },
            {
              name: "isRevoked",
              type: "boolean",
              default: "false"
            },
            {
              name: "revokedAt",
              type: "timestamptz",
              isNullable: true
            },
            {
              name: "userAgent",
              type: "varchar",
              length: "512",
              isNullable: true
            },
            {
              name: "ipAddress",
              type: "varchar",
              length: "64",
              isNullable: true
            },
            {
              name: "clientType",
              type: "varchar",
              length: "20",
              default: "'web'"
            },
            {
              name: "lastUsedAt",
              type: "timestamptz",
              isNullable: true
            },
            {
              name: "createdAt",
              type: "timestamptz",
              default: "CURRENT_TIMESTAMP"
            },
            {
              name: "updatedAt",
              type: "timestamptz",
              default: "CURRENT_TIMESTAMP"
            }
          ]
        }),
        true
      );
    }

    const authSessionsTable = await queryRunner.getTable("auth_sessions");
    if (!authSessionsTable) {
      throw new Error("Failed to load auth_sessions table metadata after creation");
    }

    const hasUserForeignKey = authSessionsTable.foreignKeys.some(
      (foreignKey) =>
        foreignKey.columnNames.length === 1 &&
        foreignKey.columnNames[0] === "userId" &&
        foreignKey.referencedTableName === "users"
    );

    if (!hasUserForeignKey) {
      await queryRunner.createForeignKey(
        "auth_sessions",
        new TableForeignKey({
          columnNames: ["userId"],
          referencedTableName: "users",
          referencedColumnNames: ["id"],
          onDelete: "CASCADE"
        })
      );
    }

    const hasUserIdIndex = authSessionsTable.indices.some(
      (index) => index.name === "idx_auth_sessions_user_id"
    );
    if (!hasUserIdIndex) {
      await queryRunner.createIndex(
        "auth_sessions",
        new TableIndex({
          name: "idx_auth_sessions_user_id",
          columnNames: ["userId"]
        })
      );
    }

    const hasExpiresAtIndex = authSessionsTable.indices.some(
      (index) => index.name === "idx_auth_sessions_expires_at"
    );
    if (!hasExpiresAtIndex) {
      await queryRunner.createIndex(
        "auth_sessions",
        new TableIndex({
          name: "idx_auth_sessions_expires_at",
          columnNames: ["expiresAt"]
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("auth_sessions", "idx_auth_sessions_expires_at");
    await queryRunner.dropIndex("auth_sessions", "idx_auth_sessions_user_id");
    await queryRunner.dropTable("auth_sessions");
  }
}
