import type { Food } from './types'

/**
 * What a plate says (build C9), for the scene's read-back and the stack
 * engine. Restates what was tapped; decides nothing on its own.
 */

const ANIMAL: Food[] = ['oily-fish', 'red-meat', 'poultry', 'eggs', 'dairy']

export interface PlateRead {
  plantBased: boolean
  noOilyFish: boolean
}

export function readPlate(plate: Food[]): PlateRead {
  return {
    plantBased: plate.length > 0 && !plate.some((f) => ANIMAL.includes(f)),
    noOilyFish: plate.length > 0 && !plate.includes('oily-fish'),
  }
}
