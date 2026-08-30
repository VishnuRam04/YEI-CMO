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
  paletteRoles: [
    { hex: '#0B3D2E', role: 'primary' },
    { hex: '#F4E9D8', role: 'accent' },
  ],
  motifs: ['stacked crates'],
  typography: ['bold condensed headings'],
  logoDescription: 'Type: combination; Wording: NORTHWIND',
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

  it('keeps lettering out of a plain image', () => {
    const prompt = buildImagePrompt(kernel, visualKit, 'Hero shot.');
    expect(prompt).toContain('Do not include any text/lettering');
    expect(prompt).not.toContain('TEXT TO SET IN THE POSTER');
  });

  it('sets the approved copy and brand mark into a poster', () => {
    const prompt = buildImagePrompt(kernel, visualKit, 'Post 1 of the campaign.', {
      headline: 'Watch them do it themselves',
      supportingLines: ['Hands-on learning for ages 3 to 6'],
      highlights: ['Pours their own drink', 'Packs their own bag'],
      callToAction: 'Message us to book a free trial',
    });
    // The wording is quoted, so the model cannot paraphrase an approved claim.
    expect(prompt).toContain('Watch them do it themselves');
    expect(prompt).toContain('Hands-on learning for ages 3 to 6');
    expect(prompt).toContain('Message us to book a free trial');
    // Colours carry their roles, and the brand mark is described.
    expect(prompt).toContain('#0B3D2E (primary)');
    expect(prompt).toContain('Wording: NORTHWIND');
    expect(prompt).toContain('stacked crates');
    expect(prompt).toContain('informational graphic, not a photograph');
    expect(prompt).toContain('Do not invent prices');
    // The brand spec must be applied silently, never drawn as a swatch chart.
    expect(prompt).toContain('INSTRUCTION, NOT CONTENT');
    expect(prompt).toContain('Do not render');
    expect(prompt).toContain('do not repeat the same illustration twice');
    // Highlights drive the icon set that makes it read as an infographic.
    expect(prompt).toContain('Pours their own drink');
    expect(prompt).toContain('its own icon');
    expect(prompt).toContain('well under a third of the poster');
    expect(prompt).toContain('Never draw an ellipsis');
    // Field names must not sit beside the text they describe, or they get drawn.
    expect(prompt).not.toContain('Highlight (pair with its own icon)');
    expect(prompt).toContain('no website address');
  });

  it('refuses to invent a mark when the brand has no confirmed logo', () => {
    const prompt = buildImagePrompt(
      kernel,
      { ...visualKit, logoDescription: '' },
      'Post 1.',
      { headline: 'A', supportingLines: [], highlights: [], callToAction: 'B' },
    );
    expect(prompt).toContain('Do not invent a logo');
  });
});
