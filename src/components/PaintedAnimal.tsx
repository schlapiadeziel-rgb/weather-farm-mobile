import { useState } from 'react';
import type { ReactNode } from 'react';
import type { AnimalId } from '../lib/farmTypes';

/** A visual layer only: the parent owns health, production and interaction. */
export default function PaintedAnimal({ animal, fallback }: { animal: AnimalId; fallback: ReactNode }) {
  const [failedAnimal, setFailedAnimal] = useState<AnimalId | null>(null);
  if (failedAnimal === animal) return <g data-animal-art={animal} data-art-status="fallback">{fallback}</g>;
  return <g className="fv-animal-body fv-painted-animal" data-animal-art={animal} data-art-status="painted">
    <image href={`/art/animals/${animal}.webp`} x="4" y="-1" width="112" height="108" preserveAspectRatio="xMidYMax meet" aria-hidden="true" onError={() => setFailedAnimal(animal)} />
  </g>;
}
