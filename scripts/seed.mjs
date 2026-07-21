/**
 * Seed the database with the sample MATEBELE2022 field book (from the 
 * RTK GPS report the app is modelled on).
 *
 * Run with:  npm run seed
 *
 * Inserts raw documents via the MongoDB driver (no Next.js / alias needed) but
 * imports the SAME computeSurveyPoint the app uses, so seeded data is identical
 * to app-created data.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { computeSurveyPoint } from "../src/lib/survey-core.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config(); // fall back to .env

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}

// Demo login for the seeded job (override with env vars if you like).
const SEED_USER_EMAIL = (process.env.SEED_USER_EMAIL || "demo@fieldbook.local").toLowerCase();
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD || "password123";
const SEED_USER_NAME = process.env.SEED_USER_NAME || "Demo User";

// ---- Sample data (from field book.docx — MATEBELE2022) -------------------

const job = {
  name: "MATEBELE2022",
  description: "CAD",
  creator: "BISM",
  jobCreated: "10/06/2022 07:54:48",
  company: "",
  logoUrl: "",
  includeHeight: true,
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
  transformation: {
    commonPoints: 4,
    rotationOriginX: -0.0041,
    rotationOriginY: -0.0047,
    dE: 2370216.5416,
    dN: -47706.6053,
    rotation: "-179°49'43.18702\"",
    scalePpm: -4.1346,
  },
  heightTransformation: {
    commonPoints: 0,
    meanAccuracy: 0.0,
    inclinationX: "0° 00' 00.00000\"",
    inclinationY: "0° 00' 00.00000\"",
  },
  positionLimit: 0.05,
  heightLimit: 0.075,
  timezone: "2h 00'",
  applicationSoftware: " Geo Office 7.0",
  firmwareVersion: "5.60",
  codelistName: "THEBE",
};

// Identical / calibration points carry WGS-84 Cartesian + Local Grid + residuals.
const controlPoints = [
  { name: "MTRM1", pointType: "Position", easting: 96998.01, northing: 2714789.369, wgs84X: 5172619.7024, wgs84Y: 2539930.5454, wgs84Z: -2216000.7065, resE: 0.0177, resN: -0.0054 },
  { name: "MTRM4", pointType: "Position", easting: 97672.853, northing: 2715614.396, wgs84X: 5126915.715, wgs84Y: 2539155.6622, wgs84Z: -2215356.3896, resE: -0.0102, resN: -0.0152 },
  { name: "MTRM13", pointType: "Position", easting: 97047.131, northing: 2713980.631, wgs84X: 5126593.4674, wgs84Y: 2539523.3685, wgs84Z: -2215644.4387, resE: -0.0012, resN: 0.0105 },
  { name: "MTRM14", pointType: "Position", easting: 97476.521, northing: 2713648.969, wgs84X: 5126282.2375, wgs84Y: 2539314.8986, wgs84Z: -2216611.0431, resE: -0.0153, resN: 0.02 },
  // Working point used as a second reference (not a calibration identical point).
  { name: "WP1", pointType: "Position", easting: 99368.9845, northing: 2713076.1495 },
];

const surveyPoints = [
  {
    name: "M1",
    code: "beacon",
    cqOverride: 0.0017, // exact CQ from the original  field book
    observations: [
      { reference: "MTRM4", dateTime: "10/06/2022 08:51:39", easting: 96991.1062, northing: 2715175.4782, sdE: 0.0143, sdN: 0.0082, sdHgt: 0.0379, sdSlope: 0.0084, posnDiffOverride: 0.0009, hgtDiffOverride: -0.0011 },
      { reference: "WP1", dateTime: "10/06/2022 10:24:45", easting: 96991.1192, northing: 2715175.503, sdE: 0.0076, sdN: 0.0059, sdHgt: 0.0275, sdSlope: 0.0061, posnDiffOverride: 0.0014, hgtDiffOverride: 0.0016 },
    ],
  },
  {
    name: "M2",
    code: "beacon",
    cqOverride: 0.0026,
    observations: [
      { reference: "MTRM4", dateTime: "10/06/2022 08:56:41", easting: 97033.675, northing: 2715170.8772, sdE: 0.005, sdN: 0.0042, sdHgt: 0.0108, sdSlope: 0.0049, posnDiffOverride: 0.0024, hgtDiffOverride: 0.0016 },
      { reference: "WP1", dateTime: "10/06/2022 10:30:47", easting: 97033.7094, northing: 2715170.8948, sdE: 0.0143, sdN: 0.0082, sdHgt: 0.0379, sdSlope: 0.0084, posnDiffOverride: 0.0020, hgtDiffOverride: -0.0013 },
    ],
  },
  // Single-reference detail points (not yet completed as double polar)
  { name: "25A1", code: "corner", observations: [{ reference: "MTRM4", dateTime: "10/06/2022", easting: 97039.6447, northing: 2715189.9822, sdE: 0.0081, sdN: 0.0066, sdHgt: 0.018, sdSlope: 0.0082 }] },
  { name: "25A2", code: "corner", observations: [{ reference: "MTRM4", dateTime: "10/06/2022", easting: 96994.6643, northing: 2715195.3046, sdE: 0.0178, sdN: 0.03, sdHgt: 0.0323, sdSlope: 0.0152 }] },
  { name: "25A3", code: "corner", observations: [{ reference: "MTRM4", dateTime: "10/06/2022", easting: 96987.8468, northing: 2715157.2603, sdE: 0.0042, sdN: 0.0034, sdHgt: 0.0093, sdSlope: 0.0043 }] },
  { name: "25A4", code: "corner", observations: [{ reference: "MTRM4", dateTime: "10/06/2022", easting: 97027.2856, northing: 2715150.1988, sdE: 0.0126, sdN: 0.0074, sdHgt: 0.0354, sdSlope: 0.0124 }] },
  { name: "MTRM13CHK", code: "check", observations: [{ reference: "WP1", dateTime: "10/06/2022", easting: 97047.1322, northing: 2713980.6301, sdE: 0.0045, sdN: 0.0044, sdHgt: 0.0126, sdSlope: 0.0044 }] },
];

async function run() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;
  const Jobs = db.collection("jobs");
  const Controls = db.collection("controlpoints");
  const Surveys = db.collection("surveypoints");
  const Users = db.collection("users");

  // Ensure a demo user exists so the seeded job is actually visible after
  // signing in (jobs are scoped to their owner).
  let demoUser = await Users.findOne({ email: SEED_USER_EMAIL });
  if (!demoUser) {
    const passwordHash = await bcrypt.hash(SEED_USER_PASSWORD, 10);
    const { insertedId } = await Users.insertOne({
      name: SEED_USER_NAME,
      email: SEED_USER_EMAIL,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    demoUser = { _id: insertedId };
    console.log(`✓ Created demo user — sign in with ${SEED_USER_EMAIL} / ${SEED_USER_PASSWORD}`);
  } else {
    console.log(`• Using existing demo user ${SEED_USER_EMAIL}`);
  }

  // Idempotent: remove any prior copy of this sample job + its children.
  const existing = await Jobs.findOne({ name: job.name });
  if (existing) {
    await Promise.all([
      Controls.deleteMany({ job: existing._id }),
      Surveys.deleteMany({ job: existing._id }),
      Jobs.deleteOne({ _id: existing._id }),
    ]);
    console.log("• Removed existing MATEBELE2022 sample.");
  }

  const now = new Date();
  const jobId = new mongoose.Types.ObjectId();
  await Jobs.insertOne({ _id: jobId, ...job, owner: demoUser._id, createdAt: now, updatedAt: now });

  await Controls.insertMany(
    controlPoints.map((c) => ({
      job: jobId,
      name: c.name,
      pointType: c.pointType || "Position",
      easting: c.easting ?? null,
      northing: c.northing ?? null,
      height: c.height ?? null,
      wgs84X: c.wgs84X ?? null,
      wgs84Y: c.wgs84Y ?? null,
      wgs84Z: c.wgs84Z ?? null,
      resE: c.resE ?? null,
      resN: c.resN ?? null,
      resHgt: c.resHgt ?? null,
      note: "",
      createdAt: now,
      updatedAt: now,
    }))
  );

  await Surveys.insertMany(
    surveyPoints.map((p) => ({
      job: jobId,
      name: p.name,
      code: p.code || "",
      cqOverride: p.cqOverride ?? null,
      observations: p.observations.map((o) => ({
        reference: o.reference || "",
        dateTime: o.dateTime || "",
        easting: o.easting ?? null,
        northing: o.northing ?? null,
        height: o.height ?? null,
        sdE: o.sdE ?? null,
        sdN: o.sdN ?? null,
        sdHgt: o.sdHgt ?? null,
        sdSlope: o.sdSlope ?? null,
        posnDiffOverride: o.posnDiffOverride ?? null,
        hgtDiffOverride: o.hgtDiffOverride ?? null,
      })),
      computed: computeSurveyPoint(
        p.observations,
        { positionLimit: job.positionLimit, heightLimit: job.heightLimit },
        { cqOverride: p.cqOverride }
      ),
      createdAt: now,
      updatedAt: now,
    }))
  );

  console.log(
    `✓ Seeded "${job.name}" — ${controlPoints.length} control points, ${surveyPoints.length} survey points.`
  );
  console.log(`  Sign in at /login with ${SEED_USER_EMAIL} / ${SEED_USER_PASSWORD} to view it.`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("✗ Seed failed:", err.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
