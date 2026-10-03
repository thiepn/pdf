import { Icon } from "../components/Icon";
import { getTask, type PdfTask } from "../ia/taskCatalog";
import type { DocumentEntryRecommendation } from "./documentEntry";

interface Props {
  recommendations: DocumentEntryRecommendation[];
  checking: boolean;
  disabled?: boolean;
  compact?: boolean;
  onChoose: (task: PdfTask) => void;
  onDismiss?: () => void;
}

export function DocumentEntryRecommendations({ recommendations, checking, disabled, compact, onChoose, onDismiss }: Props) {
  if (!recommendations.length) return null;
  return <section className={`document-entry-recommendations${compact ? " document-entry-recommendations--compact" : ""}`} aria-label="Suggested actions for this PDF">
    <header className="document-entry-recommendations__header">
      <div><p className="eyebrow">Suggested for this PDF</p><span>{checking ? "Checking document structure locally…" : "Based on this document’s local structure"}</span></div>
      {onDismiss ? <button aria-label="Hide suggested actions" className="icon-button" onClick={onDismiss} type="button">×</button> : null}
    </header>
    <div className="document-entry-recommendations__list">
      {recommendations.map((recommendation) => {
        const task = getTask(recommendation.taskId);
        if (!task) return null;
        return <button className={`document-entry-recommendation${recommendation.warning ? " document-entry-recommendation--warning" : ""}`} disabled={disabled} key={recommendation.taskId} onClick={() => onChoose(task)} type="button">
          <Icon name={task.icon} size={20} />
          <span><strong>{recommendation.label}</strong><small>{recommendation.reason}</small><em>{recommendation.evidence}</em>{recommendation.warning ? <span className="document-entry-recommendation__warning">{recommendation.warning}</span> : null}</span>
          <Icon name="chevron-right" size={16} />
        </button>;
      })}
    </div>
    {!compact ? <p className="document-entry-recommendations__privacy"><Icon name="shield" size={14} /> Suggestions come from local PDF structure only. Nothing is uploaded and no AI model reads the document.</p> : null}
  </section>;
}
