const parsedDateParts = (value, yearly) => {
  const match = String(value ?? '').match(
    yearly ? /^(?:(\d{4})-)?(\d{2})-(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})$/,
  );
  if (!match) {
    throw new Error(
      yearly
        ? '--date must use MM-DD or YYYY-MM-DD with --yearly.'
        : '--date must use YYYY-MM-DD.',
    );
  }
  const [, first, second, third] = match;
  return yearly
    ? {
        year: null,
        month: Number(third === undefined ? first : second),
        day: Number(third === undefined ? second : third),
      }
    : { year: Number(first), month: Number(second), day: Number(third) };
};

export const milestoneDateRule = ({
  date,
  leapDayPolicy = 'feb-28',
  leapMonth = false,
  lunar = false,
  missingLeapMonthPolicy = 'regular-month',
  yearly = false,
}) => {
  const parts = parsedDateParts(date, yearly);
  if (
    !Number.isInteger(parts.month) ||
    parts.month < 1 ||
    parts.month > 12 ||
    !Number.isInteger(parts.day) ||
    parts.day < 1 ||
    parts.day > (lunar ? 30 : 31)
  ) {
    throw new Error('Milestone date is invalid.');
  }
  if (lunar) {
    if (!['regular-month', 'skip-year'].includes(missingLeapMonthPolicy)) {
      throw new Error('Invalid missing leap-month policy.');
    }
    return {
      calendar: 'lunar',
      ...parts,
      isLeapMonth: leapMonth,
      missingLeapMonthPolicy,
    };
  }
  const validationYear = parts.year ?? 2000;
  const candidate = new Date(
    Date.UTC(validationYear, parts.month - 1, parts.day),
  );
  const exactDate =
    candidate.getUTCFullYear() === validationYear &&
    candidate.getUTCMonth() === parts.month - 1 &&
    candidate.getUTCDate() === parts.day;
  const leapDayFallback = parts.month === 2 && parts.day === 29;
  if (
    (!exactDate && !leapDayFallback) ||
    !['feb-28', 'mar-1'].includes(leapDayPolicy)
  ) {
    throw new Error('Milestone date is invalid.');
  }
  return {
    calendar: 'solar',
    ...parts,
    leapDayPolicy,
  };
};

export const reminderOffsets = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (!String(value).trim()) {
    return [];
  }
  const offsets = String(value)
    .split(',')
    .map((item) => Number(item.trim()));
  if (
    offsets.some(
      (offset) =>
        !Number.isInteger(offset) || offset < 0 || offset > 365,
    )
  ) {
    throw new Error('--reminders must contain comma-separated day counts.');
  }
  return [...new Set(offsets)].sort((left, right) => left - right);
};
