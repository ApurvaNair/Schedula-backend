import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1754587881623 implements MigrationInterface {
    name = 'CreateMigration1754587881623'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "doctor" ADD "suggestNextAvailable" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "suggestNextAvailable"`);
    }

}
