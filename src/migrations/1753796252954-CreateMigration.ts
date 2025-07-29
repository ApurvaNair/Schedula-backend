import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1753796252954 implements MigrationInterface {
    name = 'CreateMigration1753796252954'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "slot" DROP COLUMN "recurringId"`);
        await queryRunner.query(`ALTER TABLE "slot" ADD "recurringId" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "slot" DROP COLUMN "recurringId"`);
        await queryRunner.query(`ALTER TABLE "slot" ADD "recurringId" character varying`);
    }

}
