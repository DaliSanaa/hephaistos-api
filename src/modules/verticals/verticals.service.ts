import { Injectable, NotFoundException } from '@nestjs/common';
import { LotStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const CACHE_VERTICALS = 'verticals:all';
const CACHE_CATEGORIES = 'categories:list';

function mapSpecField(t: {
  key: string;
  labelKey: string;
  type: string;
  unit: string | null;
  unitKey: string | null;
  options: string[];
  optionKeys: string[];
  required: boolean;
  showInCard: boolean;
  showInGrid: boolean;
}) {
  return {
    key: t.key,
    labelKey: t.labelKey,
    type: t.type,
    ...(t.unit ? { unit: t.unit } : {}),
    ...(t.unitKey ? { unitKey: t.unitKey } : {}),
    ...(t.options.length ? { options: t.options } : {}),
    ...(t.optionKeys.length ? { optionKeys: t.optionKeys } : {}),
    required: t.required,
    showInCard: t.showInCard,
    showInGrid: t.showInGrid,
  };
}

@Injectable()
export class VerticalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async invalidateCatalogCache(): Promise<void> {
    await this.redis.del(CACHE_VERTICALS);
    await this.redis.del(CACHE_CATEGORIES);
  }

  async findAllVerticals() {
    return this.redis.getOrSet(CACHE_VERTICALS, 300, () =>
      this.loadVerticalsFromDb(),
    );
  }

  private async loadVerticalsFromDb() {
    const verticals = await this.prisma.vertical.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        categories: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            specTemplates: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    return verticals.map((v) => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      labelKey: v.labelKey,
      categories: v.categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        labelKey: c.labelKey,
        icon: c.icon,
        specFields: c.specTemplates.map(mapSpecField),
      })),
    }));
  }

  async findAllCategoriesFlat() {
    return this.redis.getOrSet(CACHE_CATEGORIES, 60, () =>
      this.loadCategoriesFlatFromDb(),
    );
  }

  private async loadCategoriesFlatFromDb() {
    const counts = await this.prisma.lot.groupBy({
      by: ['categoryId'],
      where: { status: LotStatus.ACTIVE, deletedAt: null },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.categoryId, c._count._all]));

    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: { vertical: { select: { id: true } } },
      orderBy: [{ verticalId: 'asc' }, { sortOrder: 'asc' }],
    });

    return categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      labelKey: c.labelKey,
      icon: c.icon,
      verticalId: c.vertical.id,
      lotCount: countMap.get(c.id) ?? 0,
    }));
  }

  async findCategoryBySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug, isActive: true },
      include: {
        vertical: {
          select: { id: true, slug: true, name: true, labelKey: true },
        },
        specTemplates: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return {
      id: category.id,
      slug: category.slug,
      name: category.name,
      labelKey: category.labelKey,
      icon: category.icon,
      vertical: category.vertical,
      specTemplates: category.specTemplates.map((t) => ({
        key: t.key,
        labelKey: t.labelKey,
        type: t.type,
        unit: t.unit,
        unitKey: t.unitKey,
        options: t.options,
        optionKeys: t.optionKeys,
        required: t.required,
        showInCard: t.showInCard,
        showInGrid: t.showInGrid,
        sortOrder: t.sortOrder,
      })),
    };
  }
}
