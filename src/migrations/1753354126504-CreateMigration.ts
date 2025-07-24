import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1753354126504 implements MigrationInterface {
    name = 'CreateMigration1753354126504'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "slot" DROP CONSTRAINT "FK_bdc4360dc3145401d1de2bf8d01"`);
        await queryRunner.query(`ALTER TABLE "slot" RENAME COLUMN "currentBookings" TO "bufferDuration"`);
        await queryRunner.query(`ALTER TABLE "slot" ALTER COLUMN "mode" SET DEFAULT 'stream'`);
        await queryRunner.query(`ALTER TABLE "slot" ALTER COLUMN "slotDuration" SET DEFAULT '15'`);
        await queryRunner.query(`ALTER TABLE "slot" ALTER COLUMN "bufferDuration" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "slot" ALTER COLUMN "bufferDuration" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "slot" ADD CONSTRAINT "FK_bdc4360dc3145401d1de2bf8d01" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "slot" DROP CONSTRAINT "FK_bdc4360dc3145401d1de2bf8d01"`);
        await queryRunner.query(`ALTER TABLE "slot" ALTER COLUMN "bufferDuration" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "slot" ALTER COLUMN "bufferDuration" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "slot" ALTER COLUMN "slotDuration" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "slot" ALTER COLUMN "mode" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "slot" RENAME COLUMN "bufferDuration" TO "currentBookings"`);
        await queryRunner.query(`ALTER TABLE "slot" ADD CONSTRAINT "FK_bdc4360dc3145401d1de2bf8d01" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
