import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1752666266173 implements MigrationInterface {
    name = 'CreateMigration1752666266173'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD "role" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "role"`);
    }

}
