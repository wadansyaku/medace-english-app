import { isBookSelectableForToday } from '../../shared/materialQuality';
import type { BookMetadata, BookProgress, DashboardSnapshot } from '../../types';
import type { DbUserRow } from './types';
import {
  canAccessOfficialBook,
  toBookMetadata,
  type DbBookRow,
} from './storage-support';

export interface DashboardBookCollections {
  todaySelectableBooks: DbBookRow[];
  officialBooks: BookMetadata[];
  myBooks: BookMetadata[];
}

export const buildDashboardBookCollections = (
  rows: DbBookRow[],
  user: DbUserRow,
): DashboardBookCollections => {
  const todaySelectableBooks: DbBookRow[] = [];
  const officialBooks: BookMetadata[] = [];
  const myBooks: BookMetadata[] = [];

  rows.forEach((row) => {
    const mapped = toBookMetadata(row);
    if (isBookSelectableForToday(mapped)) {
      todaySelectableBooks.push(row);
    }
    if (row.created_by === user.id) {
      myBooks.push(mapped);
      return;
    }
    if (canAccessOfficialBook(user, mapped)) {
      officialBooks.push(mapped);
    }
  });

  officialBooks.sort((left, right) => (
    left.isPriority === right.isPriority
      ? left.title.localeCompare(right.title)
      : left.isPriority
        ? -1
        : 1
  ));
  myBooks.sort((left, right) => right.id.localeCompare(left.id));

  return {
    todaySelectableBooks,
    officialBooks,
    myBooks,
  };
};

export const buildDashboardProgressMap = (
  progressResults: BookProgress[],
): Record<string, BookProgress> => {
  const progressMap: Record<string, BookProgress> = {};
  progressResults.forEach((progress) => {
    progressMap[progress.bookId] = progress;
  });
  return progressMap;
};

export interface DashboardSnapshotModelInput extends Omit<DashboardSnapshot, 'progressMap'> {
  progressResults: BookProgress[];
}

export const buildDashboardSnapshotModel = ({
  progressResults,
  ...snapshot
}: DashboardSnapshotModelInput): DashboardSnapshot => ({
  ...snapshot,
  progressMap: buildDashboardProgressMap(progressResults),
});
