const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const dateTimeFormats = {
  'date-time': {
    type: 'string' as const,
    validate: (value: string): boolean =>
      dateTimePattern.test(value) && !Number.isNaN(Date.parse(value)),
  },
};
