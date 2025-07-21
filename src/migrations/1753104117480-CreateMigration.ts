import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1753104117480 implements MigrationInterface {
    name = 'CreateMigration1753104117480'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "slot" ALTER COLUMN "maxBookings" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "slot" ALTER COLUMN "maxBookings" SET NOT NULL`);
    }

}
