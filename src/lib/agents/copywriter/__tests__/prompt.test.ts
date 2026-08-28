import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, buildImagePrompt } from '../prompt';

const kernel = {
  name: 'Acme Robotics',
  positioning: 'The only warehouse robot built for humid climates.',
  category: 'Warehouse robotics',
  icps: [{ name: 'Operations leaders', needs: ['Reliable humid-climate operation'] }],
  differentiators: ['Humidity-hardened components'],
  proofPoints: ['Deployed in an approved Jakarta pilot'],
  pricingPosture: {
    position: 'premium',
    summary: 'Competes on reliability rather than low price.',
    signals: ['Premium service package'],
    priceObjectionGuidance: 'Lead with lifecycle value.',
  },
  founderStory: {
    founders: ['Maya Tan'],
    foundingYear: '2021',
    originSummary: 'Started after warehouse robots repeatedly failed in humid climates.',
    foundingMotivation: 'Build reliable automation for Southeast Asia.',
    milestones: ['First Jakarta pilot'],
  },
  regulatedClaims: {
    status: 'potentially-regulated',
    domains: ['workplace safety'],
    needsClaimsReview: true,
    rationale: 'Safety outcomes require support.',
    substantiationRequirements: ['Use approved pilot evidence only'],
  },
  productCatalogues: [{
    fileName: 'robots.xlsx',
    products: [{
      name: 'DockBot X1',
      sku: 'DB-X1',
      category: 'Warehouse robots',
      description: 'Humidity-hardened warehouse robot',
      price: 12900,
      currency: 'USD',
      availability: 'In stock',
    }],
  }],
};

const voice = {
  toneAxes: { formal: 2, playful: 4, technical: 3, warm: 4, bold: 3, concise: 4 },
  do: ['use short sentences', 'lead with the customer problem'],
  dont: ['use jargon without explaining it'],
  bannedWords: ['synergy', 'disrupt'],
  exemplars: ['We built this because our old robots rusted in Jakarta.'],
};

const visualKit = {
  palette: ['#0B3D2E', '#F4E9D8'],
  styleFragment: 'matte, industrial, high-contrast product photography',
  logoSafeArea: 'keep 10% padding on all sides',
};

describe('buildSystemPrompt', () => {
  it('includes brand positioning and banned words when usedKernel=true', () => {
    const prompt = buildSystemPrompt(kernel, voice, true);
    expect(prompt).toContain(kernel.positioning);
    expect(prompt).toContain('synergy');
    expect(prompt).toContain('disrupt');
    expect(prompt).toContain(voice.exemplars[0]);
    expect(prompt).toContain(kernel.proofPoints[0]);
    expect(prompt).toContain(kernel.founderStory.originSummary);
    expect(prompt).toContain(kernel.pricingPosture.priceObjectionGuidance);
    expect(prompt).toContain('Extra claims review required: yes');
    expect(prompt).toContain('DockBot X1');
    expect(prompt).toContain('price USD 12900');
    expect(prompt).toContain('Do not invent a product, price');
  });

  it('omits every brand fact when usedKernel=false', () => {
    const prompt = buildSystemPrompt(kernel, voice, false);
    expect(prompt).not.toContain(kernel.positioning);
    expect(prompt).not.toContain('synergy');
    expect(prompt).not.toContain(voice.exemplars[0]);
  });
});

describe('buildUserPrompt', () => {
  it('names all three required angles', () => {
    const prompt = buildUserPrompt({ mode: 'text', channel: 'linkedin', brief: 'Announce our Series A.' });
    expect(prompt).toContain('pain-led');
    expect(prompt).toContain('proof-led');
    expect(prompt).toContain('contrarian');
  });

  it('wraps the brief as delimited, labelled data', () => {
    const prompt = buildUserPrompt({ mode: 'text', channel: 'email', brief: 'Launch the new SKU.' });
    expect(prompt).toContain('<brief>');
    expect(prompt).toContain('</brief>');
  });

  it('keeps hashtag metadata out of the generated body', () => {
    const prompt = buildUserPrompt({ mode: 'text', channel: 'linkedin', brief: 'Launch.' });
    expect(prompt).toContain('hashtags only in the "hashtags" array');
  });

  it('includes refinement instructions and prior text when refining', () => {
    const prompt = buildUserPrompt({
      mode: 'text',
      channel: 'instagram',
      brief: 'n/a',
      refine: { instruction: 'shorter', priorText: 'Original caption here.' },
    });
    expect(prompt).toContain('shorter');
    expect(prompt).toContain('Original caption here.');
  });
});

describe('buildImagePrompt', () => {
  it('carries the Visual Kit into the prompt', () => {
    const prompt = buildImagePrompt(kernel, visualKit, 'Product hero shot on a loading dock.');
    expect(prompt).toContain(visualKit.styleFragment);
    expect(prompt).toContain(visualKit.logoSafeArea);
    expect(prompt).toContain('#0B3D2E');
  });
});
