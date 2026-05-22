import { env, fbEnabled } from '../env';

const API_VERSION = 'v19.0';

export type ForwardableEvent = {
  name: string;
  platform?: string | null;
  deviceId?: string | null;
  params?: Record<string, unknown> | null;
};

// Forwards a single event to the Facebook App Events (Conversions) API.
// No-ops (returns false) until FB_APP_ID + FB_CAPI_ACCESS_TOKEN are configured,
// so this is safe to call unconditionally. Failures never throw.
export async function forwardEvent(evt: ForwardableEvent): Promise<boolean> {
  if (!fbEnabled) return false;
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${env.FB_APP_ID}/activities`;
    const customEvent: Record<string, unknown> = {
      _eventName: evt.name,
      ...(evt.params ?? {}),
    };
    const body = new URLSearchParams({
      event: 'CUSTOM_APP_EVENTS',
      application_tracking_enabled: '1',
      advertiser_tracking_enabled: '1',
      access_token: env.FB_CAPI_ACCESS_TOKEN,
      custom_events: JSON.stringify([customEvent]),
      platform: evt.platform ?? 'mobile',
    });
    if (evt.deviceId) body.set('advertiser_id', evt.deviceId);
    if (env.FB_TEST_EVENT_CODE) body.set('test_event_code', env.FB_TEST_EVENT_CODE);

    const res = await fetch(url, { method: 'POST', body });
    return res.ok;
  } catch {
    return false;
  }
}
