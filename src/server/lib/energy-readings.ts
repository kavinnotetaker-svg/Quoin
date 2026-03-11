type EnergyReadingLike = {
  id?: string;
  meterId?: string | null;
  meterType: string;
  source: string;
  periodStart: Date;
  periodEnd: Date;
  ingestedAt?: Date;
};

function readingKey(reading: EnergyReadingLike) {
  return [
    reading.meterId ?? "no-meter",
    reading.meterType,
    reading.source,
    reading.periodStart.toISOString(),
    reading.periodEnd.toISOString(),
  ].join("|");
}

export function dedupeEnergyReadings<T extends EnergyReadingLike>(readings: T[]) {
  const latestByKey = new Map<string, T>();

  for (const reading of readings) {
    const key = readingKey(reading);
    const current = latestByKey.get(key);

    if (!current) {
      latestByKey.set(key, reading);
      continue;
    }

    const readingTime = reading.ingestedAt?.getTime() ?? 0;
    const currentTime = current.ingestedAt?.getTime() ?? 0;

    if (readingTime > currentTime) {
      latestByKey.set(key, reading);
      continue;
    }

    if (
      readingTime === currentTime &&
      (reading.id ?? "").localeCompare(current.id ?? "") > 0
    ) {
      latestByKey.set(key, reading);
    }
  }

  return Array.from(latestByKey.values()).sort((left, right) => {
    const byPeriod = left.periodStart.getTime() - right.periodStart.getTime();
    if (byPeriod !== 0) {
      return byPeriod;
    }

    const byEnd = left.periodEnd.getTime() - right.periodEnd.getTime();
    if (byEnd !== 0) {
      return byEnd;
    }

    return left.meterType.localeCompare(right.meterType);
  });
}
