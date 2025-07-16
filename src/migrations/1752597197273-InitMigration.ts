import { MigrationInterface, QueryRunner } from "typeorm";

export class InitMigration1752597197273 implements MigrationInterface {
    name = 'InitMigration1752597197273'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" RENAME COLUMN "email" TO "emailID"`);
        await queryRunner.query(`ALTER TABLE "user" RENAME CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" TO "UQ_5a1c4a2cebbe088c71e27a5912e"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" RENAME CONSTRAINT "UQ_5a1c4a2cebbe088c71e27a5912e" TO "UQ_e12875dfb3b1d92d7d7c5377e22"`);
        await queryRunner.query(`ALTER TABLE "user" RENAME COLUMN "emailID" TO "email"`);
    }

}
