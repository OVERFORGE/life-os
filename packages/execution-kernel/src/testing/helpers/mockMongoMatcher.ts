/**
 * Generic MongoDB Query Matcher for In-Memory Test Mocks.
 * Evaluates $lte, $lt, $gte, $gt, $in, $ne, $exists, $or, $and generically without field-specific exceptions.
 * Supports Numbers, JavaScript Dates, Numeric timestamps, ISO Date strings, and ObjectIds.
 */

export function toComparable(val: any): any {
  if (val instanceof Date) return val.getTime();
  if (typeof val === "string") {
    // Check if ISO date string (YYYY-MM-DD or contains T)
    const parsed = Date.parse(val);
    if (!isNaN(parsed) && (val.includes("-") || val.includes("T"))) {
      return parsed;
    }
  }
  return val;
}

export function matchesMongoQuery(doc: Record<string, any>, query: Record<string, any>): boolean {
  if (!doc || !query) return false;

  for (const [k, v] of Object.entries(query)) {
    if (k === "$or" && Array.isArray(v)) {
      const anyMatch = v.some((subQuery: any) => matchesMongoQuery(doc, subQuery));
      if (!anyMatch) return false;
      continue;
    }

    if (k === "$and" && Array.isArray(v)) {
      const allMatch = v.every((subQuery: any) => matchesMongoQuery(doc, subQuery));
      if (!allMatch) return false;
      continue;
    }

    const docVal = doc[k];

    if (v instanceof RegExp) {
      if (!v.test(String(docVal ?? ""))) return false;
      continue;
    }

    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      if ("$exists" in v) {
        const exists = docVal !== undefined && docVal !== null;
        if (v.$exists !== exists) return false;
      }

      if ("$in" in v && Array.isArray(v.$in)) {
        const inMatch = v.$in.some((candidate: any) => {
          if (String(docVal) === String(candidate)) return true;
          return toComparable(docVal) === toComparable(candidate);
        });
        if (!inMatch) return false;
      }

      if ("$nin" in v && Array.isArray(v.$nin)) {
        const inMatch = v.$nin.some((candidate: any) => {
          if (String(docVal) === String(candidate)) return true;
          return toComparable(docVal) === toComparable(candidate);
        });
        if (inMatch) return false;
      }

      if ("$ne" in v) {
        if (docVal === v.$ne || toComparable(docVal) === toComparable(v.$ne) || String(docVal) === String(v.$ne)) {
          return false;
        }
      }

      const compDoc = toComparable(docVal);

      if ("$lt" in v) {
        const compTarget = toComparable(v.$lt);
        if (compDoc === undefined || compDoc === null || !(compDoc < compTarget)) return false;
      }
      if ("$lte" in v) {
        const compTarget = toComparable(v.$lte);
        if (compDoc === undefined || compDoc === null || !(compDoc <= compTarget)) return false;
      }
      if ("$gt" in v) {
        const compTarget = toComparable(v.$gt);
        if (compDoc === undefined || compDoc === null || !(compDoc > compTarget)) return false;
      }
      if ("$gte" in v) {
        const compTarget = toComparable(v.$gte);
        if (compDoc === undefined || compDoc === null || !(compDoc >= compTarget)) return false;
      }
      continue;
    }

    // Direct equality (supporting ObjectId string coercion)
    if (String(docVal) === String(v)) continue;
    if (toComparable(docVal) === toComparable(v)) continue;
    if (docVal !== v) return false;
  }

  return true;
}

