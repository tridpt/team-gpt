import path from 'node:path';
import { config } from '../config.js';
import { JsonStore } from '../store/jsonStore.js';

/**
 * Per-user usage tracking and daily budget enforcement.
 *
 * Usage is bucketed by UTC day so daily limits reset automatically at
 * midnight UTC. We keep:
 *   - today's live bucket (for budget checks)
 *   - a rolling history of daily totals (for the admin dashboard / charts)
 *   - all-time totals per user
 */
const store = new JsonStore(path.join(config.dataDir, 'usage.json'), { users: {} });

const HISTORY_DAYS = 30;
const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

function userRecord(userId) {
  if (!store.data.users[userId]) {
    store.data.users[userId] = { today: null, history: [], totals: emptyTotals() };
  }
  return store.data.users[userId];
}

function emptyTotals() {
  return { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function currentBucket(userId) {
  const rec = userRecord(userId);
  const day = today();
  if (!rec.today || rec.today.date !== day) {
    // Roll the previous day into history before resetting.
    if (rec.today) {
      rec.history.push(rec.today);
      if (rec.history.length > HISTORY_DAYS) rec.history.shift();
    }
    rec.today = { date: day, ...emptyTotals() };
  }
  return rec.today;
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}

/** Today's usage for a user (does not mutate). */
export function getTodayUsage(userId) {
  const b = currentBucket(userId);
  store.flush();
  return {
    date: b.date,
    requests: b.requests,
    inputTokens: b.inputTokens,
    outputTokens: b.outputTokens,
    costUsd: round(b.costUsd),
  };
}

/**
 * Check whether a new request is allowed under the user's daily budget.
 * @returns {{ allowed: boolean, reason?: string, usage, limits }}
 */
export function checkBudget(userId, limits) {
  const usage = getTodayUsage(userId);
  if (limits.dailyRequests != null && usage.requests >= limits.dailyRequests) {
    return {
      allowed: false,
      reason: `Daily request limit reached (${limits.dailyRequests}/day).`,
      usage,
      limits,
    };
  }
  if (limits.dailyCostUsd != null && usage.costUsd >= limits.dailyCostUsd) {
    return {
      allowed: false,
      reason: `Daily cost budget reached ($${limits.dailyCostUsd}/day).`,
      usage,
      limits,
    };
  }
  return { allowed: true, usage, limits };
}

/** Record a completed request's usage against a user. */
export function record(userId, { inputTokens = 0, outputTokens = 0, costUsd = 0 }) {
  return store.update((d) => {
    const rec = (d.users[userId] ||= { today: null, history: [], totals: emptyTotals() });
    const day = today();
    if (!rec.today || rec.today.date !== day) {
      if (rec.today) {
        rec.history.push(rec.today);
        if (rec.history.length > HISTORY_DAYS) rec.history.shift();
      }
      rec.today = { date: day, ...emptyTotals() };
    }
    for (const bucket of [rec.today, rec.totals]) {
      bucket.requests += 1;
      bucket.inputTokens += inputTokens;
      bucket.outputTokens += outputTokens;
      bucket.costUsd = round(bucket.costUsd + costUsd);
    }
    return { today: rec.today, totals: rec.totals };
  });
}

/** Full usage snapshot for one user (today + history + all-time totals). */
export function getUserUsage(userId) {
  const rec = userRecord(userId);
  const day = today();
  const todayBucket =
    rec.today && rec.today.date === day ? rec.today : { date: day, ...emptyTotals() };
  return {
    today: { ...todayBucket, costUsd: round(todayBucket.costUsd) },
    history: rec.history,
    totals: { ...rec.totals, costUsd: round(rec.totals.costUsd) },
  };
}

export function deleteUserUsage(userId) {
  store.update((d) => {
    delete d.users[userId];
  });
}

/** Sum today's usage across a set of users (for group budgets). */
export function sumTodayUsage(userIds) {
  let requests = 0;
  let costUsd = 0;
  for (const id of userIds) {
    const u = getTodayUsage(id);
    requests += u.requests;
    costUsd += u.costUsd;
  }
  return { requests, costUsd: round(costUsd) };
}
