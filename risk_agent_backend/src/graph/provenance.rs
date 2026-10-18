// Strict data-source isolation for the shared `defi_risk` graph.
//
// Every persisted transfer edge carries an explicit provenance marker:
//   - `source = 'real'`  : verified Solana mainnet transaction evidence.
//   - `source = 'demo'`  : synthetic seeded test/demo evidence (also carries
//                          `demo_id`).
//
// Unknown or missing provenance is excluded from real investigations by
// default. Cycle detection, memory retrieval, and AI grounding all filter on
// the selected data source so that real and synthetic edges are never mixed
// in a single path, cycle, report, or investigation result.

/// Property name used to mark investigation records with their data source.
pub const PROP_DATA_SOURCE: &str = "data_source";

/// Provenance value for verified mainnet evidence.
pub const SOURCE_REAL: &str = "real";
/// Provenance value for synthetic seeded evidence.
pub const SOURCE_SYNTHETIC: &str = "demo";

/// Normalized request data source.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DataSource {
    Real,
    Synthetic,
}

impl DataSource {
    /// Parse a user-supplied data-source string. Unknown values default to
    /// `Real` so that a real investigation never accidentally traverses demo
    /// edges.
    pub fn from_request(value: &str) -> Self {
        match value.trim().to_lowercase().as_str() {
            "simulation" | "demo" | "synthetic" | "test" => DataSource::Synthetic,
            _ => DataSource::Real,
        }
    }

    pub fn as_edge_source(&self) -> &'static str {
        match self {
            DataSource::Real => SOURCE_REAL,
            DataSource::Synthetic => SOURCE_SYNTHETIC,
        }
    }

    pub fn as_investigation_value(&self) -> &'static str {
        match self {
            DataSource::Real => SOURCE_REAL,
            DataSource::Synthetic => SOURCE_SYNTHETIC,
        }
    }

    /// Cypher predicate that keeps only edges belonging to this source.
    ///
    /// Real edges must carry `source = 'real'`. Synthetic edges carry
    /// `source = 'demo'` and/or a `demo_id`. Edges with unknown provenance
    /// (no `source`, or an unrecognized value) are excluded from both.
    pub fn edge_filter(&self) -> &'static str {
        match self {
            DataSource::Real => "r.source = 'real' AND r.demo_id IS NULL",
            DataSource::Synthetic => "r.source = 'demo' OR r.demo_id IS NOT NULL",
        }
    }
}

/// Validate that a persisted transfer edge has an explicit, recognized
/// provenance marker. Unknown provenance is rejected so it can never silently
/// participate in a real investigation.
pub fn recognized_provenance(source: Option<&str>, demo_id: Option<&str>) -> bool {
    match source {
        Some(SOURCE_REAL) => true,
        Some(SOURCE_SYNTHETIC) => true,
        Some(other) => other.eq_ignore_ascii_case(SOURCE_SYNTHETIC),
        None => demo_id.is_some(),
    }
}

/// Classify an edge's provenance from optional properties.
pub fn classify_edge(source: Option<&str>, demo_id: Option<&str>) -> Option<DataSource> {
    let is_demo =
        demo_id.is_some() || source.is_some_and(|s| s.eq_ignore_ascii_case(SOURCE_SYNTHETIC));
    if is_demo {
        Some(DataSource::Synthetic)
    } else if source.is_some_and(|s| s.eq_ignore_ascii_case(SOURCE_REAL)) {
        Some(DataSource::Real)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_source_parses_from_live() {
        assert_eq!(DataSource::from_request("live"), DataSource::Real);
        assert_eq!(DataSource::from_request(""), DataSource::Real);
        assert_eq!(DataSource::from_request("real"), DataSource::Real);
    }

    #[test]
    fn synthetic_source_parses_from_simulation() {
        assert_eq!(
            DataSource::from_request("simulation"),
            DataSource::Synthetic
        );
        assert_eq!(DataSource::from_request("demo"), DataSource::Synthetic);
        assert_eq!(DataSource::from_request("synthetic"), DataSource::Synthetic);
    }

    #[test]
    fn edge_filters_exclude_unknown_provenance() {
        assert_eq!(
            DataSource::Real.edge_filter(),
            "r.source = 'real' AND r.demo_id IS NULL"
        );
        assert_eq!(
            DataSource::Synthetic.edge_filter(),
            "r.source = 'demo' OR r.demo_id IS NOT NULL"
        );
    }

    #[test]
    fn recognized_provenance_rejects_unknown_source() {
        assert!(recognized_provenance(Some("real"), None));
        assert!(recognized_provenance(Some("demo"), None));
        assert!(recognized_provenance(None, Some("demo_transfer_1")));
        assert!(!recognized_provenance(Some("legacy"), None));
        assert!(!recognized_provenance(None, None));
    }

    #[test]
    fn classify_edge_distinguishes_real_demo_and_unknown() {
        assert_eq!(classify_edge(Some("real"), None), Some(DataSource::Real));
        assert_eq!(
            classify_edge(Some("demo"), None),
            Some(DataSource::Synthetic)
        );
        assert_eq!(
            classify_edge(Some("real"), Some("demo_transfer_1")),
            Some(DataSource::Synthetic)
        );
        assert_eq!(
            classify_edge(None, Some("demo_transfer_1")),
            Some(DataSource::Synthetic)
        );
        assert_eq!(classify_edge(Some("legacy"), None), None);
        assert_eq!(classify_edge(None, None), None);
    }
}
