/** Accepted manufacturers from mechanicalartcapital.com, two tiers (R37). */

export const CATALOG_TIER_ONE = [
  ["A. Lange & Söhne", "Lange 1", "191.032"],
  ["Audemars Piguet", "Royal Oak Selfwinding", "15400ST"],
  ["Christophe Claret", "Marguerite", "MTR.DUB11"],
  ["David Candaux", "DC6", "DC6"],
  ["De Bethune", "DB28", "DB28"],
  ["F.P. Journe", "Chronomètre Bleu", "CB"],
  ["Greubel Forsey", "Double Tourbillon 30°", "DT30"],
  ["Grönefeld", "1941 Reminiscence", "1941"],
  ["Kari Voutilainen", "Vingt-8", "Vingt-8"],
  ["Laurent Ferrier", "Galet Square", "LCF013"],
  ["Maîtres du Temps", "Chapter Three", "Chapter Three"],
  ["MB&F", "Legacy Machine", "LM1"],
  ["Patek Philippe", "Nautilus", "5711/1A"],
  ["Philippe Dufour", "Simplicity", "Simplicity"],
  ["Richard Mille", "RM 011", "RM 011"],
  ["Roger Dubuis", "Excalibur", "RDDBEX"],
  ["Rolex", "Daytona", "116500LN"],
  ["Romain Gauthier", "Logical One", "Logical One"],
  ["Urwerk", "UR-210", "UR-210"],
  ["Vacheron Constantin", "Overseas", "4500V"],
];

export const CATALOG_TIER_TWO = [
  ["Akrivia", "AK-06", "AK-06"],
  ["Bell & Ross", "BR 03", "BR03-92"],
  ["Blancpain", "Fifty Fathoms", "5015"],
  ["Breguet", "Classique", "5177"],
  ["Breitling", "Navitimer", "AB0121"],
  ["Cartier", "Santos", "WSSA0018"],
  ["Chopard", "L.U.C", "161944"],
  ["Daniel Roth", "Tourbillon Souscription", "DR001"],
  ["DeWitt", "Academia", "AC.GMT"],
  ["Franck Muller", "Vanguard", "V 45 SC DT"],
  ["Girard-Perregaux", "Laureato", "81010"],
  ["Glashütte", "Original Senator", "1-36-04"],
  ["Graham", "Chronofighter", "2CCAC"],
  ["Grand Seiko", "Snowflake", "SBGA211"],
  ["H. Moser & Cie", "Endeavour", "1200-0200"],
  ["Harry Winston", "Ocean", "OCEATD"],
  ["Hublot", "Big Bang", "441.NX"],
  ["HYT", "H1", "H1"],
  ["IWC", "Portugieser", "IW3716"],
  ["Jaquet Droz", "Grande Seconde", "J003030"],
  ["Jaeger-LeCoultre", "Reverso", "Q39784"],
  ["Nomos", "Tangente", "139"],
  ["Omega", "Speedmaster", "310.30"],
  ["Panerai", "Luminor", "PAM01312"],
  ["Parmigiani", "Tonda", "PFC273"],
  ["Piaget", "Altiplano", "G0A40088"],
  ["Ressence", "Type 3", "Type 3"],
  ["Romain Jerome", "Titanic DNA", "T-DNA"],
  ["TAG Heuer", "Carrera", "CBN2A1A"],
  ["Tudor", "Black Bay", "79230N"],
  ["Ulysse Nardin", "Marine", "1183-170"],
  ["Urban Jürgensen", "Reference 11", "Ref. 11"],
  ["Zenith", "El Primero", "03.2040.400"],
];

export function catalogBrandSlug(name) {
  return String(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function rowsFor(entries, tier, startSort) {
  return entries.map(([name, model, reference], index) => {
    const slug = catalogBrandSlug(name);
    return {
      brand: {
        id: `brand-${slug}`,
        name,
        tier,
        slug,
        logoAssetKey: null,
        retailVisible: false,
        sortOrder: startSort + index,
      },
      model: {
        id: `model-${slug}-${catalogBrandSlug(model)}`,
        brandId: `brand-${slug}`,
        brand: name,
        model,
        reference,
        caseMetal: "",
        caseDiameter: "",
        typicalLow: 0,
        typicalHigh: 0,
        financeable: false,
        notes: "",
        retailVisible: false,
        photoObjectKey: null,
        photoSourceUrl: "",
        photoLicense: "",
        photoAttribution: "",
        marketSourceUrls: [],
        marketRetrievedOn: null,
        lastEditedByStaffId: null,
      },
    };
  });
}

export function catalogSeedRows() {
  return [
    ...rowsFor(CATALOG_TIER_ONE, 1, 1),
    ...rowsFor(CATALOG_TIER_TWO, 2, 21),
  ];
}

export function catalogSeedBrands() {
  return catalogSeedRows().map((row) => row.brand);
}

export function catalogSeedModels() {
  return catalogSeedRows().map((row) => row.model);
}

export function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function catalogSeedSql() {
  const brands = catalogSeedBrands()
    .map((brand) =>
      `(${[
        sqlLiteral(brand.id),
        sqlLiteral(brand.name),
        sqlLiteral(brand.tier),
        sqlLiteral(brand.slug),
        "NULL",
        "false",
        sqlLiteral(brand.sortOrder),
      ].join(", ")})`)
    .join(",\n");
  const models = catalogSeedModels()
    .map((model) =>
      `(${[
        sqlLiteral(model.id),
        sqlLiteral(model.brandId),
        sqlLiteral(model.brand),
        sqlLiteral(model.model),
        sqlLiteral(model.reference),
        sqlLiteral(""),
        sqlLiteral(""),
        "0",
        "0",
        "false",
        sqlLiteral(""),
        "false",
        "NULL",
        sqlLiteral(""),
        sqlLiteral(""),
        sqlLiteral(""),
        `'[]'::jsonb`,
        "NULL",
        "NULL",
      ].join(", ")})`)
    .join(",\n");
  return { brands, models };
}
