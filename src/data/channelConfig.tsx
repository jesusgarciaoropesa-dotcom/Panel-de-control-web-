import {
  AtSign,
  ThumbsUp,
  BarChart3,
  DollarSign,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import type { ChannelId } from './types';

interface ChannelMeta {
  title: string;
  icon: LucideIcon;
  /** Revenue channels use the accent tag; the rest use the neutral tag. */
  tag: { label: string; variant: 'neutral' | 'accent' };
}

export const CHANNEL_META: Record<ChannelId, ChannelMeta> = {
  instagram: {
    title: 'Instagram',
    icon: AtSign,
    tag: { label: 'Social', variant: 'neutral' },
  },
  facebook: {
    title: 'Facebook',
    icon: ThumbsUp,
    tag: { label: 'Social', variant: 'neutral' },
  },
  analytics: {
    title: 'Google Analytics',
    icon: BarChart3,
    tag: { label: 'Web', variant: 'neutral' },
  },
  adsense: {
    title: 'Google AdSense',
    icon: DollarSign,
    tag: { label: 'Ingresos', variant: 'accent' },
  },
  amazon: {
    title: 'Amazon Afiliados',
    icon: ShoppingCart,
    tag: { label: 'Ingresos', variant: 'accent' },
  },
};
