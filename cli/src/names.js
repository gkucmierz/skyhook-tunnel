/**
 * Curated positive, aesthetic word lists for 2-word random subdomains
 * Matching the Skyhook brand (colors, space, nature, energy).
 */

export const ADJECTIVES = [
  'amber', 'astral', 'awesome', 'azure', 'bold', 'brave', 'bright', 'calm',
  'clever', 'cobalt', 'coral', 'cosmic', 'crimson', 'crisp', 'cyan', 'daring',
  'eager', 'emerald', 'epic', 'fair', 'fast', 'fresh', 'frosty', 'gentle',
  'gleaming', 'golden', 'grand', 'indigo', 'ivory', 'keen', 'lively', 'lucid',
  'lunar', 'magic', 'neon', 'noble', 'polar', 'prime', 'proud', 'quick',
  'quiet', 'radiant', 'rapid', 'ruby', 'serene', 'sharp', 'silent', 'silver',
  'solar', 'stellar', 'sunny', 'super', 'swift', 'teal', 'tidy', 'ultra',
  'vivid', 'violet', 'warm', 'wild', 'wise', 'zen'
];

export const NOUNS = [
  'aurora', 'beacon', 'breeze', 'canyon', 'cliff', 'comet', 'cosmos', 'crest',
  'crystal', 'delta', 'drift', 'falcon', 'flare', 'forest', 'galaxy', 'glade',
  'grove', 'harbor', 'haven', 'horizon', 'island', 'lagoon', 'lotus', 'meadow',
  'meteor', 'moon', 'nebula', 'nexus', 'oasis', 'orbit', 'peak', 'phoenix',
  'pinnacle', 'planet', 'prism', 'pulse', 'quasar', 'radiance', 'ray', 'reef',
  'ridge', 'river', 'sanctuary', 'satellite', 'spark', 'spire',
  'stream', 'summit', 'tether', 'tide', 'trail', 'valley', 'vessel', 'voyage',
  'wave', 'willow', 'wind', 'zenith'
];

/**
 * Generates a random friendly 2-word subdomain (e.g. "neon-lagoon", "cosmic-falcon")
 * @returns {string}
 */
export function generateSubdomain() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}
