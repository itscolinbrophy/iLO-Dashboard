import type { TemperatureReading } from '../types/ilo';

/** A categorized group of temperature sensors. */
export interface TempGroup {
  key: string;
  label: string;
  readings: TemperatureReading[];
  average: number;
}

/** Match rules for each temperature category. */
const GROUP_RULES: Array<{ key: string; label: string; match: RegExp }> = [
  { key: 'cpu', label: 'CPU', match: /cpu/i },
  { key: 'dimm', label: 'DIMM / Memory', match: /dimm|mem/i },
  { key: 'drives', label: 'Drives / Storage', match: /hd|drive|storage|exp bay/i },
  { key: 'power', label: 'Power Supply', match: /ps |ps[0-9]|p\/s|power supply/i },
  { key: 'pci', label: 'PCI / Expansion', match: /pci/i },
  { key: 'vr', label: 'Voltage Regulator', match: /vr/i },
  { key: 'ambient', label: 'Ambient / System', match: /inlet|ambient|chipset|zone|battery|ilo|fuse|lom|i\/o/i },
];

/** Group temperature readings into categories with averages. */
export function groupTemperatures(readings: TemperatureReading[]): TempGroup[] {
  const groups: TempGroup[] = GROUP_RULES.map((rule) => ({
    key: rule.key,
    label: rule.label,
    readings: [],
    average: 0,
  }));

  for (const reading of readings) {
    const group = groups.find((g) => {
      const rule = GROUP_RULES.find((r) => r.key === g.key)!;
      return rule.match.test(reading.name);
    });
    if (group) group.readings.push(reading);
  }

  // Drop empty groups and compute averages.
  return groups
    .filter((g) => g.readings.length > 0)
    .map((g) => ({
      ...g,
      average:
        Math.round(
          (g.readings.reduce((sum, r) => sum + r.readingC, 0) / g.readings.length) * 10,
        ) / 10,
    }));
}
