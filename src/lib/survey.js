// Single source of truth for the double-polar computation lives in
// survey-core.mjs (a .mjs so the seed script can import it under plain Node too).
// Re-exported here so app code can keep importing from "@/lib/survey".
export * from "./survey-core.mjs";
