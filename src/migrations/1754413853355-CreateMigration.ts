import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1754413853355 implements MigrationInterface {
    name = 'CreateMigration1754413853355'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" ADD "confirmationRequestedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" DROP COLUMN "confirmationRequestedAt"`);
    }

}
