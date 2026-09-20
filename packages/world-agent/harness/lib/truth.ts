// The truth engine: scores a claim against the fact and the speaker's own
// knowledge. A lie needs `knows`; a wrong belief is an honest error.
import type { Character, World } from '@aot/interview-agent/schema';
import type { ClaimAssessment } from './types.ts';

type Claim = { factId: string; stance: 'assert' | 'deny' | 'uncertain' };

export function assessClaims(world: World, character: Character, claims: Claim[]): ClaimAssessment[] {
  return claims.map((claim) => ({ ...claim, result: assess(world, character, claim) }));
}

function assess(world: World, character: Character, claim: Claim): ClaimAssessment['result'] {
  const fact = world.facts.find((f) => f.id === claim.factId);
  if (!fact) return 'unscorable';
  if (fact.materiality === 'background' || fact.truth === 'disputed' || fact.truth === 'unknown') return 'unscorable';
  if (claim.stance === 'uncertain') return 'uncertain';
  const said = claim.stance === 'assert' ? 'true' : 'false';
  if (said === fact.truth) return 'truthful';
  const access = character.knowledge.find((k) => k.factId === claim.factId)?.access;
  return access === 'knows' ? 'false_knowing' : 'false_honest';
}

export const isScorable = (r: ClaimAssessment['result']) => r === 'truthful' || r === 'false_honest' || r === 'false_knowing';
