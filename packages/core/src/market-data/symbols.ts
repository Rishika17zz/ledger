export interface SeedSymbol {
  symbol: string;
  name: string;
  sector: string;
  basePrice: number;
  /** Annualized volatility during a calm regime; bursts multiply this. */
  calmVolatility: number;
  baseVolume: number;
}

export const SEED_SYMBOLS: SeedSymbol[] = [
  { symbol: "ARDX", name: "Ardex Systems", sector: "Semiconductors", basePrice: 142.5, calmVolatility: 0.28, baseVolume: 3_200_000 },
  { symbol: "NOVU", name: "Novum Health", sector: "Biotech", basePrice: 38.2, calmVolatility: 0.55, baseVolume: 5_100_000 },
  { symbol: "FLNT", name: "Flint Robotics", sector: "Industrials", basePrice: 76.1, calmVolatility: 0.32, baseVolume: 1_800_000 },
  { symbol: "QBIT", name: "Qubit Compute", sector: "Semiconductors", basePrice: 512.9, calmVolatility: 0.45, baseVolume: 2_400_000 },
  { symbol: "MRLN", name: "Meridian Foods", sector: "Consumer Staples", basePrice: 61.4, calmVolatility: 0.14, baseVolume: 2_900_000 },
  { symbol: "TIDL", name: "Tidal Energy", sector: "Energy", basePrice: 23.7, calmVolatility: 0.38, baseVolume: 6_700_000 },
  { symbol: "PXLS", name: "Pixel Forge", sector: "Media", basePrice: 19.85, calmVolatility: 0.42, baseVolume: 4_300_000 },
  { symbol: "GRNH", name: "Greenhaven Materials", sector: "Materials", basePrice: 88.3, calmVolatility: 0.22, baseVolume: 1_200_000 },
  { symbol: "VLTA", name: "Volta Mobility", sector: "Automotive", basePrice: 205.6, calmVolatility: 0.58, baseVolume: 8_900_000 },
  { symbol: "STRM", name: "Streamline Logistics", sector: "Transportation", basePrice: 54.9, calmVolatility: 0.25, baseVolume: 2_100_000 },
  { symbol: "AXIO", name: "Axiom Financial", sector: "Financials", basePrice: 132.0, calmVolatility: 0.18, baseVolume: 3_600_000 },
  { symbol: "HRZN", name: "Horizon Aerospace", sector: "Aerospace", basePrice: 310.4, calmVolatility: 0.24, baseVolume: 950_000 },
  { symbol: "CLST", name: "Coldstar Beverages", sector: "Consumer Staples", basePrice: 47.6, calmVolatility: 0.16, baseVolume: 2_500_000 },
  { symbol: "NMBL", name: "Nimbus Cloud", sector: "Software", basePrice: 168.75, calmVolatility: 0.34, baseVolume: 4_800_000 },
  { symbol: "OCTG", name: "Octagon Defense", sector: "Aerospace", basePrice: 221.1, calmVolatility: 0.2, baseVolume: 1_100_000 },
];
