CREATE TABLE "catalog_brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tier" integer NOT NULL,
	"slug" text NOT NULL,
	"logo_asset_key" text,
	"retail_visible" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_brands_tier_check" CHECK ("catalog_brands"."tier" in (1, 2))
);
--> statement-breakpoint
ALTER TABLE "catalog_references" ADD COLUMN "brand_id" text;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD COLUMN "retail_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD COLUMN "photo_object_key" text;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD COLUMN "photo_source_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD COLUMN "photo_license" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD COLUMN "photo_attribution" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD COLUMN "market_source_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD COLUMN "market_retrieved_on" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD COLUMN "last_edited_by_staff_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_brands_slug_uidx" ON "catalog_brands" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "catalog_references" ADD CONSTRAINT "catalog_references_brand_id_catalog_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."catalog_brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD CONSTRAINT "catalog_references_last_edited_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("last_edited_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_references_brand_id_idx" ON "catalog_references" USING btree ("brand_id");--> statement-breakpoint
ALTER TABLE "catalog_references" ADD CONSTRAINT "catalog_references_retail_photo_check" CHECK (
      "catalog_references"."retail_visible" = false
      or "catalog_references"."photo_object_key" is not null
      or length(trim("catalog_references"."photo_source_url")) > 0
    );
--> statement-breakpoint
INSERT INTO "catalog_brands" ("id", "name", "tier", "slug", "logo_asset_key", "retail_visible", "sort_order") VALUES
('brand-a-lange-and-sohne', 'A. Lange & Söhne', 1, 'a-lange-and-sohne', NULL, false, 1),
('brand-audemars-piguet', 'Audemars Piguet', 1, 'audemars-piguet', NULL, false, 2),
('brand-christophe-claret', 'Christophe Claret', 1, 'christophe-claret', NULL, false, 3),
('brand-david-candaux', 'David Candaux', 1, 'david-candaux', NULL, false, 4),
('brand-de-bethune', 'De Bethune', 1, 'de-bethune', NULL, false, 5),
('brand-f-p-journe', 'F.P. Journe', 1, 'f-p-journe', NULL, false, 6),
('brand-greubel-forsey', 'Greubel Forsey', 1, 'greubel-forsey', NULL, false, 7),
('brand-gronefeld', 'Grönefeld', 1, 'gronefeld', NULL, false, 8),
('brand-kari-voutilainen', 'Kari Voutilainen', 1, 'kari-voutilainen', NULL, false, 9),
('brand-laurent-ferrier', 'Laurent Ferrier', 1, 'laurent-ferrier', NULL, false, 10),
('brand-maitres-du-temps', 'Maîtres du Temps', 1, 'maitres-du-temps', NULL, false, 11),
('brand-mbandf', 'MB&F', 1, 'mbandf', NULL, false, 12),
('brand-patek-philippe', 'Patek Philippe', 1, 'patek-philippe', NULL, false, 13),
('brand-philippe-dufour', 'Philippe Dufour', 1, 'philippe-dufour', NULL, false, 14),
('brand-richard-mille', 'Richard Mille', 1, 'richard-mille', NULL, false, 15),
('brand-roger-dubuis', 'Roger Dubuis', 1, 'roger-dubuis', NULL, false, 16),
('brand-rolex', 'Rolex', 1, 'rolex', NULL, false, 17),
('brand-romain-gauthier', 'Romain Gauthier', 1, 'romain-gauthier', NULL, false, 18),
('brand-urwerk', 'Urwerk', 1, 'urwerk', NULL, false, 19),
('brand-vacheron-constantin', 'Vacheron Constantin', 1, 'vacheron-constantin', NULL, false, 20),
('brand-akrivia', 'Akrivia', 2, 'akrivia', NULL, false, 21),
('brand-bell-and-ross', 'Bell & Ross', 2, 'bell-and-ross', NULL, false, 22),
('brand-blancpain', 'Blancpain', 2, 'blancpain', NULL, false, 23),
('brand-breguet', 'Breguet', 2, 'breguet', NULL, false, 24),
('brand-breitling', 'Breitling', 2, 'breitling', NULL, false, 25),
('brand-cartier', 'Cartier', 2, 'cartier', NULL, false, 26),
('brand-chopard', 'Chopard', 2, 'chopard', NULL, false, 27),
('brand-daniel-roth', 'Daniel Roth', 2, 'daniel-roth', NULL, false, 28),
('brand-dewitt', 'DeWitt', 2, 'dewitt', NULL, false, 29),
('brand-franck-muller', 'Franck Muller', 2, 'franck-muller', NULL, false, 30),
('brand-girard-perregaux', 'Girard-Perregaux', 2, 'girard-perregaux', NULL, false, 31),
('brand-glashutte', 'Glashütte', 2, 'glashutte', NULL, false, 32),
('brand-graham', 'Graham', 2, 'graham', NULL, false, 33),
('brand-grand-seiko', 'Grand Seiko', 2, 'grand-seiko', NULL, false, 34),
('brand-h-moser-and-cie', 'H. Moser & Cie', 2, 'h-moser-and-cie', NULL, false, 35),
('brand-harry-winston', 'Harry Winston', 2, 'harry-winston', NULL, false, 36),
('brand-hublot', 'Hublot', 2, 'hublot', NULL, false, 37),
('brand-hyt', 'HYT', 2, 'hyt', NULL, false, 38),
('brand-iwc', 'IWC', 2, 'iwc', NULL, false, 39),
('brand-jaquet-droz', 'Jaquet Droz', 2, 'jaquet-droz', NULL, false, 40),
('brand-jaeger-lecoultre', 'Jaeger-LeCoultre', 2, 'jaeger-lecoultre', NULL, false, 41),
('brand-nomos', 'Nomos', 2, 'nomos', NULL, false, 42),
('brand-omega', 'Omega', 2, 'omega', NULL, false, 43),
('brand-panerai', 'Panerai', 2, 'panerai', NULL, false, 44),
('brand-parmigiani', 'Parmigiani', 2, 'parmigiani', NULL, false, 45),
('brand-piaget', 'Piaget', 2, 'piaget', NULL, false, 46),
('brand-ressence', 'Ressence', 2, 'ressence', NULL, false, 47),
('brand-romain-jerome', 'Romain Jerome', 2, 'romain-jerome', NULL, false, 48),
('brand-tag-heuer', 'TAG Heuer', 2, 'tag-heuer', NULL, false, 49),
('brand-tudor', 'Tudor', 2, 'tudor', NULL, false, 50),
('brand-ulysse-nardin', 'Ulysse Nardin', 2, 'ulysse-nardin', NULL, false, 51),
('brand-urban-jurgensen', 'Urban Jürgensen', 2, 'urban-jurgensen', NULL, false, 52),
('brand-zenith', 'Zenith', 2, 'zenith', NULL, false, 53)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "catalog_references" AS c
SET "brand_id" = b."id"
FROM "catalog_brands" AS b
WHERE c."brand_id" IS NULL AND lower(c."brand") = lower(b."name");
--> statement-breakpoint
INSERT INTO "catalog_brands" ("id", "name", "tier", "slug", "retail_visible", "sort_order")
SELECT
  'brand-legacy-' || md5(lower(c."brand")),
  c."brand",
  2,
  'legacy-' || md5(lower(c."brand")),
  false,
  1000
FROM (SELECT DISTINCT "brand" FROM "catalog_references" WHERE "brand_id" IS NULL) AS c
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "catalog_references" AS c
SET "brand_id" = b."id"
FROM "catalog_brands" AS b
WHERE c."brand_id" IS NULL AND lower(c."brand") = lower(b."name");
--> statement-breakpoint
INSERT INTO "catalog_references" (
  "id", "brand_id", "brand", "model", "reference", "case_metal", "case_diameter",
  "typical_low_cents", "typical_high_cents", "financeable", "notes",
  "retail_visible", "photo_object_key", "photo_source_url", "photo_license",
  "photo_attribution", "market_source_urls", "market_retrieved_on", "last_edited_by_staff_id"
) VALUES
('model-a-lange-and-sohne-lange-1', 'brand-a-lange-and-sohne', 'A. Lange & Söhne', 'Lange 1', '191.032', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-audemars-piguet-royal-oak-selfwinding', 'brand-audemars-piguet', 'Audemars Piguet', 'Royal Oak Selfwinding', '15400ST', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-christophe-claret-marguerite', 'brand-christophe-claret', 'Christophe Claret', 'Marguerite', 'MTR.DUB11', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-david-candaux-dc6', 'brand-david-candaux', 'David Candaux', 'DC6', 'DC6', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-de-bethune-db28', 'brand-de-bethune', 'De Bethune', 'DB28', 'DB28', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-f-p-journe-chronometre-bleu', 'brand-f-p-journe', 'F.P. Journe', 'Chronomètre Bleu', 'CB', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-greubel-forsey-double-tourbillon-30', 'brand-greubel-forsey', 'Greubel Forsey', 'Double Tourbillon 30°', 'DT30', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-gronefeld-1941-reminiscence', 'brand-gronefeld', 'Grönefeld', '1941 Reminiscence', '1941', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-kari-voutilainen-vingt-8', 'brand-kari-voutilainen', 'Kari Voutilainen', 'Vingt-8', 'Vingt-8', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-laurent-ferrier-galet-square', 'brand-laurent-ferrier', 'Laurent Ferrier', 'Galet Square', 'LCF013', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-maitres-du-temps-chapter-three', 'brand-maitres-du-temps', 'Maîtres du Temps', 'Chapter Three', 'Chapter Three', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-mbandf-legacy-machine', 'brand-mbandf', 'MB&F', 'Legacy Machine', 'LM1', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-patek-philippe-nautilus', 'brand-patek-philippe', 'Patek Philippe', 'Nautilus', '5711/1A', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-philippe-dufour-simplicity', 'brand-philippe-dufour', 'Philippe Dufour', 'Simplicity', 'Simplicity', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-richard-mille-rm-011', 'brand-richard-mille', 'Richard Mille', 'RM 011', 'RM 011', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-roger-dubuis-excalibur', 'brand-roger-dubuis', 'Roger Dubuis', 'Excalibur', 'RDDBEX', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-rolex-daytona', 'brand-rolex', 'Rolex', 'Daytona', '116500LN', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-romain-gauthier-logical-one', 'brand-romain-gauthier', 'Romain Gauthier', 'Logical One', 'Logical One', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-urwerk-ur-210', 'brand-urwerk', 'Urwerk', 'UR-210', 'UR-210', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-vacheron-constantin-overseas', 'brand-vacheron-constantin', 'Vacheron Constantin', 'Overseas', '4500V', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-akrivia-ak-06', 'brand-akrivia', 'Akrivia', 'AK-06', 'AK-06', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-bell-and-ross-br-03', 'brand-bell-and-ross', 'Bell & Ross', 'BR 03', 'BR03-92', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-blancpain-fifty-fathoms', 'brand-blancpain', 'Blancpain', 'Fifty Fathoms', '5015', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-breguet-classique', 'brand-breguet', 'Breguet', 'Classique', '5177', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-breitling-navitimer', 'brand-breitling', 'Breitling', 'Navitimer', 'AB0121', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-cartier-santos', 'brand-cartier', 'Cartier', 'Santos', 'WSSA0018', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-chopard-l-u-c', 'brand-chopard', 'Chopard', 'L.U.C', '161944', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-daniel-roth-tourbillon-souscription', 'brand-daniel-roth', 'Daniel Roth', 'Tourbillon Souscription', 'DR001', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-dewitt-academia', 'brand-dewitt', 'DeWitt', 'Academia', 'AC.GMT', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-franck-muller-vanguard', 'brand-franck-muller', 'Franck Muller', 'Vanguard', 'V 45 SC DT', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-girard-perregaux-laureato', 'brand-girard-perregaux', 'Girard-Perregaux', 'Laureato', '81010', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-glashutte-original-senator', 'brand-glashutte', 'Glashütte', 'Original Senator', '1-36-04', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-graham-chronofighter', 'brand-graham', 'Graham', 'Chronofighter', '2CCAC', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-grand-seiko-snowflake', 'brand-grand-seiko', 'Grand Seiko', 'Snowflake', 'SBGA211', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-h-moser-and-cie-endeavour', 'brand-h-moser-and-cie', 'H. Moser & Cie', 'Endeavour', '1200-0200', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-harry-winston-ocean', 'brand-harry-winston', 'Harry Winston', 'Ocean', 'OCEATD', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-hublot-big-bang', 'brand-hublot', 'Hublot', 'Big Bang', '441.NX', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-hyt-h1', 'brand-hyt', 'HYT', 'H1', 'H1', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-iwc-portugieser', 'brand-iwc', 'IWC', 'Portugieser', 'IW3716', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-jaquet-droz-grande-seconde', 'brand-jaquet-droz', 'Jaquet Droz', 'Grande Seconde', 'J003030', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-jaeger-lecoultre-reverso', 'brand-jaeger-lecoultre', 'Jaeger-LeCoultre', 'Reverso', 'Q39784', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-nomos-tangente', 'brand-nomos', 'Nomos', 'Tangente', '139', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-omega-speedmaster', 'brand-omega', 'Omega', 'Speedmaster', '310.30', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-panerai-luminor', 'brand-panerai', 'Panerai', 'Luminor', 'PAM01312', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-parmigiani-tonda', 'brand-parmigiani', 'Parmigiani', 'Tonda', 'PFC273', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-piaget-altiplano', 'brand-piaget', 'Piaget', 'Altiplano', 'G0A40088', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-ressence-type-3', 'brand-ressence', 'Ressence', 'Type 3', 'Type 3', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-romain-jerome-titanic-dna', 'brand-romain-jerome', 'Romain Jerome', 'Titanic DNA', 'T-DNA', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-tag-heuer-carrera', 'brand-tag-heuer', 'TAG Heuer', 'Carrera', 'CBN2A1A', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-tudor-black-bay', 'brand-tudor', 'Tudor', 'Black Bay', '79230N', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-ulysse-nardin-marine', 'brand-ulysse-nardin', 'Ulysse Nardin', 'Marine', '1183-170', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-urban-jurgensen-reference-11', 'brand-urban-jurgensen', 'Urban Jürgensen', 'Reference 11', 'Ref. 11', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL),
('model-zenith-el-primero', 'brand-zenith', 'Zenith', 'El Primero', '03.2040.400', '', '', 0, 0, false, '', false, NULL, '', '', '', '[]'::jsonb, NULL, NULL)
ON CONFLICT ("id") DO NOTHING;
