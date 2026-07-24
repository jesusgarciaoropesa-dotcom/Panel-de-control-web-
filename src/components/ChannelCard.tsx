import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { ChannelState } from '../data/types';
import { CHANNEL_META } from '../data/channelConfig';
import { Sparkline } from './Sparkline';
import { TrendBadge } from './TrendBadge';
import { relativeTime } from '../data/relativeTime';
import './ChannelCard.css';

interface ChannelCardProps {
  state: ChannelState;
  onRetry?: () => void;
}

/**
 * Channel card. Renders one of four states — connected, loading (skeleton),
 * error (retry), disconnected — so a single failing channel never blanks the
 * whole panel.
 */
export function ChannelCard({ state, onRetry }: ChannelCardProps) {
  const meta = CHANNEL_META[state.id];
  const Icon = meta.icon;

  return (
    <section
      className="channel-card"
      aria-label={meta.title}
      aria-busy={state.status === 'loading'}
    >
      <header className="channel-card__header">
        <div className="channel-card__title-group">
          <Icon size={20} strokeWidth={2} className="channel-card__icon" aria-hidden="true" />
          <h3 className="channel-card__title">{meta.title}</h3>
        </div>
        <span className={`tag tag--${meta.tag.variant}`}>{meta.tag.label}</span>
      </header>

      {state.status === 'connected' && state.data && (
        <ConnectedBody state={state} />
      )}
      {state.status === 'loading' && <LoadingBody />}
      {state.status === 'error' && (
        <ErrorBody message={state.error} onRetry={onRetry} />
      )}
      {state.status === 'disconnected' && <DisconnectedBody title={meta.title} />}
    </section>
  );
}

function ConnectedBody({ state }: { state: ChannelState }) {
  const data = state.data!;
  return (
    <>
      <div className="channel-card__primary-row">
        <div>
          <div className="channel-card__primary-label">{data.primary.label}</div>
          <div className="channel-card__primary-value">{data.primary.value}</div>
          {data.primary.changePct !== undefined && (
            <TrendBadge changePct={data.primary.changePct} />
          )}
        </div>
        <Sparkline series={data.series} />
      </div>

      <dl className="channel-card__stats">
        {data.secondary.map((s) => (
          <div className="channel-card__stat" key={s.label}>
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>

      {state.lastSyncedAt && (
        <footer className="channel-card__synced">
          Actualizado {relativeTime(state.lastSyncedAt)}
        </footer>
      )}
    </>
  );
}

function LoadingBody() {
  return (
    <div className="channel-card__loading" aria-hidden="true">
      <div className="channel-card__primary-row">
        <div className="channel-card__loading-primary">
          <span className="skeleton skeleton--sm" />
          <span className="skeleton skeleton--lg" />
        </div>
        <span className="skeleton skeleton--spark" />
      </div>
      <div className="channel-card__stats">
        {[0, 1, 2].map((i) => (
          <div className="channel-card__stat" key={i}>
            <span className="skeleton skeleton--xs" />
            <span className="skeleton skeleton--md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorBody({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="channel-card__error" role="alert">
      <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
      <p className="channel-card__error-text">
        {message ?? 'No se pudieron cargar los datos de este canal.'}
      </p>
      {onRetry && (
        <button type="button" className="channel-card__retry" onClick={onRetry}>
          <RefreshCw size={14} strokeWidth={2.25} aria-hidden="true" />
          Reintentar
        </button>
      )}
    </div>
  );
}

function DisconnectedBody({ title }: { title: string }) {
  return (
    <div className="channel-card__disconnected">
      <p>{title} no está conectado.</p>
      <button type="button" className="channel-card__connect">
        Conectar canal
      </button>
    </div>
  );
}
