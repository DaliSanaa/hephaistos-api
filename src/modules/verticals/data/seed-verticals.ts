export interface SpecFieldDefinition {
  key: string;
  labelKey: string;
  type: 'number' | 'string' | 'select';
  unit?: string;
  unitKey?: string;
  options?: string[];
  optionKeys?: string[];
  required?: boolean;
  showInCard?: boolean;
  showInGrid?: boolean;
}

export interface CategoryDefinition {
  id: string;
  slug: string;
  labelKey: string;
  icon: string;
  specFields: SpecFieldDefinition[];
}

export interface VerticalDefinition {
  id: string;
  slug: string;
  labelKey: string;
  categories: CategoryDefinition[];
}

export const VERTICALS: VerticalDefinition[] = [
  {
    id: 'agriculture',
    slug: 'agriculture',
    labelKey: 'verticalAgriculture',
    categories: [
      {
        id: 'tractor',
        slug: 'tractors',
        labelKey: 'categoryTractors',
        icon: '🚜',
        specFields: [
          {
            key: 'hours',
            labelKey: 'specHours',
            type: 'number',
            unit: 'h',
            showInCard: true,
            showInGrid: true,
            required: true,
          },
          {
            key: 'power',
            labelKey: 'specPower',
            type: 'number',
            unit: 'HP',
            showInCard: true,
            showInGrid: true,
            required: true,
          },
          {
            key: 'transmission',
            labelKey: 'specTransmission',
            type: 'select',
            options: ['Mechanical', 'Powershift', 'CVT / IVT'],
            optionKeys: ['transMechanical', 'transPowershift', 'transCvt'],
            showInGrid: true,
            required: true,
          },
          {
            key: 'drive',
            labelKey: 'specDrive',
            type: 'select',
            options: ['2WD', '4WD'],
            optionKeys: ['drive2wd', 'drive4wd'],
            showInGrid: true,
            required: true,
          },
          {
            key: 'weight',
            labelKey: 'specWeight',
            type: 'number',
            unit: 'kg',
            showInGrid: false,
          },
          {
            key: 'fuelType',
            labelKey: 'specFuelType',
            type: 'select',
            options: ['Diesel', 'Electric', 'Hybrid'],
            optionKeys: ['fuelDiesel', 'fuelElectric', 'fuelHybrid'],
            showInGrid: false,
          },
        ],
      },
      {
        id: 'harvester',
        slug: 'harvesters',
        labelKey: 'categoryHarvesters',
        icon: '🌾',
        specFields: [
          {
            key: 'hours',
            labelKey: 'specHours',
            type: 'number',
            unit: 'h',
            showInCard: true,
            showInGrid: true,
            required: true,
          },
          {
            key: 'separatorHours',
            labelKey: 'specSeparatorHours',
            type: 'number',
            unit: 'h',
            showInGrid: true,
          },
          {
            key: 'power',
            labelKey: 'specPower',
            type: 'number',
            unit: 'HP',
            showInCard: true,
            showInGrid: true,
            required: true,
          },
          {
            key: 'headerWidth',
            labelKey: 'specHeaderWidth',
            type: 'number',
            unit: 'm',
            showInGrid: true,
          },
          {
            key: 'grainTankCapacity',
            labelKey: 'specGrainTank',
            type: 'number',
            unit: 'L',
            showInGrid: true,
          },
          {
            key: 'transmission',
            labelKey: 'specTransmission',
            type: 'select',
            options: ['Mechanical', 'Powershift', 'CVT / IVT'],
            optionKeys: ['transMechanical', 'transPowershift', 'transCvt'],
            showInGrid: true,
          },
          {
            key: 'drive',
            labelKey: 'specDrive',
            type: 'select',
            options: ['2WD', '4WD'],
            optionKeys: ['drive2wd', 'drive4wd'],
            showInGrid: true,
          },
        ],
      },
      {
        id: 'truck',
        slug: 'trucks',
        labelKey: 'categoryTrucks',
        icon: '🚛',
        specFields: [
          {
            key: 'km',
            labelKey: 'specKm',
            type: 'number',
            unit: 'km',
            showInCard: true,
            showInGrid: true,
            required: true,
          },
          {
            key: 'power',
            labelKey: 'specPower',
            type: 'number',
            unit: 'HP',
            showInCard: true,
            showInGrid: true,
            required: true,
          },
          {
            key: 'axleConfig',
            labelKey: 'specAxle',
            type: 'string',
            showInGrid: true,
          },
          {
            key: 'euroClass',
            labelKey: 'specEuro',
            type: 'select',
            options: ['Euro 3', 'Euro 4', 'Euro 5', 'Euro 6', 'Euro 6d'],
            showInGrid: true,
          },
          {
            key: 'gvw',
            labelKey: 'specGvw',
            type: 'number',
            unit: 'kg',
            showInGrid: true,
          },
          {
            key: 'transmission',
            labelKey: 'specTransmission',
            type: 'select',
            options: ['Manual', 'Automated Manual', 'Automatic'],
            optionKeys: [
              'transManual',
              'transAutomatedManual',
              'transAutomatic',
            ],
            showInGrid: true,
          },
        ],
      },
      {
        id: 'telehandler',
        slug: 'telehandlers',
        labelKey: 'categoryTelehandlers',
        icon: '🏗️',
        specFields: [
          {
            key: 'hours',
            labelKey: 'specHours',
            type: 'number',
            unit: 'h',
            showInCard: true,
            showInGrid: true,
            required: true,
          },
          {
            key: 'power',
            labelKey: 'specPower',
            type: 'number',
            unit: 'HP',
            showInCard: true,
            showInGrid: true,
            required: true,
          },
          {
            key: 'maxLiftHeight',
            labelKey: 'specLiftHeight',
            type: 'number',
            unit: 'm',
            showInGrid: true,
          },
          {
            key: 'maxLiftCapacity',
            labelKey: 'specLiftCapacity',
            type: 'number',
            unit: 'kg',
            showInGrid: true,
          },
          {
            key: 'transmission',
            labelKey: 'specTransmission',
            type: 'select',
            options: ['Mechanical', 'Powershift', 'CVT / IVT'],
            optionKeys: ['transMechanical', 'transPowershift', 'transCvt'],
            showInGrid: true,
          },
          {
            key: 'drive',
            labelKey: 'specDrive',
            type: 'select',
            options: ['2WD', '4WD'],
            optionKeys: ['drive2wd', 'drive4wd'],
            showInGrid: true,
          },
        ],
      },
      {
        id: 'implement',
        slug: 'implements',
        labelKey: 'categoryImplements',
        icon: '🔧',
        specFields: [
          {
            key: 'hours',
            labelKey: 'specHours',
            type: 'number',
            unit: 'h',
            showInCard: true,
            showInGrid: true,
          },
          {
            key: 'power',
            labelKey: 'specPower',
            type: 'number',
            unit: 'HP',
            showInCard: true,
            showInGrid: true,
          },
          {
            key: 'weight',
            labelKey: 'specWeight',
            type: 'number',
            unit: 'kg',
            showInGrid: true,
          },
          {
            key: 'workingWidth',
            labelKey: 'specWorkingWidth',
            type: 'number',
            unit: 'm',
            showInGrid: true,
          },
        ],
      },
      {
        id: 'construction',
        slug: 'construction',
        labelKey: 'categoryConstruction',
        icon: '🏗️',
        specFields: [
          {
            key: 'hours',
            labelKey: 'specHours',
            type: 'number',
            unit: 'h',
            showInCard: true,
            showInGrid: true,
            required: true,
          },
          {
            key: 'power',
            labelKey: 'specPower',
            type: 'number',
            unit: 'HP',
            showInCard: true,
            showInGrid: true,
            required: true,
          },
          {
            key: 'weight',
            labelKey: 'specWeight',
            type: 'number',
            unit: 'kg',
            showInGrid: true,
          },
          {
            key: 'transmission',
            labelKey: 'specTransmission',
            type: 'select',
            options: ['Mechanical', 'Powershift', 'CVT / IVT'],
            optionKeys: ['transMechanical', 'transPowershift', 'transCvt'],
            showInGrid: true,
          },
          {
            key: 'drive',
            labelKey: 'specDrive',
            type: 'select',
            options: ['2WD', '4WD'],
            optionKeys: ['drive2wd', 'drive4wd'],
            showInGrid: true,
          },
        ],
      },
      {
        id: 'trailer',
        slug: 'trailers',
        labelKey: 'categoryTrailers',
        icon: '📦',
        specFields: [
          {
            key: 'weight',
            labelKey: 'specWeight',
            type: 'number',
            unit: 'kg',
            showInGrid: true,
          },
          {
            key: 'payload',
            labelKey: 'specPayload',
            type: 'number',
            unit: 'kg',
            showInGrid: true,
          },
          {
            key: 'axleConfig',
            labelKey: 'specAxle',
            type: 'string',
            showInGrid: true,
          },
        ],
      },
    ],
  },
];

/** Get all categories across all verticals (flat list). */
export function getAllCategories(): CategoryDefinition[] {
  return VERTICALS.flatMap((v) => v.categories);
}

/** Find a category by its id across all verticals. */
export function getCategoryById(id: string): CategoryDefinition | undefined {
  return getAllCategories().find((c) => c.id === id);
}

/** Find a category by its slug across all verticals. */
export function getCategoryBySlug(
  slug: string,
): CategoryDefinition | undefined {
  return getAllCategories().find((c) => c.slug === slug);
}

/** Get the spec field definitions for a given category id. */
export function getSpecFields(categoryId: string): SpecFieldDefinition[] {
  return getCategoryById(categoryId)?.specFields ?? [];
}

/** Check if a string is a valid category id. */
export function isValidCategory(value: string): boolean {
  return getCategoryById(value) !== undefined;
}

/** Get the vertical that contains a given category id. */
export function getVerticalForCategory(
  categoryId: string,
): VerticalDefinition | undefined {
  return VERTICALS.find((v) => v.categories.some((c) => c.id === categoryId));
}

/** Category ids that belong to a vertical (by vertical id or slug). */
export function getCategoryIdsForVertical(verticalSlugOrId: string): string[] {
  const v = VERTICALS.find(
    (x) => x.id === verticalSlugOrId || x.slug === verticalSlugOrId,
  );
  return v ? v.categories.map((c) => c.id) : [];
}

/** Get the default vertical (the first one — agriculture). */
export function getDefaultVertical(): VerticalDefinition {
  return VERTICALS[0];
}

/** Options for category filters (id + i18n label key). */
export function getCategoryFilterOptions(): {
  value: string;
  labelKey: string;
}[] {
  return getAllCategories().map((cat) => ({
    value: cat.id,
    labelKey: cat.labelKey,
  }));
}
