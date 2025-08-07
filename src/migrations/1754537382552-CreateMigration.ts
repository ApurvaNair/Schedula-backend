import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1754537382552 implements MigrationInterface {
    name = 'CreateMigration1754537382552'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" ADD "date" date`);
        await queryRunner.query(`ALTER TABLE "appointment" ADD "reason" character varying`);
        await queryRunner.query(`ALTER TABLE "appointment" ADD "time" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" DROP COLUMN "time"`);
        await queryRunner.query(`ALTER TABLE "appointment" DROP COLUMN "reason"`);
        await queryRunner.query(`ALTER TABLE "appointment" DROP COLUMN "date"`);
    }

}
