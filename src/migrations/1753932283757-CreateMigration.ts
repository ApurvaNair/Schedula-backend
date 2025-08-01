import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigration1753932283757 implements MigrationInterface {
    name = 'CreateMigration1753932283757'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" ALTER COLUMN "priority" SET DEFAULT '5'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" ALTER COLUMN "priority" DROP DEFAULT`);
    }

}
