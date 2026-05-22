import { env } from '../env';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Sends an Expo push notification to many tokens. Returns counts.
export async function sendExpoPush(tokens: string[], msg: PushMessage) {
  const valid = tokens.filter((t) => /^Expo(nent)?PushToken\[/.test(t));
  let sent = 0;
  let failed = 0;
  for (const batch of chunk(valid, 100)) {
    const messages = batch.map((to) => ({
      to,
      title: msg.title,
      body: msg.body,
      sound: 'default',
      data: msg.data ?? {},
    }));
    try {
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(messages),
      });
      if (res.ok) sent += batch.length;
      else failed += batch.length;
    } catch {
      failed += batch.length;
    }
  }
  return { requested: tokens.length, valid: valid.length, sent, failed };
}
