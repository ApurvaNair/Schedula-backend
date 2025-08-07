import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1754319445358 implements MigrationInterface {
    name = 'CreateMigration1754319445358'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" ADD "isConfirmed" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" DROP COLUMN "isConfirmed"`);
    }

}
