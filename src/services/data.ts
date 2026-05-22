import { prisma } from '../db';
import { compareVersions, lt } from '../lib/version';

const MOBILE_BUNDLE_ID = 'com.valuegarageupihelp.app';

// Default remote config seeded on first boot. Mirrors the mobile app's
// built-in defaults so the app behaves identically before anything is
// changed in the admin panel.
export function defaultConfigData() {
  return {
    webviewUrl: 'https://www.upihelp.npci.org.in/',
    onboarding: [
      {
        key: 'complaint',
        variant: 'complaint',
        title: 'Raise UPI Complaints',
        body: 'Report failed, wrong or pending UPI payments and keep track of every complaint in one place.',
      },
      {
        key: 'status',
        variant: 'status',
        title: 'Check Transaction Status',
        body: 'Get the real-time status of your UPI transactions instantly, anytime you need it.',
      },
      {
        key: 'resolve',
        variant: 'resolve',
        title: 'Resolve Issues Faster',
        body: "Access NPCI's official dispute redressal support and get your UPI issues resolved quickly.",
      },
    ],
    featureFlags: {} as Record<string, boolean>,
    // Forward-looking: the app will become multi-tab; the webview is one tab.
    tabs: [
      {
        key: 'help',
        title: 'UPI Help',
        type: 'webview',
        url: 'https://www.upihelp.npci.org.in/',
      },
    ],
    // Admin-configurable trimming of the embedded UPI Help page. Flip
    // hideHeader/lockToAutopay to false to restore the site's original UI.
    webview: {
      url: 'https://www.upihelp.npci.org.in/',
      hideHeader: true,
      hideFooter: true,
      lockToAutopay: true,
      topAlign: true,
      disableCarousel: true,
      hideTexts: ['Txn history', 'UPI Number'],
      extraHideSelectors: [] as string[],
    },
  };
}

export type Platform = 'all' | 'ios' | 'android';

function normPlatform(p?: string | null): Platform | undefined {
  if (p === 'ios' || p === 'android' || p === 'all') return p;
  return undefined;
}

export async function getConfig(platform?: string | null) {
  const norm = normPlatform(platform);
  if (norm && norm !== 'all') {
    const specific = await prisma.remoteConfig.findFirst({
      where: { platform: norm, active: true },
    });
    if (specific) return specific.data;
  }
  const all = await prisma.remoteConfig.findFirst({
    where: { platform: 'all', active: true },
  });
  return all?.data ?? defaultConfigData();
}

export async function getVersionStatus(platform?: string | null, version?: string | null) {
  const norm = normPlatform(platform);
  const empty = {
    updateRequired: false,
    updateAvailable: false,
    latest: null as string | null,
    minSupported: null as string | null,
    storeUrl: null as string | null,
    message: null as string | null,
  };
  if (norm !== 'ios' && norm !== 'android') return empty;
  const row = await prisma.appVersion.findUnique({ where: { platform: norm } });
  if (!row) return empty;
  return {
    updateRequired: version ? lt(version, row.minSupported) : false,
    updateAvailable: version ? lt(version, row.latest) : false,
    latest: row.latest,
    minSupported: row.minSupported,
    storeUrl: row.storeUrl,
    message: row.message,
  };
}

function serializeAnnouncement(a: {
  id: string;
  title: string;
  body: string;
  level: string;
  platform: string;
  startsAt: Date | null;
  endsAt: Date | null;
}) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    level: a.level,
    platform: a.platform,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
  };
}

export async function getAnnouncements(platform?: string | null, version?: string | null) {
  const norm = normPlatform(platform);
  const now = new Date();
  const platformFilter =
    norm && norm !== 'all' ? [{ platform: 'all' }, { platform: norm }] : [{ platform: 'all' }];

  const rows = await prisma.announcement.findMany({
    where: {
      active: true,
      OR: platformFilter,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows
    .filter((r) => {
      if (version && r.minVersion && lt(version, r.minVersion)) return false;
      if (version && r.maxVersion && compareVersions(version, r.maxVersion) > 0) return false;
      return true;
    })
    .map(serializeAnnouncement);
}

// Idempotently seeds default config + version rows. Runs on every boot.
export async function ensureDefaults() {
  const cfg = await prisma.remoteConfig.findFirst({ where: { platform: 'all' } });
  if (!cfg) {
    await prisma.remoteConfig.create({
      data: { platform: 'all', data: defaultConfigData() },
    });
  }
  const defaults: Array<{ platform: 'ios' | 'android'; storeUrl: string }> = [
    { platform: 'ios', storeUrl: 'https://apps.apple.com/app/idPLACEHOLDER' },
    {
      platform: 'android',
      storeUrl: `https://play.google.com/store/apps/details?id=${MOBILE_BUNDLE_ID}`,
    },
  ];
  for (const d of defaults) {
    const existing = await prisma.appVersion.findUnique({ where: { platform: d.platform } });
    if (!existing) {
      await prisma.appVersion.create({
        data: {
          platform: d.platform,
          minSupported: '1.0.0',
          latest: '1.0.0',
          storeUrl: d.storeUrl,
        },
      });
    }
  }
}
