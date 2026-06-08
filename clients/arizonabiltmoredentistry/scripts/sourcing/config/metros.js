// Metro registry — the 100 largest US MSAs (2025 Census estimates).
//
// Each metro is parsed from its Census name into a record the pipeline can run:
//   { key, label, primaryCity, state, geocodeQuery, pop, radiusMeters }
//
// The pipeline geocodes `geocodeQuery` once → metro center, then runs
// geo-biased Places searches within `radiusMeters` to pull the most-prominent
// practices metro-wide (suburbs included — no per-city list needed).
//
// `key` is the CLI handle: `node run.js --metro dallas-tx`. Run `--list-metros`
// to see them all.

// Raw source: "<MSA name>|<2025 population>". The name uses EN DASHES (–)
// between cities and HYPHENS (-) inside city names, exactly as the Census does,
// so we can split cities on the en dash reliably.
const RAW = `
New York–Newark–Jersey City, NY-NJ|20112448
Los Angeles–Long Beach–Anaheim, CA|12844441
Chicago–Naperville–Elgin, IL-IN|9434123
Dallas–Fort Worth–Arlington, TX|8477157
Houston–Pasadena–The Woodlands, TX|7904627
Atlanta–Sandy Springs–Roswell, GA|6482182
Washington–Arlington–Alexandria, DC-VA-MD-WV|6465724
Miami–Fort Lauderdale–West Palm Beach, FL|6391072
Philadelphia–Camden–Wilmington, PA-NJ-DE-MD|6329118
Phoenix–Mesa–Chandler, AZ|5228938
Boston–Cambridge–Newton, MA-NH|5034221
Riverside–San Bernardino–Ontario, CA|4769007
San Francisco–Oakland–Fremont, CA|4630041
Detroit–Warren–Dearborn, MI|4390913
Seattle–Tacoma–Bellevue, WA|4161883
Minneapolis–St. Paul–Bloomington, MN-WI|3790295
Tampa–St. Petersburg–Clearwater, FL|3418895
San Diego–Chula Vista–Carlsbad, CA|3282248
Denver–Aurora–Centennial, CO|3092037
Orlando–Kissimmee–Sanford, FL|2957672
Charlotte–Concord–Gastonia, NC-SC|2938830
Baltimore–Columbia–Towson, MD|2857781
St. Louis, MO-IL|2814421
San Antonio–New Braunfels, TX|2813140
Austin–Round Rock–San Marcos, TX|2620945
Portland–Vancouver–Hillsboro, OR-WA|2542282
Sacramento–Roseville–Folsom, CA|2477274
Pittsburgh, PA|2421992
Las Vegas–Henderson–North Las Vegas, NV|2407226
Cincinnati, OH-KY-IN|2312858
Kansas City, MO-KS|2270682
Columbus, OH|2242028
Indianapolis–Carmel–Greenwood, IN|2205695
Nashville-Davidson–Murfreesboro–Franklin, TN|2197416
Cleveland, OH|2165775
San Jose–Sunnyvale–Santa Clara, CA|1984473
Virginia Beach–Norfolk–Newport News, VA-NC|1797213
Jacksonville, FL|1785500
Providence–Warwick, RI-MA|1708161
Raleigh–Cary, NC|1595720
Milwaukee–Waukesha, WI|1575010
Oklahoma City, OK|1512813
Louisville/Jefferson County, KY-IN|1402509
Richmond, VA|1389338
Memphis, TN-MS-AR|1341412
Salt Lake City–Murray, UT|1308377
Fresno, CA|1203383
Birmingham, AL|1197766
Grand Rapids–Wyoming–Kentwood, MI|1183645
Hartford–West Hartford–East Hartford, CT|1171426
Buffalo–Cheektowaga, NY|1155653
Tucson, AZ|1074685
Tulsa, OK|1069273
Rochester, NY|1056149
Greenville–Anderson–Greer, SC|1014101
Omaha, NE-IA|1009836
Urban Honolulu, HI|988703
Bridgeport–Stamford–Danbury, CT|978179
New Orleans–Metairie, LA|970849
Knoxville, TN|968137
North Port–Bradenton–Sarasota, FL|948158
Bakersfield–Delano, CA|927068
Albuquerque, NM|925279
McAllen–Edinburg–Mission, TX|921549
Albany–Schenectady–Troy, NY|915835
Charleston–North Charleston, SC|889263
Baton Rouge, LA|888699
Worcester, MA|888502
Allentown–Bethlehem–Easton, PA-NJ|887615
El Paso, TX|881291
Columbia, SC|879918
Cape Coral–Fort Myers, FL|875607
Lakeland–Winter Haven, FL|874790
Boise City, ID|864243
Oxnard–Thousand Oaks–Ventura, CA|830851
Dayton–Kettering–Beavercreek, OH|826554
Stockton–Lodi, CA|823815
Greensboro–High Point, NC|805945
Colorado Springs, CO|781796
Little Rock–North Little Rock–Conway, AR|777607
Provo–Orem–Lehi, UT|773426
Des Moines–West Des Moines, IA|758539
Deltona–Daytona Beach–Ormond Beach, FL|746933
Kiryas Joel–Poughkeepsie–Newburgh, NY|718377
Winston-Salem, NC|712206
Madison, WI|709685
Akron, OH|701780
Ogden, UT|672784
Palm Bay–Melbourne–Titusville, FL|663982
Wichita, KS|663809
Syracuse, NY|652273
Augusta-Richmond County, GA-SC|641231
Durham–Chapel Hill, NC|625485
Fayetteville–Springdale–Rogers, AR|622177
Harrisburg–Carlisle, PA|617427
Jackson, MS|609847
Spokane–Spokane Valley, WA|608012
Toledo, OH|599376
Chattanooga, TN-GA|594530
New Haven, CT|578741
`.trim();

function slug(s) {
  return s.toLowerCase()
    .replace(/\./g, '')          // "St. Louis" → "st louis"
    .replace(/\//g, '-')         // "Louisville/Jefferson" → "louisville-jefferson"
    .replace(/[^a-z0-9]+/g, '-') // spaces/punct → dash
    .replace(/^-+|-+$/g, '');
}

// Radius (meters) scaled by metro population — bigger metro, wider sweep.
function radiusForPop(pop) {
  if (pop >= 5_000_000) return 50_000;
  if (pop >= 2_000_000) return 40_000;
  if (pop >= 1_000_000) return 30_000;
  return 22_000;
}

function parseLine(line) {
  const [namePart, popStr] = line.split('|');
  const pop = parseInt(popStr, 10);
  // Split off the trailing state group on the LAST comma: "…, TX-OK"
  const lastComma = namePart.lastIndexOf(',');
  const cityPart = namePart.slice(0, lastComma).trim();
  const stateGroup = namePart.slice(lastComma + 1).trim(); // e.g. "NY-NJ"
  const primaryState = stateGroup.split('-')[0];           // geocode w/ the first state
  const cities = cityPart.split('–').map((c) => c.trim()); // en-dash between cities
  const primaryCity = cities[0];
  return {
    key: `${slug(primaryCity)}-${primaryState.toLowerCase()}`,
    label: `${cityPart}, ${stateGroup}`,
    primaryCity,
    state: primaryState,
    geocodeQuery: `${primaryCity}, ${primaryState}`,
    pop,
    radiusMeters: radiusForPop(pop),
  };
}

const METROS = RAW.split('\n').map(parseLine);
const BY_KEY = new Map(METROS.map((m) => [m.key, m]));

export function getMetro(key) {
  return BY_KEY.get(key) || null;
}

export function listMetros() {
  return METROS.map((m) => ({ key: m.key, label: m.label, pop: m.pop }));
}

export function allMetros() {
  return METROS;
}

// Specialty query terms run alongside the generic "dentist" sweep. The generic
// term is the prominence backbone; specialties surface higher-ticket practices
// (cosmetic/ortho/implants/pediatric) that may rank lower on a generic search.
export const QUERY_TERMS = [
  'dentist',
  'cosmetic dentist',
  'orthodontist',
  'dental implants',
  'pediatric dentist',
];
