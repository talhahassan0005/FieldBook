import mongoose from "mongoose";
import { DEFAULT_POSITION_LIMIT, DEFAULT_HEIGHT_LIMIT } from "@/lib/survey";

const { Schema } = mongoose;

const JobSchema = new Schema(
  {
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
    heightMode: { type: String, default: "" },
    preTransformationName: { type: String, default: "" },
    residualsFormula: { type: String, default: "" }, // e.g. 1 / ( distance^2 )
    ellipsoid: { type: String, default: "" },
    projection: { type: String, default: "" }, // LO / TM zone
    geoidModel: { type: String, default: "" },
    cscsModel: { type: String, default: "" },

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
      inclinationX: { type: String, default: "" },
      inclinationY: { type: String, default: "" },
    },

    // Double-polar tolerances.
    positionLimit: { type: Number, default: DEFAULT_POSITION_LIMIT },
    heightLimit: { type: Number, default: DEFAULT_HEIGHT_LIMIT },

    // Extra equipment metadata.
    timezone: { type: String, default: "" },
    applicationSoftware: { type: String, default: "" },
    firmwareVersion: { type: String, default: "" },
    codelistName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.Job || mongoose.model("Job", JobSchema);
