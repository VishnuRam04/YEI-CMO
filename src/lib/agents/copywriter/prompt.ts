import {
  CHANNEL_CONSTRAINTS,
  type Channel,
  type CopywriterPayload,
  type RefineInstruction,
  type TextGenerationPayload,
} from './schema';

type BrandKernel = {
  name: string;
  positioning: string;
};

type VoiceProfile = {
  toneAxes: Record<string, number>;
  do: string[];
  dont: string[];
  bannedWords: string[];
  exemplars: string[];
};

type VisualKit = {
  palette: string[];
  styleFragment: string;
  logoSafeArea: string;
};

function formatToneAxes(toneAxes: Record<string, number>): string {
  return Object.entries(toneAxes)
    .map(([axis, value]) => `${axis}: ${value}/5`)
    .join(', ');
}

export function buildSystemPrompt(
  kernel: BrandKernel,
  voice: VoiceProfile,
  usedKernel: boolean = true,
): string {
  if (!usedKernel) {
    return `You are a marketing copywriter. Write generic, competent marketing
copy for the brief you are given. You have no information about the specific
brand beyond its name — do not invent specifics, positioning, or proof points.`;
  }

  return `You are the Copywriter agent for ${kernel.name}.

BRAND POSITIONING
${kernel.positioning}

VOICE PROFILE
Tone: ${formatToneAxes(voice.toneAxes)}
Always: ${voice.do.join('; ')}
Never: ${voice.dont.join('; ')}
Banned words: ${voice.bannedWords.join(', ')}

EXEMPLARS — match this voice:
${voice.exemplars.map((e) => `- ${e}`).join('\n')}
`;
}

export function buildUserPrompt(payload: TextGenerationPayload): string {
  const constraints = CHANNEL_CONSTRAINTS[payload.channel];

  const base = `CHANNEL
${payload.channel}

CHANNEL CONSTRAINTS
Max characters: ${constraints.maxChars}
Hashtags expected: ${constraints.hashtags ? 'yes' : 'no'}
Subject/preheader required: ${constraints.hasSubject ? 'yes' : 'no'}
Notes: ${constraints.notes}

BRIEF
<brief>
${payload.brief}
</brief>

TASK
Produce exactly 3 variants of this asset for the ${payload.channel} channel,
each at a distinct, clearly different strategic angle:
- pain-led: opens on the audience's problem
- proof-led: opens on evidence / results / social proof
- contrarian: opens by challenging a common assumption in the category

Each variant must be a genuinely different piece of writing, not a reworded
version of the same sentence. Label each with its "angle" field exactly as
above. Respect the channel constraints. Do not use any banned words.`;

  if (payload.refine) {
    return `${base}

REFINEMENT REQUEST
The user has already seen a draft and asked for a change. Apply this
instruction to the prior text below, keeping it within brand voice and the
channel constraints above.

Instruction: "${payload.refine.instruction}"

<prior_text>
${payload.refine.priorText}
</prior_text>`;
  }

  return base;
}

export function buildImagePrompt(
  kernel: BrandKernel,
  visualKit: VisualKit,
  briefText: string,
): string {
  return `Generate a single on-brand marketing image for ${kernel.name}.

VISUAL KIT
Palette: ${visualKit.palette.join(', ')}
Style reference: ${visualKit.styleFragment}
Logo safe-area rules: ${visualKit.logoSafeArea}

BRIEF
<brief>
${briefText}
</brief>

Match the palette and style described above. If reference images are
supplied alongside this prompt, treat them as the ground truth for brand
look-and-feel and prioritise visual consistency with them over the text
description. Do not include any text/lettering in the image unless the brief
explicitly asks for it.`;
}

// Re-export for callers that only need the type, keeps prompt.ts self-contained
export type { RefineInstruction, Channel, CopywriterPayload };