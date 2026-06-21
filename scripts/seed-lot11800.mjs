/**
 * Seed LOT 11800 survey data into the database.
 * Creates a job with control points and double-polar survey points.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { computeSurveyPoint } from "../src/lib/survey-core.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config(); // fall back to .env

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}
const jobSchema = new mongoose.Schema({
  name: String,
  description: String,
  creator: String,
  jobCreated: String,
  company: String,
  logoUrl: String,
  includeHeight: Boolean,
  coordinateSystemName: String,
  coordinateSystemCreated: String,
  transformationName: String,
  transformationType: String,
  heightMode: String,
  preTransformationName: String,
  residualsFormula: String,
  ellipsoid: String,
  projection: String,
  geoidModel: String,
  cscsModel: String,
  transformation: {
    commonPoints: Number,
    rotationOriginX: Number,
    rotationOriginY: Number,
    dE: Number,
    dN: Number,
    rotation: String,
    scalePpm: Number,
  },
  heightTransformation: {
    commonPoints: Number,
    meanAccuracy: Number,
    inclinationX: String,
    inclinationY: String,
  },
  positionLimit: Number,
  heightLimit: Number,
  timezone: String,
  applicationSoftware: String,
  firmwareVersion: String,
  codelistName: String,
  createdAt: Date,
  updatedAt: Date,
});

const controlSchema = new mongoose.Schema({
  job: mongoose.Schema.Types.ObjectId,
  name: String,
  pointType: String,
  easting: Number,
  northing: Number,
  height: Number,
  wgs84X: Number,
  wgs84Y: Number,
  wgs84Z: Number,
  resE: Number,
  resN: Number,
  resHgt: Number,
  note: String,
  createdAt: Date,
  updatedAt: Date,
});

const observationSchema = new mongoose.Schema(
  {
    reference: String,
    dateTime: String,
    easting: Number,
    northing: Number,
    height: Number,
    sdE: Number,
    sdN: Number,
    sdHgt: Number,
    sdSlope: Number,
    posnDiffOverride: Number,
    hgtDiffOverride: Number,
  },
  { _id: false }
);

const surveySchema = new mongoose.Schema({
  job: mongoose.Schema.Types.ObjectId,
  name: String,
  code: String,
  cqOverride: Number,
  observations: [observationSchema],
  computed: {
    observationCount: Number,
    meanEasting: Number,
    meanNorthing: Number,
    meanHeight: Number,
    positionDiff: Number,
    heightDiff: Number,
    cq: Number,
    positionExceeded: Boolean,
    heightExceeded: Boolean,
    limitExceeded: Boolean,
    isDoublePolar: Boolean,
    positionLimit: Number,
    heightLimit: Number,
    perObservation: Array,
  },
  createdAt: Date,
  updatedAt: Date,
});

const Job = mongoose.model("Job", jobSchema);
const ControlPoint = mongoose.model("ControlPoint", controlSchema);
const SurveyPoint = mongoose.model("SurveyPoint", surveySchema);

const POSITION_LIMIT = 0.05;
const HEIGHT_LIMIT = 0.075;

const controlData = [
  { name: "WP1", easting: 58887.91, northing: 2430832.72, code: "IPC12" },
  { name: "BRM20", easting: 59695.32, northing: 2430492.09, code: "IPC12" },
  { name: "BRM21", easting: 59290.419, northing: 2430451.298, code: "IPC12" },
  { name: "BRM22", easting: 59026.02, northing: 2430606.49, code: "IPC12" },
  { name: "BRM38", easting: 59776.99, northing: 2429811.48, code: "IPC12" },
  { name: "BRM39", easting: 59516.44, northing: 2429927.8, code: "IPC12" },
  { name: "BRM19", easting: 60113.48, northing: 2430985, code: "IPC12" },
];

const surveyData = [
  { name: "A", code: "75MM CFP", easting: 60960.62, northing: 2432202.016 },
  { name: "B", code: "75MM CFP", easting: 60953.981, northing: 2432249.05 },
  { name: "C", code: "75MM CFP", easting: 60993.866, northing: 2432250.235 },
  { name: "D", code: "75MM CFP", easting: 60996.977, northing: 2432207.639 },
  { name: "E", code: "", easting: 60957.301, northing: 2432225.533 },
  { name: "F", code: "", easting: 60995.421, northing: 2432228.937 },
];

// Generate realistic double-polar observations with small variations
function generateObservations(pointEasting, pointNorthing, refName1, refName2) {
  const now = new Date().toISOString().split("T")[0];
  
  // First polar: from WP1 with small random variations
  const obs1 = {
    reference: refName1,
    dateTime: `${now} 09:30:00`,
    easting: pointEasting + (Math.random() - 0.5) * 0.01,
    northing: pointNorthing + (Math.random() - 0.5) * 0.01,
    height: 1500 + (Math.random() - 0.5) * 0.02,
    sdE: 0.0081,
    sdN: 0.0066,
    sdHgt: 0.018,
    sdSlope: 0.0081,
  };

  // Second polar: from BRM20 with slightly different variations
  const obs2 = {
    reference: refName2,
    dateTime: `${now} 10:45:00`,
    easting: pointEasting + (Math.random() - 0.5) * 0.015,
    northing: pointNorthing + (Math.random() - 0.5) * 0.015,
    height: 1500 + (Math.random() - 0.5) * 0.025,
    sdE: 0.0143,
    sdN: 0.0082,
    sdHgt: 0.038,
    sdSlope: 0.0095,
  };

  return [obs1, obs2];
}

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✓ Connected to MongoDB");

    // Clear existing data
    await Job.deleteMany({});
    await ControlPoint.deleteMany({});
    await SurveyPoint.deleteMany({});

    // Create job
    const job = new Job({
      name: "LOT 11800",
      description: "Double-polar cadastral survey - Plot lot 11800",
      creator: "Field Surveyor",
      jobCreated: new Date().toISOString(),
      company: "HPS Surveys",
      coordinateSystemName: "Local Grid (LO 27)",
      coordinateSystemCreated: "2024-06-20",
      transformationName: "2D Helmert",
      transformationType: "2D-Helmert",
      heightMode: "Ellipsoidal",
      preTransformationName: "WGS-84",
      residualsFormula: "1 / (distance^2)",
      ellipsoid: "WGS-84",
      projection: "LO 27",
      geoidModel: "EGM96",
      cscsModel: "Standard",
      transformation: {
        commonPoints: 5,
        rotationOriginX: 58887.91,
        rotationOriginY: 2430832.72,
        dE: 0.0,
        dN: 0.0,
        rotation: "0°0'0.00\"",
        scalePpm: 0.0,
      },
      heightTransformation: {
        commonPoints: 0,
        meanAccuracy: 0.0,
        inclinationX: "0.0 ppm",
        inclinationY: "0.0 ppm",
      },
      positionLimit: POSITION_LIMIT,
      heightLimit: HEIGHT_LIMIT,
      timezone: "UTC+2",
      applicationSoftware: "Leica SmartWorx",
      firmwareVersion: "v7.0.1",
      codelistName: "HPS Standard Codes",
    });

    const savedJob = await job.save();
    console.log(`✓ Created job "${savedJob.name}"`);

    // Create control points
    for (const ctrl of controlData) {
      const cp = new ControlPoint({
        job: savedJob._id,
        name: ctrl.name,
        pointType: "Position",
        easting: ctrl.easting,
        northing: ctrl.northing,
        height: 1500,
      });
      await cp.save();
    }
    console.log(`✓ Created ${controlData.length} control points`);

    // Create survey points with double-polar observations
    for (const survey of surveyData) {
      const observations = generateObservations(
        survey.easting,
        survey.northing,
        "WP1",
        "BRM20"
      );

      const computed = computeSurveyPoint(observations, {
        positionLimit: POSITION_LIMIT,
        heightLimit: HEIGHT_LIMIT,
      });

      const sp = new SurveyPoint({
        job: savedJob._id,
        name: survey.name,
        code: survey.code,
        observations,
        computed,
      });
      await sp.save();
    }
    console.log(`✓ Created ${surveyData.length} survey points with double-polar measurements`);

    console.log(`\n✅ Seeded "LOT 11800" — ${controlData.length} control points, ${surveyData.length} survey points.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err.message);
    process.exit(1);
  }
}

seed();
