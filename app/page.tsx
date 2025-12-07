'use client';

import type { ChangeEvent, FormEvent } from "react";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { MODEL_OPTIONS, META_EVALUATOR_ID, getModelById } from "./lib/models";
import { simulateEvaluation } from "./lib/simulation";
import type {
  AggregatedScore,
  CrossEvaluation,
  ModelResponse,
  SimulationOutcome,
} from "./lib/types";

const MIN_MODELS = 4;
const MAX_MODELS = 5;

type ImageAttachment = {
  name: string;
  dataUrl: string;
};

const selectableModels = MODEL_OPTIONS.filter(
  (model) => model.id !== META_EVALUATOR_ID
);

const metaEvaluator = getModelById(META_EVALUATOR_ID);

export default function HomePage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [promptText, setPromptText] = useState("");
  const [imageAttachment, setImageAttachment] = useState<ImageAttachment | null>(
    null
  );
  const [simulation, setSimulation] = useState<SimulationOutcome | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userChoice, setUserChoice] = useState<string | null>(null);

  const handleToggleModel = (modelId: string) => {
    setSelected((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId);
      }
      if (prev.length >= MAX_MODELS) {
        return prev;
      }
      return [...prev, modelId];
    });
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImageAttachment(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Only image files are supported for visual prompts.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const result = loadEvent.target?.result;
      if (typeof result === "string") {
        setImageAttachment({
          name: file.name,
          dataUrl: result,
        });
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selected.length < MIN_MODELS) {
      setError(`Select at least ${MIN_MODELS} models to run a comparison.`);
      return;
    }
    if (selected.length > MAX_MODELS) {
      setError(`You can compare at most ${MAX_MODELS} models at a time.`);
      return;
    }
    if (!promptText.trim()) {
      setError("Enter a descriptive prompt to evaluate.");
      return;
    }

    setProcessing(true);
    setError(null);

    const promptPayload = {
      text: promptText.trim(),
      imageFileName: imageAttachment?.name,
      imageDataUrl: imageAttachment?.dataUrl,
      modality: imageAttachment ? "multimodal" : "text",
    } as const;

    const result = simulateEvaluation(selected, promptPayload);
    setSimulation(result);
    setUserChoice(null);
    setProcessing(false);
  };

  const leaderboard = useMemo(() => {
    if (!simulation) return [];
    return [...simulation.aggregates].sort((a, b) => b.overall - a.overall);
  }, [simulation]);

  const crossEvaluationsByModel = (modelId: string): CrossEvaluation[] | null => {
    if (!simulation) return null;
    return simulation.crossEvaluations.filter(
      (item) => item.targetModelId === modelId
    );
  };

  const geminiTop = simulation?.geminiRanking.find(
    (item) => item.placement === 1
  );

  const alignmentState = useMemo(() => {
    if (!simulation || !userChoice || !geminiTop) return null;
    const aligned = userChoice === geminiTop.modelId;
    const userModel = getModelById(userChoice);
    const geminiModel = getModelById(geminiTop.modelId);
    return {
      aligned,
      message: aligned
        ? `Alignment confirmed. You and ${metaEvaluator?.name ?? "Gemini"} both favored ${
            userModel?.name ?? userChoice
          }.`
        : `Divergence detected. You preferred ${
            userModel?.name ?? userChoice
          }, while ${metaEvaluator?.name ?? "Gemini"} selected ${
            geminiModel?.name ?? geminiTop.modelId
          }.`,
    };
  }, [simulation, userChoice, geminiTop]);

  const resetAttachment = () => setImageAttachment(null);

  const renderResponseCard = (
    response: ModelResponse,
    aggregate: AggregatedScore
  ) => {
    const model = getModelById(response.modelId);
    const peerEvaluations = crossEvaluationsByModel(response.modelId) ?? [];
    return (
      <article key={response.modelId} className="response-card">
        <header className="response-header">
          <div>
            <div className="response-title">{model?.name ?? response.modelId}</div>
            <div className="muted">
              {model?.vendor} • Supports {response.modalitySupport.join(", ")}
            </div>
          </div>
          <div className="tag">Overall {aggregate.overall.toFixed(1)}/10</div>
        </header>
        <div className="response-content">{response.content}</div>
        <ul className="metrics-grid">
          {response.highlights.map((highlight, index) => (
            <li key={index} className="muted">
              • {highlight}
            </li>
          ))}
        </ul>
        <div className="metrics-grid">
          <div className="score-row">
            <strong>Quality</strong>
            <span>{aggregate.meanMetrics.quality.toFixed(1)}/10</span>
            <strong>Clarity</strong>
            <span>{aggregate.meanMetrics.clarity.toFixed(1)}/10</span>
          </div>
          <div className="score-row">
            <strong>Relevance</strong>
            <span>{aggregate.meanMetrics.relevance.toFixed(1)}/10</span>
            <strong>Accuracy</strong>
            <span>{aggregate.meanMetrics.accuracy.toFixed(1)}/10</span>
          </div>
        </div>
        <div className="divider" />
        <div className="metrics-grid">
          <strong>Peer notes</strong>
          <ul className="metrics-grid">
            {peerEvaluations.slice(0, 3).map((evaluation) => {
              const judge = getModelById(evaluation.judgeModelId);
              return (
                <li key={`${evaluation.judgeModelId}-${evaluation.overall}`}>
                  <div className="muted">
                    {judge?.name ?? evaluation.judgeModelId} scored{" "}
                    {evaluation.overall.toFixed(1)}/10 – {evaluation.rationale}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </article>
    );
  };

  const topThreeMap = new Map(
    simulation?.topThree.map((item) => [item.modelId, item]) ?? []
  );

  return (
    <div className="app">
      <div className="container">
        <h1 className="title">Multimodal Prompt Testing & Ranking</h1>
        <p className="subtitle">
          Evaluate multimodal prompts across leading foundation models. Run
          parallel generations, let models cross-review peers, and compare the
          final adjudication from {metaEvaluator?.name ?? "Gemini"} with your own
          decision.
        </p>

        <form onSubmit={handleSubmit} className="prompt-form section">
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">1. Select models to benchmark</h2>
              <span className="badge">
                {selected.length} selected · choose {MIN_MODELS}-{MAX_MODELS}
              </span>
            </div>
            <p className="section-description">
              Combine frontier and open models to stress test prompt resilience.
              Each model will generate a full response and evaluate peer outputs.
            </p>
            <div className="model-grid">
              {selectableModels.map((model) => (
                <label
                  key={model.id}
                  className={clsx("model-card", {
                    selected: selected.includes(model.id),
                  })}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(model.id)}
                    onChange={() => handleToggleModel(model.id)}
                  />
                  <div className="model-name">{model.name}</div>
                  <div className="model-meta">
                    {model.vendor} • {model.capabilities.join(" + ")} •{" "}
                    {model.release}
                  </div>
                  <p className="section-description">{model.description}</p>
                </label>
              ))}
            </div>
            {selected.length < MIN_MODELS && (
              <div className="models-required">
                Select at least {MIN_MODELS} models to continue.
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-header">
              <h2 className="section-title">2. Compose your multimodal brief</h2>
            </div>
            <label className="field-label" htmlFor="prompt">
              Text prompt
            </label>
            <textarea
              id="prompt"
              className="input-textarea"
              placeholder="Describe the task, context, desired outputs, evaluation criteria, and any constraints."
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
            />
            <div className="field-subtext">
              Richer prompts yield more informative cross-model comparisons.
              Include expectations for tone and verification.
            </div>
            <div className="upload-area">
              <label className="field-label" htmlFor="image">
                Optional image context
              </label>
              <input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
              />
              {imageAttachment ? (
                <div className="upload-preview">
                  <span>Attached: {imageAttachment.name}</span>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={resetAttachment}
                    style={{ padding: "0.45rem 1.2rem" }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="muted">
                  Attach a reference image to evaluate multimodal comprehension.
                </div>
              )}
            </div>
          </section>

          <div className="action-bar">
            <button
              type="submit"
              className="primary-button"
              disabled={processing}
            >
              {processing ? "Processing..." : "Run benchmark"}
            </button>
            <div className="subdued">
              Responses are simulated locally to illustrate evaluation workflows.
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
        </form>

        {simulation && (
          <div className="section">
            <div className="divider" />
            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Aggregated leaderboard</h2>
              </div>
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Model</th>
                    <th>Quality</th>
                    <th>Clarity</th>
                    <th>Relevance</th>
                    <th>Accuracy</th>
                    <th>Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, index) => {
                    const model = getModelById(entry.modelId);
                    return (
                      <tr key={entry.modelId}>
                        <td>{index + 1}</td>
                        <td>{model?.name ?? entry.modelId}</td>
                        <td>{entry.meanMetrics.quality.toFixed(1)}</td>
                        <td>{entry.meanMetrics.clarity.toFixed(1)}</td>
                        <td>{entry.meanMetrics.relevance.toFixed(1)}</td>
                        <td>{entry.meanMetrics.accuracy.toFixed(1)}</td>
                        <td>{entry.overall.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Model responses & peer reviews</h2>
              </div>
              <div className="results-grid">
                {simulation.responses.map((response) => {
                  const aggregate =
                    simulation.aggregates.find(
                      (item) => item.modelId === response.modelId
                    ) ?? topThreeMap.get(response.modelId);
                  if (!aggregate) return null;
                  return renderResponseCard(response, aggregate);
                })}
              </div>
            </section>

            <section className="section">
              <div className="section-header">
                <h2 className="section-title">
                  Final adjudication by {metaEvaluator?.name ?? "Gemini"}
                </h2>
              </div>
              <p className="section-description">
                The top three peer-ranked responses are rescored by the meta
                evaluator to deliver a definitive recommendation.
              </p>
              <div className="top-three-grid">
                {simulation.geminiRanking.map((ranking) => {
                  const model = getModelById(ranking.modelId);
                  const aggregate = topThreeMap.get(ranking.modelId);
                  return (
                    <div key={ranking.modelId} className="rank-card">
                      <div className="rank-info">
                        <span className="rank-label">#{ranking.placement}</span>
                        <span className="rank-model">
                          {model?.name ?? ranking.modelId}
                        </span>
                        <span className="rank-score">
                          Peer overall {aggregate?.overall.toFixed(1) ?? "–"} / 10 •
                          Confidence {ranking.confidence.toFixed(2)}
                        </span>
                      </div>
                      <div className="muted" style={{ maxWidth: "420px" }}>
                        {ranking.rationale}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Your manual verdict</h2>
              </div>
              <p className="section-description">
                Select the response you would ship. We will track alignment with{" "}
                {metaEvaluator?.name ?? "Gemini"} to calibrate trust in automated
                adjudication.
              </p>
              <div className="user-choice">
                <div className="radio-list">
                  {simulation.responses.map((response) => {
                    const model = getModelById(response.modelId);
                    return (
                      <label key={response.modelId} className="radio-item">
                        <input
                          type="radio"
                          name="user-choice"
                          value={response.modelId}
                          checked={userChoice === response.modelId}
                          onChange={() => setUserChoice(response.modelId)}
                        />
                        <span>
                          {model?.name ?? response.modelId} • Overall{" "}
                          {(
                            simulation.aggregates.find(
                              (item) => item.modelId === response.modelId
                            )?.overall ?? 0
                          ).toFixed(1)}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {alignmentState && (
                  <div
                    className={clsx("alignment", {
                      mismatch: !alignmentState.aligned,
                    })}
                  >
                    {alignmentState.message}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
