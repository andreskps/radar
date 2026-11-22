// Modelo normalizado de lo que se lee de Instagram (architecture.md §5: tablas profiles y posts).
import type { PostType } from '../metrics/types';

export interface IgProfile {
  id: string;
  username: string;
  fullName: string;
  followers: number | null;
  following: number | null;
  mediaCount: number | null;
  isVerified: boolean;
  isPrivate: boolean;
  profilePicUrl: string | null;
  biography: string | null;
}

export interface IgPost {
  id: string;
  code: string;
  profileId: string;
  type: PostType;
  /** ms epoch. */
  takenAt: number;
  /** Reproducciones del reel (de la pestaña Reels). `null` = no disponible. */
  views: number | null;
  likes: number | null;
  comments: number | null;
  likesHidden: boolean;
  durationSec: number | null;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  collab: boolean;
  coverUrl: string | null;
}

/** Cifras de un reel según la pestaña Reels (allí no viene la fecha; se une con el timeline por código). */
export interface IgReelStats {
  code: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  durationSec: number | null;
}

export type PauseReason = 'rate_limit' | 'login_required' | 'checkpoint' | 'action_blocked';

/** Resultado de cada petición: nunca lanza por motivos de Instagram, siempre devuelve un estado. */
export type IgFailure =
  | { ok: false; status: 'paused'; reason: PauseReason; httpStatus: number; message: string }
  | { ok: false; status: 'error'; httpStatus: number; message: string };

export type IgResult<T> = { ok: true; data: T } | IgFailure;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
