import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * A known reference / control point used to "calibrate" a job. These are the
 * fixed stations (e.g. MTRM4, WP1) that survey points are measured from in the
 * double-polar workflow.
 */
const ControlPointSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, default: "" }, // feature code from the field CSV (e.g. IPC12)
    pointType: { type: String, default: "Position" }, // Position / Height / Control

    // Local grid coordinates (used as the baseline reference).
    easting: { type: Number, default: null },
    northing: { type: Number, default: null },
    height: { type: Number, default: null },

    // WGS-84 Cartesian (identical point used during calibration; optional).
    wgs84X: { type: Number, default: null },
    wgs84Y: { type: Number, default: null },
    wgs84Z: { type: Number, default: null },

    // Calibration residuals for the "Residuals (Grid)" section (optional).
    resE: { type: Number, default: null },
    resN: { type: Number, default: null },
    resHgt: { type: Number, default: null },

    note: { type: String, default: "" },
  },
  { timestamps: true }
);

ControlPointSchema.index({ job: 1, name: 1 }, { unique: true });

export default mongoose.models.ControlPoint ||
  mongoose.model("ControlPoint", ControlPointSchema);
