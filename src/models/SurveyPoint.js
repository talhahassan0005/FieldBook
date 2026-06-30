import mongoose from "mongoose";

const { Schema } = mongoose;

/** One independent observation of a survey point from a reference station. */
const ObservationSchema = new Schema(
  {
    reference: { type: String, default: "" }, // e.g. "MTRM4"
    dateTime: { type: String, default: "" }, // free text / ISO, as captured in field
    easting: { type: Number, default: null },
    northing: { type: Number, default: null },
    height: { type: Number, default: null },
    sdE: { type: Number, default: null },
    sdN: { type: Number, default: null },
    sdHgt: { type: Number, default: null },
    sdSlope: { type: Number, default: null },
    // Optional manual overrides for the report's per-observation differences.
    posnDiffOverride: { type: Number, default: null },
    hgtDiffOverride: { type: Number, default: null },
  },
  { _id: false }
);

/** Per-observation deviation from the point mean (drives the report table). */
const ObservationDeviationSchema = new Schema(
  {
    reference: { type: String, default: "" },
    dateTime: { type: String, default: null },
    easting: { type: Number, default: null },
    northing: { type: Number, default: null },
    height: { type: Number, default: null },
    sdE: { type: Number, default: null },
    sdN: { type: Number, default: null },
    sdHgt: { type: Number, default: null },
    positionQuality: { type: Number, default: null },
    deviationPosn: { type: Number, default: null },
    deviationHgt: { type: Number, default: null },
    deviationCombined: { type: Number, default: null },
  },
  { _id: false }
);

/** Cached computed result so lists / reports are fast and consistent. */
const ComputedSchema = new Schema(
  {
    observationCount: Number,
    meanEasting: Number,
    meanNorthing: Number,
    meanHeight: Number,
    positionDiff: Number,
    heightDiff: Number,
    timeDiffMinutes: Number,
    cq: Number,
    positionExceeded: Boolean,
    heightExceeded: Boolean,
    timeDiffExceeded: Boolean,
    limitExceeded: Boolean,
    isDoublePolar: Boolean,
    // Limits in force when this point was computed (so the report stays correct
    // even if the job tolerances are later changed).
    positionLimit: Number,
    heightLimit: Number,
    minTimeDiffMinutes: Number,
    perObservation: { type: [ObservationDeviationSchema], default: [] },
  },
  { _id: false }
);

const SurveyPointSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    name: { type: String, required: true, trim: true }, // e.g. "M1"
    code: { type: String, default: "" }, // feature code (beacon, corner, ...)
    // Preserves the exact order points appeared in the imported CSV (or were
    // added manually) so the report always lists points in that order — never
    // alphabetically (which would wrongly put "10", "11" before "2").
    sortOrder: { type: Number, default: 0, index: true },
    cqOverride: { type: Number, default: null }, // optional manual CQ override
    observations: { type: [ObservationSchema], default: [] },
    computed: { type: ComputedSchema, default: {} },
  },
  { timestamps: true }
);

SurveyPointSchema.index({ job: 1, name: 1 }, { unique: true });

export default mongoose.models.SurveyPoint ||
  mongoose.model("SurveyPoint", SurveyPointSchema);
