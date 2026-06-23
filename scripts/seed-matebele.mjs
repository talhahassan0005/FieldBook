/**
 * Seed the EXACT "MATEBELE2022" Leica field book (from the client's sample) so the
 * generated report matches the original 1:1 — every section, every value.
 *
 * Non-destructive: only removes a previous MATEBELE2022 job (and its points),
 * then recreates it. Other jobs are left untouched.
 *
 *   node scripts/seed-matebele.mjs       (or: npm run seed:matebele)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { computeSurveyPoint } from "../src/lib/survey-core.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}

const POSITION_LIMIT = 0.05;
const HEIGHT_LIMIT = 0.075;

/* ----------------------------- schemas (self-contained) ----------------------------- */
const jobSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const controlSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const surveySchema = new mongoose.Schema({}, { strict: false, timestamps: true });

const Job = mongoose.model("Job", jobSchema);
const ControlPoint = mongoose.model("ControlPoint", controlSchema);
const SurveyPoint = mongoose.model("SurveyPoint", surveySchema);

/* ----------------------------- data (from field book.pdf) ----------------------------- */
const JOB = {
  name: "MATEBELE2022",
  jobCreated: "10/06/2022 07:54:48",
  description: "CAD",
  creator: "BISM",
  timezone: "2h 00'",
  company: "",
  includeHeight: false,
  coordinateSystemName: "MATEBELE2D",
  coordinateSystemCreated: "08/24/2018 11:37:24",
  transformationName: "MATEBELE2D",
  transformationType: "Twostep",
  heightMode: "Orthometric",
  preTransformationName: "DSM_BNGR_To_BTRS",
  residualsFormula: "1 / ( distance^2 )",
  ellipsoid: "Clarke 1880",
  projection: "TM27",
  geoidModel: "",
  cscsModel: "",
  applicationSoftware: "LEICA Geo Office 7.0",
  firmwareVersion: "5.60",
  codelistName: "THEBE",
  positionLimit: POSITION_LIMIT,
  heightLimit: HEIGHT_LIMIT,
  transformation: {
    commonPoints: 4,
    rotationOriginX: -0.0041,
    rotationOriginY: -0.0047,
    dE: 2370216.5416,
    dN: -47706.6053,
    rotation: "-179° 49' 43.18702\"",
    scalePpm: -4.1346,
  },
  heightTransformation: {
    commonPoints: 0,
    meanAccuracy: 0.0,
    parameters: "0.00000000  0.00000000  0.0000 m",
    inclinationX: "0° 00' 00.00000\"",
    inclinationY: "0° 00' 00.00000\"",
  },
};

// Identical points (System A WGS-84 + System B local grid + grid residuals) and WP1.
const CONTROL = [
  { name: "MTRM1", easting: 96998.01, northing: 2714789.369, wgs84X: 5172619.7024, wgs84Y: 2539930.5454, wgs84Z: -2216000.7065, resE: 0.0177, resN: -0.0054 },
  { name: "MTRM4", easting: 97672.853, northing: 2715614.396, wgs84X: 5126915.715, wgs84Y: 2539155.6622, wgs84Z: -2215356.3896, resE: -0.0102, resN: -0.0152 },
  { name: "MTRM13", easting: 97047.131, northing: 2713980.631, wgs84X: 5126593.4674, wgs84Y: 2539523.3685, wgs84Z: -2215644.4387, resE: -0.0012, resN: 0.0105 },
  { name: "MTRM14", easting: 97476.521, northing: 2713648.969, wgs84X: 5126282.2375, wgs84Y: 2539314.8986, wgs84Z: -2216611.0431, resE: -0.0153, resN: 0.02 },
  { name: "WP1", easting: 99368.9845, northing: 2713076.1495 }, // working point (reference only)
];

// Survey rovers. M1/M2 are double-polar (MTRM4 + WP1); the rest single observations.
// posnDiff/hgtDiff/cq are the values from the Leica field book (kept as overrides so
// the Mean Coordinates table matches the original instrument output exactly).
const SURVEY = [
  { name: "25A1", obs: [{ reference: "MTRM4", easting: 97039.6447, northing: 2715189.9822, sdE: 0.0081, sdN: 0.0066, sdHgt: 0.018, sdSlope: 0.0082 }] },
  { name: "25A2", obs: [{ reference: "MTRM4", easting: 96994.6643, northing: 2715195.3046, sdE: 0.0178, sdN: 0.03, sdHgt: 0.0323, sdSlope: 0.0152 }] },
  { name: "25A3", obs: [{ reference: "MTRM4", easting: 96987.8468, northing: 2715157.2603, sdE: 0.0042, sdN: 0.0034, sdHgt: 0.0093, sdSlope: 0.0043 }] },
  { name: "25A4", obs: [{ reference: "MTRM4", easting: 97027.2856, northing: 2715150.1988, sdE: 0.0126, sdN: 0.0074, sdHgt: 0.0354, sdSlope: 0.0124 }] },
  {
    name: "M1",
    cqOverride: 0.0017,
    obs: [
      { reference: "MTRM4", dateTime: "10/06/2022 08:51:39", easting: 96991.1062, northing: 2715175.4782, sdE: 0.0143, sdN: 0.0082, sdHgt: 0.0379, sdSlope: 0.0084, posnDiffOverride: 0.0009, hgtDiffOverride: -0.0011 },
      { reference: "WP1", dateTime: "10/06/2022 10:24:45", easting: 96991.1192, northing: 2715175.503, sdE: 0.0076, sdN: 0.0059, sdHgt: 0.0275, sdSlope: 0.0061, posnDiffOverride: 0.0014, hgtDiffOverride: 0.0016 },
    ],
  },
  {
    name: "M2",
    cqOverride: 0.0026,
    obs: [
      { reference: "MTRM4", dateTime: "10/06/2022 08:56:41", easting: 97033.675, northing: 2715170.8772, sdE: 0.005, sdN: 0.0042, sdHgt: 0.0108, sdSlope: 0.0049, posnDiffOverride: 0.0024, hgtDiffOverride: 0.0016 },
      { reference: "WP1", dateTime: "10/06/2022 10:30:47", easting: 97033.7094, northing: 2715170.8948, sdE: 0.0143, sdN: 0.0082, sdHgt: 0.0379, sdSlope: 0.0084, posnDiffOverride: 0.002, hgtDiffOverride: -0.0013 },
    ],
  },
  { name: "WP1", obs: [{ reference: "MTRM4", easting: 99368.9833, northing: 2713076.1507, sdE: 0.0059, sdN: 0.0047, sdHgt: 0.0196, sdSlope: 0.0049 }] },
  { name: "MTRM13CHK", obs: [{ reference: "WP1", easting: 97047.1322, northing: 2713980.6301, sdE: 0.0045, sdN: 0.0044, sdHgt: 0.0126, sdSlope: 0.0044 }] },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected to MongoDB");

  // Non-destructive: remove only a previous MATEBELE2022 job + its points.
  const old = await Job.findOne({ name: JOB.name });
  if (old) {
    await ControlPoint.deleteMany({ job: old._id });
    await SurveyPoint.deleteMany({ job: old._id });
    await Job.deleteOne({ _id: old._id });
    console.log("• Removed previous MATEBELE2022 job");
  }

  const job = await Job.create(JOB);
  console.log(`✓ Created job "${job.name}"`);

  for (const c of CONTROL) {
    await ControlPoint.create({ job: job._id, pointType: "Position", ...c });
  }
  console.log(`✓ Created ${CONTROL.length} control points`);

  for (const s of SURVEY) {
    const computed = computeSurveyPoint(
      s.obs,
      { positionLimit: POSITION_LIMIT, heightLimit: HEIGHT_LIMIT },
      { cqOverride: s.cqOverride }
    );
    await SurveyPoint.create({
      job: job._id,
      name: s.name,
      observations: s.obs,
      cqOverride: s.cqOverride ?? null,
      computed,
    });
  }
  console.log(`✓ Created ${SURVEY.length} survey points (M1/M2 double-polar)`);

  console.log(`\n✅ Seeded "${JOB.name}". Open the job → Field Book Report.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed error:", err.message);
  process.exit(1);
});
