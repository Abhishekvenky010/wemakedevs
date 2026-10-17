use serde_json::{Value, json};
use std::collections::HashSet;

/// Normalize a closed wallet path into a canonical cycle.
///
/// Examples:
/// A -> B -> C -> A
/// A -> B -> C -> A -> B -> C -> A
///
/// Both normalize to the same cycle.
pub fn canonical_cycle(path: &[String]) -> Option<Vec<String>> {
    if path.len() < 4 || path.first() != path.last() {
        return None;
    }

    let cycle = &path[..path.len() - 1];

    if cycle.len() < 3 {
        return None;
    }

    let mut unique = HashSet::new();

    if !cycle.iter().all(|wallet| unique.insert(wallet)) {
        // Repeated traversal of a smaller cycle is allowed only
        // when the complete path consists of repetitions.
        let base_len = (1..=cycle.len()).find(|&size| {
            cycle.len() % size == 0
                && cycle
                    .iter()
                    .enumerate()
                    .all(|(index, wallet)| wallet == &cycle[index % size])
        })?;

        if base_len < 3 {
            return None;
        }

        let base = &cycle[..base_len];

        if base.iter().collect::<HashSet<_>>().len() != base.len() {
            return None;
        }

        return Some(canonical_rotation(base));
    }

    Some(canonical_rotation(cycle))
}

fn canonical_rotation(cycle: &[String]) -> Vec<String> {
    let start = cycle
        .iter()
        .enumerate()
        .min_by(|(_, a), (_, b)| a.cmp(b))
        .map(|(index, _)| index)
        .unwrap_or(0);

    cycle[start..]
        .iter()
        .chain(cycle[..start].iter())
        .cloned()
        .collect()
}

/// Compare current paths with historical records.
///
/// Historical records without usable graph evidence are uncomparable.
pub fn compare_paths(current_paths: &[Value], historical_cases: &[Value]) -> Value {
    let current_cycles: HashSet<Vec<String>> = current_paths
        .iter()
        .filter_map(|path| {
            path.get("path_wallets")
                .and_then(Value::as_array)
                .map(|wallets| {
                    wallets
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                })
                .and_then(|wallets| canonical_cycle(&wallets))
        })
        .collect();

    let historical_cycles: HashSet<Vec<String>> = historical_cases
        .iter()
        .flat_map(|case| {
            case.get("graph_evidence")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter_map(|evidence| {
            evidence
                .get("path_wallets")
                .and_then(Value::as_array)
                .map(|wallets| {
                    wallets
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                })
                .and_then(|wallets| canonical_cycle(&wallets))
        })
        .collect();

    let uncomparable_records = historical_cases
        .iter()
        .filter(|case| {
            let has_usable_evidence = case
                .get("graph_evidence")
                .and_then(Value::as_array)
                .map(|items| {
                    items.iter().any(|item| {
                        item.get("path_wallets")
                            .and_then(Value::as_array)
                            .map(|wallets| {
                                wallets
                                    .iter()
                                    .filter_map(Value::as_str)
                                    .map(str::to_owned)
                                    .collect::<Vec<_>>()
                            })
                            .and_then(|wallets| canonical_cycle(&wallets))
                            .is_some()
                    })
                })
                .unwrap_or(false);
            !has_usable_evidence
        })
        .count();

    let recurring: Vec<Vec<String>> = current_cycles
        .intersection(&historical_cycles)
        .cloned()
        .collect();

    let new: Vec<Vec<String>> = current_cycles
        .difference(&historical_cycles)
        .cloned()
        .collect();

    let novelty_status = if uncomparable_records > 0 {
        "uncertain_incomplete_history"
    } else if !new.is_empty() {
        "potentially_new_cycles_detected"
    } else {
        "no_new_cycles_detected"
    };

    json!({
        "status": "success",
        "current_unique_cycles": current_cycles.len(),
        "historical_unique_cycles": historical_cycles.len(),
        "recurring_cycles": recurring,
        "new_cycles": new,
        "novelty_status": novelty_status,
        "uncomparable_historical_records": uncomparable_records,
        "limitations": [
            "Only saved wallet paths are compared.",
            "Missing historical graph evidence cannot establish a match.",
            "This comparison does not determine intent or prove wrongdoing."
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(wallets: &[&str]) -> Value {
        json!({
            "path_wallets": wallets
        })
    }

    #[test]
    fn repeated_six_hop_traversal_normalizes_to_three_hop_cycle() {
        let three_hop = vec![
            "A".to_string(),
            "B".to_string(),
            "C".to_string(),
            "A".to_string(),
        ];

        let six_hop = vec![
            "A".to_string(),
            "B".to_string(),
            "C".to_string(),
            "A".to_string(),
            "B".to_string(),
            "C".to_string(),
            "A".to_string(),
        ];

        assert_eq!(canonical_cycle(&three_hop), canonical_cycle(&six_hop));
    }

    #[test]
    fn rotated_paths_have_the_same_canonical_cycle() {
        let first = vec![
            "A".to_string(),
            "B".to_string(),
            "C".to_string(),
            "A".to_string(),
        ];

        let rotated = vec![
            "B".to_string(),
            "C".to_string(),
            "A".to_string(),
            "B".to_string(),
        ];

        assert_eq!(canonical_cycle(&first), canonical_cycle(&rotated));
    }

    #[test]
    fn open_paths_are_rejected() {
        let open = vec!["A".to_string(), "B".to_string(), "C".to_string()];

        assert_eq!(canonical_cycle(&open), None);
    }

    #[test]
    fn missing_historical_evidence_is_counted_as_uncomparable() {
        let current = vec![path(&["A", "B", "C", "A"])];
        let historical = vec![json!({
            "id": "old-case",
            "graph_evidence": null
        })];

        let result = compare_paths(&current, &historical);

        assert_eq!(result["current_unique_cycles"], 1);
        assert_eq!(result["historical_unique_cycles"], 0);
        assert_eq!(result["new_cycles"].as_array().unwrap().len(), 1);
        assert_eq!(result["uncomparable_historical_records"], 1);
    }

    #[test]
    fn matching_saved_paths_are_recurring() {
        let current = vec![path(&["A", "B", "C", "A"])];
        let historical = vec![json!({
            "id": "old-case",
            "graph_evidence": [
                { "path_wallets": ["B", "C", "A", "B"] }
            ]
        })];

        let result = compare_paths(&current, &historical);

        assert_eq!(result["recurring_cycles"].as_array().unwrap().len(), 1);
        assert_eq!(result["new_cycles"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn empty_historical_evidence_is_counted_as_uncomparable() {
        let current = vec![path(&["A", "B", "C", "A"])];
        let historical = vec![json!({
            "id": "empty-case",
            "graph_evidence": []
        })];

        let result = compare_paths(&current, &historical);

        assert_eq!(result["historical_unique_cycles"], 0);
        assert_eq!(result["uncomparable_historical_records"], 1);
    }

    #[test]
    fn invalid_historical_paths_are_counted_as_uncomparable() {
        let current = vec![path(&["A", "B", "C", "A"])];
        let historical = vec![json!({
            "id": "invalid-case",
            "graph_evidence": [
                { "path_wallets": ["A", "B", "C"] }
            ]
        })];

        let result = compare_paths(&current, &historical);

        assert_eq!(result["historical_unique_cycles"], 0);
        assert_eq!(result["uncomparable_historical_records"], 1);
    }
}
