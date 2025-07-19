import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1752731696077 implements MigrationInterface {
    name = 'CreateMigration1752731696077'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "fullName"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP CONSTRAINT "UQ_0f0afbbadca812aa29a73dfe683"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "emailID"`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "name" character varying DEFAULT '' NOT NULL`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "gender" character varying`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "user_id" integer`);
        await queryRunner.query(`ALTER TABLE "patient" ADD CONSTRAINT "UQ_f20f0bf6b734938c710e12c2782" UNIQUE ("user_id")`);
        await queryRunner.query(`ALTER TABLE "patient" ADD CONSTRAINT "FK_f20f0bf6b734938c710e12c2782" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "patient" DROP CONSTRAINT "FK_f20f0bf6b734938c710e12c2782"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP CONSTRAINT "UQ_f20f0bf6b734938c710e12c2782"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "gender"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "emailID" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "patient" ADD CONSTRAINT "UQ_0f0afbbadca812aa29a73dfe683" UNIQUE ("emailID")`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "fullName" character varying NOT NULL`);
    }

}
