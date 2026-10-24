import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react";

import FilterRulesBuilder from "./FilterRulesBuilder";
import { listPrepackagedRulesets } from "../../api/services";
import { FilterRuleset, RulesetSummary } from "../../types/rulesets";
import { rulesetFromSummary } from "../../utils/rulesets";
import {
  RuleExamplePitfall,
  ruleExamplePitfalls,
} from "../../utils/ruleExamplePitfalls";
import "./FilterRuleExamples.css";

type FilterRuleExamplesProps = {
  onUse: (ruleset: FilterRuleset) => void;
  onClose: () => void;
};

type ExampleCardModel = {
  id: string;
  name: string;
  description: string;
  ruleset: FilterRuleset;
  intent?: string;
  lesson?: string;
  useLabel: string;
};

function summaryToCard(summary: RulesetSummary): ExampleCardModel {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description ?? "",
    ruleset: rulesetFromSummary(summary),
    useLabel: "Use this rule set",
  };
}

function pitfallToCard(pitfall: RuleExamplePitfall): ExampleCardModel {
  return {
    id: pitfall.id,
    name: pitfall.name,
    description: pitfall.description,
    ruleset: pitfall.ruleset,
    intent: pitfall.intent,
    lesson: pitfall.lesson,
    useLabel: "Copy into editor to experiment",
  };
}

type ExampleCardProps = {
  card: ExampleCardModel;
  open: boolean;
  onToggle: () => void;
  onUse: (ruleset: FilterRuleset) => void;
};

function ExampleCard({ card, open, onToggle, onUse }: ExampleCardProps) {
  return (
    <section
      className={`rule-examples__item${card.lesson ? " rule-examples__item--pitfall" : ""}`}
    >
      <button
        type="button"
        className="rule-examples__item-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span className="rule-examples__item-title">{card.name}</span>
        <span className="rule-examples__item-description">{card.description}</span>
      </button>

      {open && (
        <div className="rule-examples__item-body">
          {card.intent && card.lesson && (
            <div className="rule-examples__lesson">
              <p>
                <span className="rule-examples__lesson-label">Intent</span>
                {card.intent}
              </p>
              <p>
                <span className="rule-examples__lesson-label">What actually happens</span>
                {card.lesson}
              </p>
            </div>
          )}

          <div className="rule-examples__editor">
            <h3 className="rule-examples__column-title">Filter editor (view only)</h3>
            <FilterRulesBuilder
              ruleset={card.ruleset}
              onChange={() => {}}
              disabled
              compact
              matchMode="search"
            />
          </div>

          <div className="rule-examples__item-actions">
            <button
              type="button"
              className="action-button action-button--primary"
              onClick={() => onUse(card.ruleset)}
            >
              {card.useLabel}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Gallery of built-in filter examples shown in the read-only editor. */
export default function FilterRuleExamples({
  onUse,
  onClose,
}: FilterRuleExamplesProps) {
  const [examples, setExamples] = useState<ExampleCardModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pitfalls = useMemo(() => ruleExamplePitfalls().map(pitfallToCard), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listPrepackagedRulesets();
        if (cancelled) return;
        const cards = list.map(summaryToCard);
        setExamples(cards);
        setExpandedId(cards[0]?.id ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load example rule sets."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderSection = (cards: ExampleCardModel[]) =>
    cards.map((card) => (
      <ExampleCard
        key={card.id}
        card={card}
        open={expandedId === card.id}
        onToggle={() => setExpandedId(expandedId === card.id ? null : card.id)}
        onUse={onUse}
      />
    ));

  return (
    <div className="rule-examples__overlay" onClick={onClose}>
      <div className="rule-examples__panel" onClick={(e) => e.stopPropagation()}>
        <header className="rule-examples__header">
          <div>
            <h2>Example rule sets</h2>
            <p className="rule-examples__subtitle">
              Read-only copies of the Advanced filters editor (Match when / Don't match
              when). Impossible all-of combinations, and path rules that search will
              not follow, show the same warnings as the real editor. Load a starter
              into your draft, or open a pitfall to see a trap.
            </p>
          </div>
          <button
            type="button"
            className="action-button action-button--secondary"
            onClick={onClose}
            aria-label="Close examples"
          >
            <X size={18} />
          </button>
        </header>

        <div className="rule-examples__body">
          {loading && (
            <p className="rule-examples__status">
              <Loader2 size={16} className="rule-examples__spin" /> Loading examples…
            </p>
          )}
          {error && <p className="rule-examples__error">{error}</p>}

          {!loading && !error && (
            <>
              <section className="rule-examples__section" aria-labelledby="rule-examples-starters">
                <h3 id="rule-examples-starters" className="rule-examples__section-title">
                  Starters
                </h3>
                <p className="rule-examples__section-blurb">
                  Ready-made rules using fields you can pick in Advanced filters
                  (name, path, extension, size, modified time). Load one and tweak it.
                </p>
                {renderSection(examples)}
                {examples.length === 0 && (
                  <p className="rule-examples__empty">No example rule sets are available.</p>
                )}
              </section>

              <section className="rule-examples__section" aria-labelledby="rule-examples-pitfalls">
                <h3 id="rule-examples-pitfalls" className="rule-examples__section-title">
                  Common pitfalls
                </h3>
                <p className="rule-examples__section-blurb">
                  These are not recommendations. Each one looks reasonable, then
                  does something else, including logical contradictions the editor
                  can catch.
                </p>
                {renderSection(pitfalls)}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
