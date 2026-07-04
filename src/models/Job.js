import mongoose from "mongoose";
import {
  DEFAULT_POSITION_LIMIT,
  DEFAULT_HEIGHT_LIMIT,
  DEFAULT_MIN_TIME_DIFF_PLOT_MINUTES,
} from "@/lib/survey";

const { Schema } = mongoose;

const JobSchema = new Schema(
  {
    // Owner of this job — every job belongs to exactly one signed-in user.
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    creator: { type: String, default: "" },
    jobCreated: { type: String, default: "" }, // original job creation date/time (as on the machine)
    company: { type: String, default: "" }, // shown on the report header
    logoUrl: { type: String, default: "" }, // data URL or URL of the firm's logo

    // Whether survey points capture/check height (heights are often omitted).
    includeHeight: { type: Boolean, default: false },

    // Coordinate system / calibration metadata (mirrors the Leica field book).
    coordinateSystemName: { type: String, default: "" },
    coordinateSystemCreated: { type: String, default: "" },
    transformationName: { type: String, default: "" },
    transformationType: { type: String, default: "" },
    heightMode: { type: String, default: "Plane" },
    preTransformationName: { type: String, default: "" },
    residualsFormula: { type: String, default: "1 / ( distance^2 )" },
    ellipsoid: { type: String, default: "Clarke 1880 (Arc)" },
    projection: { type: String, default: "" }, // LO / TM zone
    geoidModel: { type: String, default: "" },
    cscsModel: { type: String, default: "" },

    // 3D-Helmert transformation block (Bursa-Wolf; usually all-zero — no height
    // in the calibration). Shown above the 2D-Helmert block in the field book.
    transformation3D: {
      commonPoints: { type: Number, default: 0 },
      model: { type: String, default: "Bursa-Wolf" },
      shiftDX: { type: Number, default: 0 },
      shiftDY: { type: Number, default: 0 },
      shiftDZ: { type: Number, default: 0 },
      rotX: { type: String, default: "0.00000\"" },
      rotY: { type: String, default: "0.00000\"" },
      rotZ: { type: String, default: "0.00000\"" },
      scalePpm: { type: Number, default: 0 },
    },

    // 2D-Helmert transformation parameters (informational, from calibration).
    transformation: {
      commonPoints: { type: Number, default: null },
      rotationOriginX: { type: Number, default: null },
      rotationOriginY: { type: Number, default: null },
      dE: { type: Number, default: null },
      dN: { type: Number, default: null },
      rotation: { type: String, default: "" }, // kept as text (e.g. -179°49'43.18702")
      scalePpm: { type: Number, default: null },
    },

    // Height transformation block (usually empty — no height in calibration).
    heightTransformation: {
      commonPoints: { type: Number, default: 0 },
      meanAccuracy: { type: Number, default: null },
      parameters: { type: String, default: "" }, // e.g. "0.00000000  0.00000000  0.0000 m"
      inclinationX: { type: String, default: "" },
      inclinationY: { type: String, default: "" },
    },

    // Double-polar tolerances.
    positionLimit: { type: Number, default: DEFAULT_POSITION_LIMIT },
    heightLimit: { type: Number, default: DEFAULT_HEIGHT_LIMIT },

    // Plot (small site) vs farm (large site) — sets the minimum time gap
    // required between a point's two double-polar observations.
    surveyType: { type: String, enum: ["plot", "farm"], default: "plot" },
    minTimeDiffMinutes: { type: Number, default: DEFAULT_MIN_TIME_DIFF_PLOT_MINUTES },

    // Extra equipment metadata.
    timezone: { type: String, default: "2h 00'" },
    applicationSoftware: { type: String, default: "LEICA Geo Office 7.0" },
    firmwareVersion: { type: String, default: "5.60" },
    codelistName: { type: String, default: "THEBE" },

    // How many decimal places coordinates are shown to in the field book report
    // (client wants the choice between 3 and 4 d.p.).
    coordDecimals: { type: Number, enum: [3, 4], default: 4 },
  },
  { timestamps: true }
);

export default mongoose.models.Job || mongoose.model("Job", JobSchema);
