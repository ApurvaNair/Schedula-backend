import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1752669950778 implements MigrationInterface {
    name = 'CreateMigration1752669950778'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" RENAME COLUMN "emailID" TO "email"`);
        await queryRunner.query(`ALTER TABLE "user" RENAME CONSTRAINT "UQ_5a1c4a2cebbe088c71e27a5912e" TO "UQ_e12875dfb3b1d92d7d7c5377e22"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" RENAME CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" TO "UQ_5a1c4a2cebbe088c71e27a5912e"`);
        await queryRunner.query(`ALTER TABLE "user" RENAME COLUMN "email" TO "emailID"`);
    }

}
