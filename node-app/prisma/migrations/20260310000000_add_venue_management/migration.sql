-- CreateTable: tbl_venue (physical event locations)
CREATE TABLE "tbl_venue" (
    "venue_id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "status" "status_active_archived" NOT NULL DEFAULT 'Active',
    "created_by" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(6),
    "archived_by" VARCHAR(200),
    "archived_reason" VARCHAR(255),

    CONSTRAINT "tbl_venue_pkey" PRIMARY KEY ("venue_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_venue_name_key" ON "tbl_venue"("name");

-- CreateTable: tbl_event_venue (event ↔ venue junction)
CREATE TABLE "tbl_event_venue" (
    "event_id" INTEGER NOT NULL,
    "venue_id" INTEGER NOT NULL,

    CONSTRAINT "tbl_event_venue_pkey" PRIMARY KEY ("event_id","venue_id")
);

-- AddForeignKey
ALTER TABLE "tbl_venue" ADD CONSTRAINT "tbl_venue_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "tbl_user"("user_id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_venue" ADD CONSTRAINT "tbl_venue_archived_by_fkey"
    FOREIGN KEY ("archived_by") REFERENCES "tbl_user"("user_id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_venue" ADD CONSTRAINT "tbl_event_venue_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_venue" ADD CONSTRAINT "tbl_event_venue_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "tbl_venue"("venue_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
