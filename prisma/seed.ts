import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  AuctionStatus,
  AuctionType,
  KycStatus,
  LotStatus,
  Prisma,
  PrismaClient,
  UserRole,
  UserType,
} from '@prisma/client';
import { VERTICALS } from '../src/modules/verticals/data/seed-verticals';

const prisma = new PrismaClient();

const MS_MIN = 60_000;
const MS_H = 60 * MS_MIN;
const MS_D = 24 * MS_H;

function iso(now: number, offsetMs: number): string {
  return new Date(now + offsetMs).toISOString();
}

/** Whole euros → cents */
function eur(n: number): number {
  return Math.round(n * 100);
}

const CATEGORY_DISPLAY: Record<string, string> = {
  tractors: 'Tractors',
  harvesters: 'Harvesters',
  trucks: 'Trucks',
  telehandlers: 'Telehandlers',
  implements: 'Implements',
  construction: 'Construction',
  trailers: 'Trailers',
};

const LISTING_REFS = [
  'HP-2025-0142',
  'HP-2025-0098',
  'HP-2025-0201',
  'HP-2025-0166',
  'HP-2025-0110',
  'HP-2025-0233',
] as const;

async function main() {
  const now = Date.now();
  const passwordHash = await bcrypt.hash('Admin123!', 10);
  const sellerHash = await bcrypt.hash('Seller123!', 10);
  const buyerHash = await bcrypt.hash('Buyer123!', 10);

  const verticalSeed = VERTICALS[0]!;

  const vertical = await prisma.vertical.upsert({
    where: { slug: verticalSeed.slug },
    create: {
      id: verticalSeed.id,
      slug: verticalSeed.slug,
      name: 'Agriculture',
      labelKey: verticalSeed.labelKey,
      sortOrder: 0,
      isActive: true,
    },
    update: {
      name: 'Agriculture',
      labelKey: verticalSeed.labelKey,
      isActive: true,
    },
  });

  for (let i = 0; i < verticalSeed.categories.length; i++) {
    const cat = verticalSeed.categories[i]!;
    await prisma.category.upsert({
      where: { slug: cat.slug },
      create: {
        id: cat.id,
        verticalId: vertical.id,
        slug: cat.slug,
        name: CATEGORY_DISPLAY[cat.slug] ?? cat.slug,
        labelKey: cat.labelKey,
        icon: cat.icon,
        sortOrder: i,
        isActive: true,
      },
      update: {
        name: CATEGORY_DISPLAY[cat.slug] ?? cat.slug,
        labelKey: cat.labelKey,
        icon: cat.icon,
        sortOrder: i,
      },
    });

    let sort = 0;
    for (const f of cat.specFields) {
      const so = sort++;
      await prisma.specTemplate.upsert({
        where: {
          categoryId_key: { categoryId: cat.id, key: f.key },
        },
        create: {
          categoryId: cat.id,
          key: f.key,
          labelKey: f.labelKey,
          type: f.type,
          unit: f.unit ?? null,
          unitKey: f.unitKey ?? null,
          options: f.options ?? [],
          optionKeys: f.optionKeys ?? [],
          required: f.required ?? false,
          showInCard: f.showInCard ?? false,
          showInGrid: f.showInGrid ?? true,
          sortOrder: so,
        },
        update: {
          labelKey: f.labelKey,
          type: f.type,
          unit: f.unit ?? null,
          unitKey: f.unitKey ?? null,
          options: f.options ?? [],
          optionKeys: f.optionKeys ?? [],
          required: f.required ?? false,
          showInCard: f.showInCard ?? false,
          showInGrid: f.showInGrid ?? true,
          sortOrder: so,
        },
      });
    }
  }

  const admin = await prisma.user.upsert({
    where: { email: 'admin@hephaistos.eu' },
    create: {
      email: 'admin@hephaistos.eu',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      userType: UserType.BUSINESS,
      role: UserRole.ADMIN,
      countryCode: 'DE',
      companyName: 'Hephaistos Ops',
      vatNumber: 'DE000000000',
      kycStatus: KycStatus.VERIFIED,
    },
    update: {
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
    },
  });

  const seller = await prisma.user.upsert({
    where: { email: 'seller@hephaistos.test' },
    create: {
      email: 'seller@hephaistos.test',
      passwordHash: sellerHash,
      firstName: 'Bayern',
      lastName: 'Seller',
      userType: UserType.BUSINESS,
      role: UserRole.SELLER,
      countryCode: 'DE',
      companyName: 'Bayern Agri Sales',
      vatNumber: 'DE123456789',
      kycStatus: KycStatus.VERIFIED,
    },
    update: {
      passwordHash: sellerHash,
    },
  });

  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@hephaistos.test' },
    create: {
      email: 'buyer@hephaistos.test',
      passwordHash: buyerHash,
      firstName: 'Test',
      lastName: 'Buyer',
      userType: UserType.PRIVATE,
      role: UserRole.BUYER,
      countryCode: 'DE',
      kycStatus: KycStatus.NOT_STARTED,
    },
    update: {
      passwordHash: buyerHash,
    },
  });

  await prisma.notificationPreferences.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id },
    update: {},
  });
  await prisma.notificationPreferences.upsert({
    where: { userId: seller.id },
    create: { userId: seller.id },
    update: {},
  });
  await prisma.notificationPreferences.upsert({
    where: { userId: buyer.id },
    create: { userId: buyer.id },
    update: {},
  });

  const existingLots = await prisma.lot.findMany({
    where: { listingRef: { in: [...LISTING_REFS] } },
    select: { id: true },
  });
  for (const l of existingLots) {
    await prisma.bid.deleteMany({ where: { lotId: l.id } });
    await prisma.lotImage.deleteMany({ where: { lotId: l.id } });
    await prisma.lotDocument.deleteMany({ where: { lotId: l.id } });
    await prisma.lotLocation.deleteMany({ where: { lotId: l.id } });
    await prisma.lot.delete({ where: { id: l.id } });
  }

  type LotSeed = {
    slug: string;
    listingRef: (typeof LISTING_REFS)[number];
    title: string;
    brand: string;
    model: string;
    year: number;
    categoryId: string;
    condition: string;
    description: string;
    specs: Prisma.InputJsonValue;
    auctionType: AuctionType;
    auctionStatus: AuctionStatus;
    startOffsetMs: number;
    endOffsetMs: number;
    startingPriceEur: number;
    currentBidEur: number;
    bidCount: number;
    reservePriceEur?: number;
    reserveMet: boolean;
    buyNowPriceEur?: number;
    city: string;
    region: string;
    country: string;
    countryCode: string;
    lat: number;
    lng: number;
    images: string[];
    documents: { name: string; type: string; size: string }[];
    bids: { amountEur: number; minutesAgo: number }[];
  };

  const lots: LotSeed[] = [
    {
      slug: 'john-deere-6r-150-2021',
      listingRef: 'HP-2025-0142',
      title: 'John Deere 6R 150 — AutoPowr IVT, 4WD',
      brand: 'John Deere',
      model: '6R 150',
      year: 2021,
      categoryId: 'tractor',
      condition: 'Excellent',
      specs: {
        hours: 3200,
        power: 150,
        transmission: 'AutoPowr (IVT)',
        drive: '4WD',
        weight: 7450,
        fuelType: 'Diesel',
      },
      description:
        'Well-maintained 6R 150 from a medium-sized arable farm in Bavaria. Fitted with AutoPowr IVT transmission for smooth field work and road transport. Recent dealer service with fluids and filters documented. Cab is clean, guidance-ready wiring present. Ideal for mixed livestock and crop operations needing a versatile mid-frame tractor.',
      auctionType: AuctionType.TIMED,
      auctionStatus: AuctionStatus.LIVE,
      startOffsetMs: -2 * MS_D,
      endOffsetMs: 3 * MS_H,
      startingPriceEur: 35000,
      currentBidEur: 42500,
      bidCount: 11,
      reservePriceEur: 40000,
      reserveMet: true,
      buyNowPriceEur: 58000,
      city: 'Munich',
      region: 'Bavaria',
      country: 'Germany',
      countryCode: 'DE',
      lat: 48.1351,
      lng: 11.582,
      images: [1, 2, 3, 4, 5].map(
        (n) => `/images/lots/john-deere-6r-150-2021/${String(n).padStart(2, '0')}.jpg`,
      ),
      documents: [
        { name: 'Service history (PDF)', type: 'pdf', size: '2.4 MB' },
        { name: 'CE declaration (PDF)', type: 'pdf', size: '890 KB' },
        { name: 'Walk-around (MP4)', type: 'video', size: '124 MB' },
      ],
      bids: [
        { amountEur: 42500, minutesAgo: 12 },
        { amountEur: 41250, minutesAgo: 28 },
        { amountEur: 40000, minutesAgo: 55 },
        { amountEur: 38500, minutesAgo: 120 },
      ],
    },
    {
      slug: 'fendt-724-vario-gen6-2022',
      listingRef: 'HP-2025-0098',
      title: 'Fendt 724 Vario Gen6 — Vario CVT, 4WD',
      brand: 'Fendt',
      model: '724 Vario Gen6',
      year: 2022,
      categoryId: 'tractor',
      condition: 'Excellent',
      specs: {
        hours: 2100,
        power: 240,
        transmission: 'Vario (CVT)',
        drive: '4WD',
        weight: 9500,
        fuelType: 'Diesel',
      },
      description:
        'High-spec 724 Vario Gen6 with low hours for its year. Vario transmission delivers stepless speed control for heavy draft and PTO work. Tractor has been used on a large grain farm with full dealer diagnostics history. Tires at approximately 65% front / 55% rear. No known mechanical issues; ready for inspection.',
      auctionType: AuctionType.TIMED,
      auctionStatus: AuctionStatus.LIVE,
      startOffsetMs: -4 * MS_D,
      endOffsetMs: 32 * MS_H,
      startingPriceEur: 88000,
      currentBidEur: 95000,
      bidCount: 6,
      reservePriceEur: 102000,
      reserveMet: false,
      bids: [
        { amountEur: 95000, minutesAgo: 180 },
        { amountEur: 93500, minutesAgo: 400 },
        { amountEur: 91000, minutesAgo: 900 },
      ],
      city: 'Kiel',
      region: 'Schleswig-Holstein',
      country: 'Germany',
      countryCode: 'DE',
      lat: 54.3233,
      lng: 10.1228,
      images: [1, 2, 3, 4, 5].map(
        (n) => `/images/lots/fendt-724-vario-gen6-2022/${String(n).padStart(2, '0')}.jpg`,
      ),
      documents: [
        { name: 'Maintenance log (PDF)', type: 'pdf', size: '1.1 MB' },
        { name: 'Operator manual excerpt (PDF)', type: 'pdf', size: '4.2 MB' },
        { name: 'Dyno test summary (PDF)', type: 'pdf', size: '620 KB' },
      ],
    },
    {
      slug: 'claas-lexion-670-2019',
      listingRef: 'HP-2025-0201',
      title: 'Claas Lexion 670 — 7.5 m header, 390 hp',
      brand: 'Claas',
      model: 'Lexion 670',
      year: 2019,
      categoryId: 'harvester',
      condition: 'Good',
      specs: {
        hours: 1800,
        separatorHours: 1200,
        power: 390,
        headerWidth: 7.5,
        grainTankCapacity: 12000,
        transmission: 'HYBRID drive',
        drive: '4WD',
        weight: 17200,
        fuelType: 'Diesel',
      },
      description:
        'Lexion 670 combine from the Beauce grain belt. Mercedes-Benz 390 hp class engine, 7.5 m Vario cutterbar included. Separator hours are well below engine hours thanks to dry seasons and careful threshing setup. Recent concave and belt inspection. Suitable for large-scale cereals; straw chopper and chaff spreader in working order.',
      auctionType: AuctionType.TIMED,
      auctionStatus: AuctionStatus.UPCOMING,
      startOffsetMs: -MS_D,
      endOffsetMs: 5 * MS_D,
      startingPriceEur: 115000,
      currentBidEur: 128000,
      bidCount: 3,
      reservePriceEur: 120000,
      reserveMet: true,
      buyNowPriceEur: 165000,
      city: 'Chartres',
      region: 'Beauce',
      country: 'France',
      countryCode: 'FR',
      lat: 48.4439,
      lng: 1.489,
      images: [1, 2, 3, 4, 5].map(
        (n) => `/images/lots/claas-lexion-670-2019/${String(n).padStart(2, '0')}.jpg`,
      ),
      documents: [
        { name: 'CE certificate (PDF)', type: 'pdf', size: '1.8 MB' },
        { name: 'Header inspection (PDF)', type: 'pdf', size: '540 KB' },
        { name: 'Harvest sample video (MP4)', type: 'video', size: '210 MB' },
      ],
      bids: [
        { amountEur: 128000, minutesAgo: 720 },
        { amountEur: 122000, minutesAgo: 1400 },
      ],
    },
    {
      slug: 'man-tgx-18-510-4x2-bls-2020',
      listingRef: 'HP-2025-0166',
      title: 'MAN TGX 18.510 4x2 BLS — TipMatic, Euro 6',
      brand: 'MAN',
      model: 'TGX 18.510 4x2 BLS',
      year: 2020,
      categoryId: 'truck',
      condition: 'Good',
      specs: {
        km: 280000,
        power: 510,
        axleConfig: '4x2 BLS',
        euroClass: 'Euro 6',
        gvw: 18000,
        transmission: '12-speed TipMatic',
      },
      description:
        'Long-haul tractor unit from a fleet renewal programme. D2676 LF08 engine rated 510 hp with TipMatic automated gearbox. Euro 6 aftertreatment; documented dealer services. Interior shows normal wear; all safety systems operational. Ideal for refrigerated or container work with BLS sleeper cab configuration.',
      auctionType: AuctionType.BUY_NOW,
      auctionStatus: AuctionStatus.LIVE,
      startOffsetMs: -10 * MS_D,
      endOffsetMs: 30 * MS_D,
      startingPriceEur: 67500,
      currentBidEur: 0,
      bidCount: 0,
      reserveMet: true,
      buyNowPriceEur: 67500,
      bids: [],
      city: 'Rotterdam',
      region: 'South Holland',
      country: 'Netherlands',
      countryCode: 'NL',
      lat: 51.9244,
      lng: 4.4777,
      images: [1, 2, 3, 4, 5].map(
        (n) => `/images/lots/man-tgx-18-510-4x2-bls-2020/${String(n).padStart(2, '0')}.jpg`,
      ),
      documents: [
        { name: 'Tachograph export (PDF)', type: 'pdf', size: '320 KB' },
        { name: 'Maintenance invoices (PDF)', type: 'pdf', size: '3.1 MB' },
        { name: 'Cab walkthrough (MP4)', type: 'video', size: '88 MB' },
      ],
    },
    {
      slug: 'manitou-mlt-741-140-v-plus-2020',
      listingRef: 'HP-2025-0110',
      title: 'Manitou MLT 741-140 V+ — 7 m / 4,100 kg',
      brand: 'Manitou',
      model: 'MLT 741-140 V+',
      year: 2020,
      categoryId: 'telehandler',
      condition: 'Good',
      specs: {
        hours: 4500,
        power: 140,
        maxLiftHeight: 7,
        maxLiftCapacity: 4100,
        transmission: 'Powershift',
        drive: '4WD',
        weight: 10800,
        fuelType: 'Diesel',
      },
      description:
        'Manitou MLT 741-140 V+ telescopic handler used on a mixed farm and logistics yard. Maximum lift height 7 m with 4,100 kg capacity to full height per manufacturer charts. Deutz TCD engine; boom and auxiliary hydraulics checked annually. Some cosmetic scuffs on boom; mechanics reported sound. Good tyres for yard and field use.',
      auctionType: AuctionType.TIMED,
      auctionStatus: AuctionStatus.LIVE,
      startOffsetMs: -3 * MS_D,
      endOffsetMs: 12 * MS_H,
      startingPriceEur: 32000,
      currentBidEur: 38000,
      bidCount: 9,
      reservePriceEur: 35000,
      reserveMet: true,
      buyNowPriceEur: 48000,
      city: 'Poznań',
      region: 'Wielkopolska',
      country: 'Poland',
      countryCode: 'PL',
      lat: 52.4064,
      lng: 16.9252,
      images: [
        '/images/lots/manitou-mlt-741-140-v-plus-2020/01.jpg',
        '/images/lots/manitou-mlt-741-140-v-plus-2020/02.jpg',
        '/images/lots/manitou-mlt-741-140-v-plus-2020/03.jpg',
        '/images/lots/manitou-mlt-741-140-v-plus-2020/04.jpg',
        '/images/lots/manitou-mlt-741-140-v-plus-2020/05.png',
      ],
      documents: [
        { name: 'LOLER inspection (PDF)', type: 'pdf', size: '410 KB' },
        { name: 'Hydraulic test (PDF)', type: 'pdf', size: '260 KB' },
        { name: 'Load cycle demo (MP4)', type: 'video', size: '64 MB' },
      ],
      bids: [
        { amountEur: 38000, minutesAgo: 22 },
        { amountEur: 37250, minutesAgo: 48 },
        { amountEur: 36500, minutesAgo: 95 },
      ],
    },
    {
      slug: 'new-holland-t7-315-hd-2023',
      listingRef: 'HP-2025-0233',
      title: 'New Holland T7.315 HD — Auto Command CVT, 4WD',
      brand: 'New Holland',
      model: 'T7.315 HD',
      year: 2023,
      categoryId: 'tractor',
      condition: 'Excellent',
      specs: {
        hours: 900,
        power: 313,
        transmission: 'Auto Command (CVT)',
        drive: '4WD',
        weight: 9200,
        fuelType: 'Diesel',
      },
      description:
        'Nearly new T7.315 HD with Auto Command CVT and heavy-duty rear axle option. Low hours from demonstration and light tillage work on a family farm in Castilla y León. Full LED lighting package, suspended front axle, and premium cab. Still eligible for remaining manufacturer powertrain coverage subject to transfer rules — paperwork available after sale agreement.',
      auctionType: AuctionType.TIMED,
      auctionStatus: AuctionStatus.UPCOMING,
      startOffsetMs: -12 * MS_H,
      endOffsetMs: 6 * MS_D,
      startingPriceEur: 145000,
      currentBidEur: 145000,
      bidCount: 1,
      reservePriceEur: 155000,
      reserveMet: false,
      bids: [{ amountEur: 145000, minutesAgo: 300 }],
      city: 'Valladolid',
      region: 'Castilla y León',
      country: 'Spain',
      countryCode: 'ES',
      lat: 41.6523,
      lng: -4.7245,
      images: [1, 2, 3, 4, 5].map(
        (n) => `/images/lots/new-holland-t7-315-hd-2023/${String(n).padStart(2, '0')}.jpg`,
      ),
      documents: [
        { name: 'Warranty booklet (PDF)', type: 'pdf', size: '980 KB' },
        { name: 'PDI checklist (PDF)', type: 'pdf', size: '310 KB' },
      ],
    },
  ];

  for (const L of lots) {
    const startDate = iso(now, L.startOffsetMs);
    const endDate = iso(now, L.endOffsetMs);

    const lot = await prisma.lot.create({
      data: {
        slug: L.slug,
        listingRef: L.listingRef,
        title: L.title,
        brand: L.brand,
        model: L.model,
        year: L.year,
        categoryId: L.categoryId,
        condition: L.condition,
        description: L.description,
        status: LotStatus.ACTIVE,
        specs: L.specs,
        sellerId: seller.id,
        auctionType: L.auctionType,
        auctionStatus: L.auctionStatus,
        startingPrice: eur(L.startingPriceEur),
        reservePrice:
          L.reservePriceEur !== undefined ? eur(L.reservePriceEur) : null,
        buyNowPrice:
          L.buyNowPriceEur !== undefined ? eur(L.buyNowPriceEur) : null,
        startDate,
        endDate,
        currentBid: eur(L.currentBidEur),
        bidCount: L.bidCount,
        reserveMet: L.reserveMet,
        winnerId: null,
      },
    });

    await prisma.lotLocation.create({
      data: {
        lotId: lot.id,
        city: L.city,
        region: L.region,
        country: L.country,
        countryCode: L.countryCode,
        lat: L.lat,
        lng: L.lng,
      },
    });

    let imgOrder = 0;
    for (const url of L.images) {
      const idx = imgOrder++;
      await prisma.lotImage.create({
        data: {
          lotId: lot.id,
          url,
          sortOrder: idx,
          isPrimary: idx === 0,
        },
      });
    }

    for (const d of L.documents) {
      await prisma.lotDocument.create({
        data: {
          lotId: lot.id,
          name: d.name,
          type: d.type,
          url: `/documents/placeholder/${L.slug}/${d.name}`,
          size: d.size,
        },
      });
    }

    for (const b of L.bids) {
      await prisma.bid.create({
        data: {
          lotId: lot.id,
          userId: buyer.id,
          amount: eur(b.amountEur),
          createdAt: new Date(now - b.minutesAgo * MS_MIN),
        },
      });
    }
  }

  console.log('Seed OK:', {
    admin: admin.email,
    seller: seller.email,
    buyer: buyer.email,
    lots: lots.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
