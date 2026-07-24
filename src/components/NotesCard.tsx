import { Lightbulb } from 'lucide-react';
import type { Insight } from '../data/types';
import './NotesCard.css';

interface NotesCardProps {
  insights: Insight[];
}

/** "Notas rápidas": auto-generated insights derived from the current data. */
export function NotesCard({ insights }: NotesCardProps) {
  return (
    <section className="notes-card" aria-label="Notas rápidas">
      <header className="notes-card__header">
        <Lightbulb size={20} strokeWidth={2} aria-hidden="true" />
        <h3 className="notes-card__title">Notas rápidas</h3>
      </header>
      <ul className="notes-card__list">
        {insights.map((insight) => (
          <li className="notes-card__item" key={insight.id}>
            {insight.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
